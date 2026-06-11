import type { ExamQuestionType } from '@/lib/supabase/exam-data';

/**
 * Parser for PaddleOCR-VL markdown exports of Vietnamese THPT exams.
 *
 * The export has a dual structure: the exam body (PHẦN I/II/III) followed by a
 * "HƯỚNG DẪN GIẢI" (solutions) section that carries the answers. Question
 * numbering is inconsistent between the two halves and restarts per part, so we
 * key every question by `<part>-<positionInPart>` (e.g. `I-1`, `II-3`, `III-5`)
 * and merge the two halves by that key.
 *
 * Output is an intermediate structure (not DSL). The importer turns it into the
 * authoring DSL understood by {@link parseAuthoringSource}. Human review remains
 * mandatory — OCR noise and inferred multiple-choice keys must be verified.
 */

export type PaddlePart = 'I' | 'II' | 'III';

export const PART_TO_TYPE: Record<PaddlePart, ExamQuestionType> = {
  I: 'multiple_choice',
  II: 'true_false',
  III: 'short_answer',
};

export type PaddleImageRef = {
  url: string;
  alt: string;
  scope: 'question' | 'solution';
};

export type PaddleOption = {
  label: string;
  content: string;
};

export type PaddleStatement = {
  label: string;
  content: string;
  correct: boolean | null;
};

export type PaddleQuestion = {
  key: string;
  part: PaddlePart;
  indexInPart: number;
  type: ExamQuestionType;
  content: string;
  images: PaddleImageRef[];
  options: PaddleOption[];
  /** Correct option label inferred from the solution, or null if unknown. */
  optionCorrect: string | null;
  statements: PaddleStatement[];
  answer: string | null;
  explanation: string | null;
  difficulty: number | null;
  /** Notes for the human reviewer (low-confidence extractions). */
  flags: string[];
};

export type ParsedExam = {
  title: string;
  questions: PaddleQuestion[];
  /** Every distinct image URL seen anywhere, in document order. */
  imageUrls: string[];
};

/** Strip Vietnamese diacritics so OCR header variants match reliably. */
function deburr(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

const SOLUTION_MARKER = /H[U][O]NG\s+D[A]N\s+GI[A]I/i;
const PART_HEADER = /^#*\s*PH[A]N\s+(I{1,3})\b/i;
const QUESTION_HEADER = /^#*\s*C[a]u\s*(\d+)\s*[.:]/i;

function romanToPart(roman: string): PaddlePart | null {
  const upper = roman.toUpperCase();
  if (upper === 'I' || upper === 'II' || upper === 'III') return upper;
  return null;
}

/** Split the document into the exam half and the solution half. */
export function splitExamAndSolution(markdown: string): {
  exam: string;
  solution: string;
} {
  const lines = markdown.split('\n');
  const markerIndex = lines.findIndex((line) => SOLUTION_MARKER.test(deburr(line)));
  if (markerIndex < 0) {
    return { exam: markdown, solution: '' };
  }
  return {
    exam: lines.slice(0, markerIndex).join('\n'),
    solution: lines.slice(markerIndex + 1).join('\n'),
  };
}

type Segment = { part: PaddlePart; index: number; body: string };

/**
 * Split one half (exam or solution) into per-question segments, tracking the
 * current part header and resetting the position counter at each part.
 */
function segmentByQuestion(section: string): Segment[] {
  const lines = section.split('\n');
  const segments: Segment[] = [];
  let currentPart: PaddlePart | null = null;
  let positionInPart = 0;
  let buffer: string[] = [];

  const flush = () => {
    if (currentPart && positionInPart > 0 && buffer.length) {
      segments.push({
        part: currentPart,
        index: positionInPart,
        body: buffer.join('\n').trim(),
      });
    }
    buffer = [];
  };

  for (const line of lines) {
    // Headers are sometimes wrapped in <div> tags, so match on a de-tagged probe.
    const probe = deburr(line).replace(/<[^>]+>/g, '').trim();
    const partMatch = probe.match(PART_HEADER);
    if (partMatch) {
      flush();
      const part = romanToPart(partMatch[1]);
      if (part) {
        currentPart = part;
        positionInPart = 0;
      }
      continue;
    }

    const questionMatch = probe.match(QUESTION_HEADER);
    if (questionMatch && currentPart) {
      flush();
      positionInPart += 1;
      // Keep the text after "Câu N." on the same line (de-tagged).
      const stripped = line
        .replace(/<[^>]+>/g, '')
        .replace(/^#*\s*C[âa]u\s*\d+\s*[.:]\s*/i, '')
        .trim();
      buffer.push(stripped);
      continue;
    }

    buffer.push(line);
  }
  flush();

  return segments;
}

const IMG_TAG = /<img[^>]*\ssrc="([^"]+)"[^>]*>/g;
const ALT_ATTR = /alt="([^"]*)"/;

function extractImages(
  body: string,
  scope: PaddleImageRef['scope'],
): PaddleImageRef[] {
  const images: PaddleImageRef[] = [];
  for (const match of body.matchAll(IMG_TAG)) {
    const url = match[1];
    if (!/^https?:\/\//.test(url)) continue; // skip broken relative refs
    const alt = match[0].match(ALT_ATTR)?.[1]?.trim() || 'Hình minh hoạ';
    images.push({ url, alt: alt === 'Image' ? 'Hình minh hoạ' : alt, scope });
  }
  return images;
}

/** Remove markup that should not appear in question/option text. */
function stripMarkup(text: string): string {
  return text
    .replace(/<div[^>]*>/g, '')
    .replace(/<\/div>/g, '')
    .replace(IMG_TAG, '')
    .replace(/^#+\s*/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

const OPTION_SPLIT = /(?:^|\s)([A-D])\s*[.)]\s+/g;

/**
 * Parse A/B/C/D options from a multiple-choice body. Handles both inline
 * ("A. ... B. ... C. ...") and multi-paragraph layouts. Returns options whose
 * labels appear in strict A→D order.
 */
function parseOptions(body: string): PaddleOption[] {
  const cleaned = stripMarkup(body);
  const markers: Array<{ label: string; start: number; end: number }> = [];
  for (const match of cleaned.matchAll(OPTION_SPLIT)) {
    markers.push({
      label: match[1],
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    });
  }

  // Find the longest run that starts at A and increments A→B→C→D.
  const expected = ['A', 'B', 'C', 'D'];
  let runStart = -1;
  for (let i = 0; i < markers.length; i += 1) {
    if (markers[i].label === 'A') {
      let ok = true;
      for (let j = 1; j < expected.length; j += 1) {
        if (markers[i + j]?.label !== expected[j]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        runStart = i;
        break;
      }
    }
  }
  if (runStart < 0) return [];

  const options: PaddleOption[] = [];
  for (let j = 0; j < expected.length; j += 1) {
    const marker = markers[runStart + j];
    const next = markers[runStart + j + 1];
    const content = cleaned
      .slice(marker.end, next ? next.start : cleaned.length)
      .replace(/[.\s]+$/, '')
      .trim();
    options.push({ label: marker.label, content });
  }
  return options;
}

/** Split a body into blank-line-delimited paragraphs (images/divs removed). */
function toParagraphs(body: string): string[] {
  return body
    .replace(IMG_TAG, '')
    .replace(/<div[^>]*>/g, '')
    .replace(/<\/div>/g, '')
    .replace(/^#+\s*/gm, '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+/g, ' ').replace(/\n+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Parse a true/false body into stem + four statements. The OCR frequently drops
 * the b)/d) labels, so we treat the first paragraph as the stem and assign
 * a/b/c/d to the remaining paragraphs by position (stripping any label present).
 */
function parseTrueFalse(body: string): {
  stem: string;
  statements: PaddleStatement[];
} {
  const paras = toParagraphs(body);
  if (paras.length === 0) return { stem: '', statements: [] };
  const [stem, ...rest] = paras;
  const labels = ['a', 'b', 'c', 'd'];
  const statements = rest.map((para, index) => ({
    label: labels[index] ?? String.fromCharCode(97 + index),
    content: para.replace(/^[a-d]\s*[.)]\s*/i, '').trim(),
    correct: null as boolean | null,
  }));
  return { stem, statements };
}

/**
 * The exam stem = body with images + option region removed. Multiple-choice
 * splits before the first "A." marker; short-answer keeps the whole body.
 * (True/false stems are handled by {@link parseTrueFalse}.)
 */
function parseStem(body: string, type: ExamQuestionType): string {
  const cleaned = stripMarkup(body);
  if (type === 'multiple_choice') {
    const firstA = cleaned.search(/(?:^|\s)A\s*[.)]\s+/);
    return (firstA > 0 ? cleaned.slice(0, firstA) : cleaned).trim();
  }
  return cleaned.trim();
}

/**
 * Infer per-statement Đúng/Sai from the solution body. Matches a label
 * immediately followed by a verdict ("a) Sai", "Suy ra ý a) Đúng", "c) Đúng."),
 * ignoring working steps like "a) Vận tốc gió...". Later matches win, because
 * the verdict line usually comes after the working for that item.
 */
function parseStatementVerdicts(body: string): Map<string, boolean> {
  const verdicts = new Map<string, boolean>();
  const pattern = /([a-d])\s*[.)]\s*(Đúng|Sai)/gi;
  for (const match of body.matchAll(pattern)) {
    const label = match[1].toLowerCase();
    verdicts.set(label, deburr(match[2]).toLowerCase().startsWith('d'));
  }
  return verdicts;
}

/** Infer the multiple-choice answer from an underline marker if present. */
function parseUnderlinedAnswer(body: string): string | null {
  // e.g. "\underline{\text{C.}}" or "$ \underline{\text{C.}} $"
  const match = body.match(/\\underline\{\\text\{([A-D])\.?\}\}/);
  return match ? match[1] : null;
}

const SHORT_ANSWER = /(?:Đáp\s*số|Đáp\s*án)\s*[:：]\s*([^\n]+)/i;

/** Parse the short-answer value from a solution body. */
function parseShortAnswer(body: string): string | null {
  const match = body.match(SHORT_ANSWER);
  if (!match) return null;
  return match[1].replace(/[.\s]+$/, '').trim();
}

/** Parse the full PaddleOCR-VL markdown into the intermediate structure. */
export function parsePaddleMarkdown(markdown: string, title: string): ParsedExam {
  const { exam, solution } = splitExamAndSolution(markdown);
  const examSegments = segmentByQuestion(exam);
  const solutionSegments = segmentByQuestion(solution);

  const solutionByKey = new Map<string, Segment>();
  for (const segment of solutionSegments) {
    solutionByKey.set(`${segment.part}-${segment.index}`, segment);
  }

  const imageUrls: string[] = [];
  const seenUrls = new Set<string>();
  const recordUrls = (images: PaddleImageRef[]) => {
    for (const image of images) {
      if (!seenUrls.has(image.url)) {
        seenUrls.add(image.url);
        imageUrls.push(image.url);
      }
    }
  };

  const questions: PaddleQuestion[] = examSegments.map((segment) => {
    const key = `${segment.part}-${segment.index}`;
    const type = PART_TO_TYPE[segment.part];
    const flags: string[] = [];

    const questionImages = extractImages(segment.body, 'question');
    recordUrls(questionImages);

    let content = parseStem(segment.body, type);
    const options = type === 'multiple_choice' ? parseOptions(segment.body) : [];
    let statements: PaddleStatement[] = [];
    if (type === 'true_false') {
      const tf = parseTrueFalse(segment.body);
      content = tf.stem;
      statements = tf.statements;
    }

    const solutionSegment = solutionByKey.get(key);
    let optionCorrect: string | null = null;
    let answer: string | null = null;
    let explanation: string | null = null;

    if (solutionSegment) {
      recordUrls(extractImages(solutionSegment.body, 'solution'));
      explanation = stripMarkup(solutionSegment.body) || null;

      if (type === 'multiple_choice') {
        optionCorrect = parseUnderlinedAnswer(solutionSegment.body);
        if (!optionCorrect) flags.push('MC_ANSWER_NEEDS_REVIEW');
      } else if (type === 'true_false') {
        const verdicts = parseStatementVerdicts(solutionSegment.body);
        for (const statement of statements) {
          statement.correct = verdicts.get(statement.label) ?? null;
          if (statement.correct === null) flags.push(`TF_${statement.label}_NEEDS_REVIEW`);
        }
      } else if (type === 'short_answer') {
        answer = parseShortAnswer(solutionSegment.body);
        if (!answer) flags.push('SHORT_ANSWER_NEEDS_REVIEW');
      }
    } else {
      flags.push('NO_SOLUTION_FOUND');
    }

    if (type === 'multiple_choice' && options.length !== 4) {
      flags.push(`OPTIONS_PARSED_${options.length}`);
    }
    if (type === 'true_false' && statements.length !== 4) {
      flags.push(`STATEMENTS_PARSED_${statements.length}`);
    }

    return {
      key,
      part: segment.part,
      indexInPart: segment.index,
      type,
      content,
      images: questionImages,
      options,
      optionCorrect,
      statements,
      answer,
      explanation,
      difficulty: null,
      flags,
    };
  });

  return { title, questions, imageUrls };
}
