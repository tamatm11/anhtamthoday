/**
 * PaddleOCR-VL markdown → authoring DSL importer (pilot).
 *
 *   npx tsx scripts/import-paddle-md.ts extract <markdown> [outDir]
 *   npx tsx scripts/import-paddle-md.ts build   [outDir]
 *
 * `extract` parses the markdown, links figures to locally-downloaded images,
 * and emits a difficulty.csv (with draft levels) for review in ChatGPT.
 * `build` ingests difficulty.filled.csv + overrides.json, generates the
 * authoring DSL, and round-trips it through parseAuthoringSource (0 errors
 * required). No database access — DSL is written to disk for human review and
 * paste-in / later programmatic import once a service-role key + R2 exist.
 */
import {
  mkdir,
  readFile,
  writeFile,
  access,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parsePaddleMarkdown,
  type ParsedExam,
  type PaddleQuestion,
} from '../src/lib/authoring/paddleMd';
import { parseAuthoringSource } from '../src/lib/authoring/parser';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DEFAULT_OUT = 'artifacts/import/an-duong-hp';
const R2_PLACEHOLDER_HOST = 'https://pending-r2.local';

// Claude's draft difficulty per question key (ChatGPT refines these).
const DRAFT_DIFFICULTY: Record<string, number> = {
  'I-1': 1, 'I-2': 1, 'I-3': 1, 'I-4': 2, 'I-5': 2, 'I-6': 3,
  'I-7': 1, 'I-8': 2, 'I-9': 2, 'I-10': 2, 'I-11': 2, 'I-12': 1,
  'II-1': 3, 'II-2': 3, 'II-3': 3, 'II-4': 4,
  'III-1': 3, 'III-2': 1, 'III-3': 4, 'III-4': 4, 'III-5': 4, 'III-6': 1,
};

// Answer key derived by reading the worked solutions. Human review still
// required — these seed overrides.json so the reviewer can correct them.
const DEFAULT_OVERRIDES = {
  optionCorrect: {
    'I-1': 'C', 'I-2': 'C', 'I-3': 'B', 'I-4': 'C', 'I-5': 'C', 'I-6': 'B',
    'I-7': 'D', 'I-8': 'B', 'I-9': 'B', 'I-10': 'B', 'I-11': 'B', 'I-12': 'C',
  } as Record<string, string>,
  statements: {
    'II-2': { a: false, b: false, c: true, d: true },
  } as Record<string, Record<string, boolean>>,
  // Full statement replacement when the OCR mangled the a/b/c/d split.
  statementsContent: {
    'II-4': [
      { label: 'a', content: 'Hàm số đồng biến trên khoảng $(0;+\\infty)$.', correct: false },
      { label: 'b', content: 'Đồ thị hàm số có đường tiệm cận đứng là $x = 1$.', correct: false },
      { label: 'c', content: 'Hàm số có thể viết lại dưới dạng $f(x)=\\frac{1}{3}x+1+\\frac{d}{x+1}$, với $d \\in \\mathbb{R}$.', correct: true },
      { label: 'd', content: 'Theo khảo sát, tổng doanh thu được mô tả bằng hàm số $R(x) = x^{2} + 2x$ và lợi nhuận khi bán 200 sản phẩm là 5250 USD. Khi chi phí nhỏ nhất, số sản phẩm (làm tròn) là 25 sản phẩm.', correct: false },
    ],
  } as Record<string, Array<{ label: string; content: string; correct: boolean }>>,
  shortAnswer: {
    'III-1': '30',
  } as Record<string, string>,
};

type RawManifestEntry = {
  url: string;
  file?: string;
  bytes?: number;
  contentType?: string;
  md5?: string;
  error?: string;
};

type ImageManifestEntry = {
  key: string;
  scope: 'question' | 'solution';
  url: string;
  alt: string;
  localFile: string | null;
  publicUrl: string | null; // filled once uploaded to R2
};

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function slugFromFile(file: string) {
  return path
    .basename(file)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function preview(text: string, max = 160) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Detect the true image MIME from magic bytes (BCE serves octet-stream). */
function sniffImage(buf: Buffer): { ext: string; contentType: string } {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: 'png', contentType: 'image/png' };
  }
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { ext: 'webp', contentType: 'image/webp' };
  }
  return { ext: 'jpg', contentType: 'image/jpeg' };
}

/**
 * Download every distinct image URL into <outDir>/raw, sniffing the real MIME.
 * Idempotent: URLs already present in the existing raw-manifest are skipped.
 */
async function downloadImages(
  urls: string[],
  outDir: string,
): Promise<RawManifestEntry[]> {
  const rawDir = path.join(outDir, 'raw');
  await mkdir(rawDir, { recursive: true });
  const manifestPath = path.join(rawDir, 'raw-manifest.json');

  const existing = new Map<string, RawManifestEntry>();
  if (await exists(manifestPath)) {
    const prior = JSON.parse(await readFile(manifestPath, 'utf8')) as RawManifestEntry[];
    for (const entry of prior) existing.set(entry.url, entry);
  }

  const manifest: RawManifestEntry[] = [];
  let downloaded = 0;
  for (const [i, url] of urls.entries()) {
    const prior = existing.get(url);
    if (prior?.file && (await exists(path.join(rawDir, prior.file)))) {
      manifest.push(prior);
      continue;
    }
    const idx = String(i + 1).padStart(2, '0');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const { ext, contentType } = sniffImage(buf);
      const md5 = createHash('md5').update(buf).digest('hex');
      const file = `${idx}_${md5.slice(0, 10)}.${ext}`;
      await writeFile(path.join(rawDir, file), buf);
      manifest.push({ url, file, bytes: buf.length, contentType, md5 });
      downloaded += 1;
    } catch (err) {
      manifest.push({ url, error: String(err) });
      console.warn(`  ! image download failed: ${url} (${err})`);
    }
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Images: ${manifest.length} total, ${downloaded} newly downloaded → ${rawDir}`);
  return manifest;
}

// ---------------------------------------------------------------------------
// extract
// ---------------------------------------------------------------------------

async function extract(markdownPath: string, outDir: string) {
  const markdown = await readFile(markdownPath, 'utf8');
  const title = path.basename(markdownPath).replace(/\.[^.]+$/, '');
  const parsed = parsePaddleMarkdown(markdown, title);

  await mkdir(outDir, { recursive: true });

  // Download figures locally (before the BCE signed links expire) and link them.
  const rawManifest = await downloadImages(parsed.imageUrls, outDir);
  const rawByUrl = new Map(rawManifest.map((entry) => [entry.url, entry]));

  const imageManifest: ImageManifestEntry[] = [];
  for (const question of parsed.questions) {
    for (const image of question.images) {
      const raw = rawByUrl.get(image.url);
      imageManifest.push({
        key: question.key,
        scope: image.scope,
        url: image.url,
        alt: image.alt,
        localFile: raw?.file ? path.join('raw', raw.file) : null,
        publicUrl: null,
      });
    }
  }

  await writeFile(
    path.join(outDir, 'parsed.json'),
    JSON.stringify(parsed, null, 2),
    'utf8',
  );
  await writeFile(
    path.join(outDir, 'images.manifest.json'),
    JSON.stringify(imageManifest, null, 2),
    'utf8',
  );

  // overrides.json (seeded once, never clobbered).
  const overridesPath = path.join(outDir, 'overrides.json');
  if (!(await exists(overridesPath))) {
    await writeFile(overridesPath, JSON.stringify(DEFAULT_OVERRIDES, null, 2), 'utf8');
  }
  const overrides = JSON.parse(await readFile(overridesPath, 'utf8')) as Overrides;

  // difficulty.csv with draft levels for the ChatGPT review gate.
  const header = 'key,part,type,content_preview,difficulty';
  const rows = parsed.questions.map((q) => {
    const draft = DRAFT_DIFFICULTY[q.key] ?? 2;
    return [
      q.key,
      q.part,
      q.type,
      csvEscape(preview(q.content)),
      String(draft),
    ].join(',');
  });
  await writeFile(
    path.join(outDir, 'difficulty.csv'),
    [header, ...rows].join('\n') + '\n',
    'utf8',
  );

  await writeFile(
    path.join(outDir, 'difficulty.prompt.txt'),
    difficultyPrompt(),
    'utf8',
  );

  // Complete, self-contained guide to hand to ChatGPT (full content + answers).
  await writeFile(
    path.join(outDir, 'difficulty.guide.md'),
    renderGuide(parsed, overrides),
    'utf8',
  );

  // Console summary + review flags.
  console.log(`\nParsed ${parsed.questions.length} questions from "${parsed.title}".`);
  console.log(`Distinct image URLs: ${parsed.imageUrls.length}`);
  const flagged = parsed.questions.filter((q) => q.flags.length > 0);
  if (flagged.length) {
    console.log(`\nReview flags:`);
    for (const q of flagged) console.log(`  ${q.key.padEnd(7)} ${q.flags.join(', ')}`);
  }
  console.log(`\nWrote: parsed.json, images.manifest.json, overrides.json, difficulty.csv, difficulty.prompt.txt, difficulty.guide.md`);
  console.log(`Next: send difficulty.guide.md to ChatGPT → save difficulty.filled.csv, then run build.`);
}

const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'Nhận biết',
  2: 'Thông hiểu',
  3: 'Vận dụng',
  4: 'Vận dụng cao',
};

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm nhiều lựa chọn',
  true_false: 'Đúng / Sai',
  short_answer: 'Trả lời ngắn',
  essay: 'Tự luận',
};

/** A complete, self-contained markdown to hand to ChatGPT for difficulty rating. */
function renderGuide(parsed: ParsedExam, overrides: Overrides): string {
  const out: string[] = [];
  out.push('# Đánh giá MỨC ĐỘ câu hỏi — KSCL THPT An Dương (Hải Phòng), Toán 2026');
  out.push('');
  out.push('## Nhiệm vụ');
  out.push(
    'Bạn là giáo viên Toán THPT giàu kinh nghiệm. Hãy đánh giá **mức độ nhận thức** của',
  );
  out.push('TỪNG câu dưới đây theo thang 4 mức của Bộ GD&ĐT:');
  out.push('');
  out.push('- **1 = Nhận biết** — nhớ/nhận ra kiến thức; đọc trực tiếp đồ thị/BBT; áp dụng công thức 1 bước.');
  out.push('- **2 = Thông hiểu** — hiểu bản chất, biến đổi 1–2 bước, giải thích.');
  out.push('- **3 = Vận dụng** — ghép nhiều bước/khái niệm để giải quyết.');
  out.push('- **4 = Vận dụng cao** — mô hình hoá thực tế, tối ưu, chứng minh phức tạp.');
  out.push('');
  out.push('Mỗi câu đã kèm **mức độ DRAFT** (AI đề xuất). Hãy xem lại và CHỈNH nếu cần.');
  out.push('Đề gồm: Phần I (12 câu trắc nghiệm), Phần II (4 câu Đúng/Sai), Phần III (6 câu trả lời ngắn).');
  out.push('');
  out.push('## Cách trả về (QUAN TRỌNG)');
  out.push('Trả về DUY NHẤT một khối CSV: giữ nguyên cột `key`, chỉ điền/sửa cột `difficulty` (số 1–4).');
  out.push('Lưu kết quả thành tệp `difficulty.filled.csv`.');
  out.push('');
  out.push('```csv');
  out.push('key,difficulty');
  for (const q of parsed.questions) {
    out.push(`${q.key},${DRAFT_DIFFICULTY[q.key] ?? 2}`);
  }
  out.push('```');
  out.push('');
  out.push('---');
  out.push('');
  out.push('## Danh sách 22 câu hỏi (nội dung đầy đủ)');

  for (const q of parsed.questions) {
    const draft = DRAFT_DIFFICULTY[q.key] ?? 2;
    out.push('');
    out.push(
      `### ${q.key} · ${TYPE_LABELS[q.type] ?? q.type} · *(draft: ${draft} – ${DIFFICULTY_LABELS[draft]})*`,
    );
    out.push('');
    out.push(`**Nội dung.** ${normalizeContent(q.content) || '(thiếu nội dung)'}`);
    if (q.images.length > 0) {
      out.push('');
      out.push(`> 🖼️ Câu có kèm **${q.images.length} hình minh hoạ** (đồ thị/hình vẽ/BBT).`);
    }

    if (q.type === 'multiple_choice') {
      const correct = overrides.optionCorrect[q.key] ?? q.optionCorrect;
      out.push('');
      for (const option of q.options) {
        const mark = option.label === correct ? ' ✅' : '';
        out.push(`- **${option.label}.** ${option.content}${mark}`);
      }
    } else if (q.type === 'true_false') {
      const full = overrides.statementsContent[q.key];
      const verdict = overrides.statements[q.key];
      const statements = full ?? q.statements;
      out.push('');
      for (const s of statements) {
        const correct =
          verdict?.[s.label] ??
          ('correct' in s && typeof s.correct === 'boolean' ? s.correct : null);
        const tag = correct === true ? '✅ Đúng' : correct === false ? '❌ Sai' : '❓';
        out.push(`- **${s.label})** ${s.content} — *${tag}*`);
      }
    } else if (q.type === 'short_answer') {
      const answer = overrides.shortAnswer[q.key] ?? q.answer;
      out.push('');
      out.push(`**Đáp án.** ${answer ?? '(cần soát)'}`);
    }
  }
  out.push('');
  return out.join('\n');
}

function difficultyPrompt() {
  return [
    'Bạn là giáo viên Toán THPT. Dưới đây là bảng CSV các câu hỏi của một đề thi thử',
    'TN THPT 2026 (cột content_preview là trích nội dung). Hãy đánh giá MỨC ĐỘ từng câu',
    'theo thang 4 mức của Bộ GD&ĐT và ĐIỀN vào cột "difficulty" bằng SỐ:',
    '  1 = Nhận biết, 2 = Thông hiểu, 3 = Vận dụng, 4 = Vận dụng cao.',
    'Yêu cầu: giữ NGUYÊN các cột key,part,type,content_preview; chỉ sửa cột difficulty.',
    'Trả về đúng định dạng CSV (có dòng header), lưu thành difficulty.filled.csv.',
    'Gợi ý: Phần I (multiple_choice) thường 1–2; Phần II (true_false) 3; Phần III',
    '(short_answer) thường 3–4. Cột difficulty hiện có sẵn DRAFT, hãy điều chỉnh nếu cần.',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

type Overrides = typeof DEFAULT_OVERRIDES;

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field);
      field = '';
      if (record.some((c) => c !== '')) rows.push(record);
      record = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || record.length) {
    record.push(field);
    if (record.some((c) => c !== '')) rows.push(record);
  }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((cols) =>
    Object.fromEntries(header.map((key, idx) => [key.trim(), (cols[idx] ?? '').trim()])),
  );
}

/** Convert a PaddleOCR HTML table into a KaTeX array block. */
function htmlTableToKatexArray(html: string): string {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((tr) =>
    [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((td) =>
      td[1].replace(/<[^>]+>/g, '').replace(/\$/g, '').replace(/\s+/g, ' ').trim(),
    ),
  );
  if (rows.length === 0) return '';
  const cols = Math.max(...rows.map((r) => r.length));
  const colSpec = `|${'c|'.repeat(cols)}`;
  const body = rows
    .map((r) => {
      const cells = Array.from({ length: cols }, (_, i) => r[i] ?? '');
      return cells.map((c) => `\\text{${c}}`).join(' & ');
    })
    .join(' \\\\\n\\hline\n');
  return `$$\\begin{array}{${colSpec}}\n\\hline\n${body} \\\\\n\\hline\n\\end{array}$$`;
}

/** Replace HTML tables in content with KaTeX arrays. */
function normalizeContent(content: string): string {
  let out = content.replace(/<table[\s\S]*?<\/table>/g, (table) => `\n${htmlTableToKatexArray(table)}\n`);
  out = out.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

function escapeBraces(value: string) {
  return value.replace(/[{}]/g, '');
}

function imageMacro(
  question: PaddleQuestion,
  manifest: ImageManifestEntry[],
): string {
  const image = question.images[0];
  if (!image) return '';
  const entry = manifest.find(
    (m) => m.key === question.key && m.url === image.url && m.scope === 'question',
  );
  const url =
    entry?.publicUrl ??
    `${R2_PLACEHOLDER_HOST}/${entry?.localFile?.replace(/\\/g, '/') ?? slugFromFile(image.url)}`;
  return `\n\\image[alt={${escapeBraces(image.alt)}}]{${url}}\n`;
}

function buildQuestionDsl(
  question: PaddleQuestion,
  overrides: Overrides,
  manifest: ImageManifestEntry[],
): { dsl: string; issues: string[] } {
  const issues: string[] = [];
  const difficulty = question.difficulty ?? 2;
  const attrs = [`type=${question.type}`, `difficulty=${difficulty}`, `code={${question.key}}`];
  const content = normalizeContent(question.content) || '(Nội dung cần bổ sung)';
  const img = imageMacro(question, manifest);

  const parts: string[] = [`\\begin{question}[${attrs.join(',')}]`, content, img];

  if (question.type === 'multiple_choice') {
    const correct = overrides.optionCorrect[question.key] ?? question.optionCorrect;
    if (!correct) issues.push('MC correct option unknown');
    for (const option of question.options) {
      const flag = option.label === correct ? '[correct,' : '[';
      parts.push(
        `\n\\begin{choice}${flag}label=${option.label}]\n${option.content || '(trống)'}\n\\end{choice}`,
      );
    }
  } else if (question.type === 'true_false') {
    const fullOverride = overrides.statementsContent[question.key];
    const verdictOverride = overrides.statements[question.key];
    const statements = fullOverride ?? question.statements;
    for (const statement of statements) {
      const overridden =
        'correct' in statement && typeof statement.correct === 'boolean'
          ? statement.correct
          : undefined;
      const correct = verdictOverride?.[statement.label] ?? overridden ?? statement.correct;
      if (correct === null || correct === undefined) {
        issues.push(`TF ${statement.label} verdict unknown`);
      }
      parts.push(
        `\n\\begin{statement}[correct=${correct === true},label=${statement.label}]\n${statement.content || '(trống)'}\n\\end{statement}`,
      );
    }
  } else if (question.type === 'short_answer') {
    const answer = overrides.shortAnswer[question.key] ?? question.answer;
    if (!answer) issues.push('short answer unknown');
    parts.push(`\n\\answer{${escapeBraces(answer ?? '')}}`);
  }

  parts.push('\n\\end{question}');
  return { dsl: parts.filter(Boolean).join('\n'), issues };
}

async function build(outDir: string) {
  const parsed = JSON.parse(
    await readFile(path.join(outDir, 'parsed.json'), 'utf8'),
  ) as ParsedExam;
  const manifest = JSON.parse(
    await readFile(path.join(outDir, 'images.manifest.json'), 'utf8'),
  ) as ImageManifestEntry[];
  const overrides = JSON.parse(
    await readFile(path.join(outDir, 'overrides.json'), 'utf8'),
  ) as Overrides;

  // Difficulty: prefer the ChatGPT-reviewed file, fall back to drafts.
  const filledPath = path.join(outDir, 'difficulty.filled.csv');
  const draftPath = path.join(outDir, 'difficulty.csv');
  const usingFilled = await exists(filledPath);
  const csv = parseCsv(await readFile(usingFilled ? filledPath : draftPath, 'utf8'));
  const difficultyByKey = new Map(csv.map((row) => [row.key, Number(row.difficulty)]));
  if (!usingFilled) {
    console.warn('! difficulty.filled.csv not found — using draft levels from difficulty.csv.');
  }
  for (const q of parsed.questions) {
    const d = difficultyByKey.get(q.key);
    if (!d || ![1, 2, 3, 4].includes(d)) {
      throw new Error(`Invalid/missing difficulty for ${q.key}: ${d}`);
    }
    q.difficulty = d;
  }

  await mkdir(path.join(outDir, 'dsl'), { recursive: true });
  const report: Array<{ key: string; ok: boolean; issues: string[]; errors: string[] }> = [];
  const combined: string[] = [];

  for (const question of parsed.questions) {
    const { dsl, issues } = buildQuestionDsl(question, overrides, manifest);
    const result = parseAuthoringSource(dsl, 'question');
    const errors = result.errors.map((e) => `${e.line}:${e.column} ${e.message}`);
    report.push({ key: question.key, ok: errors.length === 0, issues, errors });
    await writeFile(path.join(outDir, 'dsl', `${question.key}.tex`), dsl, 'utf8');
    combined.push(`% ===== ${question.key} (${question.type}, difficulty=${question.difficulty}) =====\n${dsl}`);
  }

  await writeFile(path.join(outDir, 'dsl', '_combined.tex'), combined.join('\n\n'), 'utf8');
  await writeFile(path.join(outDir, 'build-report.json'), JSON.stringify(report, null, 2), 'utf8');

  const failed = report.filter((r) => !r.ok);
  const withIssues = report.filter((r) => r.issues.length > 0);
  console.log(`\nBuilt ${report.length} DSL files → ${path.join(outDir, 'dsl')}`);
  console.log(`Round-trip parse: ${report.length - failed.length}/${report.length} clean.`);
  if (withIssues.length) {
    console.log(`\nContent issues (need reviewer attention):`);
    for (const r of withIssues) console.log(`  ${r.key.padEnd(7)} ${r.issues.join('; ')}`);
  }
  if (failed.length) {
    console.log(`\nPARSE ERRORS (must fix before import):`);
    for (const r of failed) console.log(`  ${r.key.padEnd(7)} ${r.errors.join(' | ')}`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll DSL round-trips with 0 parse errors. ✅`);
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'extract') {
    const markdownPath = rest[0];
    const outDir = path.resolve(ROOT, rest[1] ?? DEFAULT_OUT);
    if (!markdownPath) throw new Error('Usage: extract <markdown> [outDir]');
    await extract(markdownPath, outDir);
  } else if (command === 'build') {
    const outDir = path.resolve(ROOT, rest[0] ?? DEFAULT_OUT);
    await build(outDir);
  } else {
    console.error('Usage:');
    console.error('  npx tsx scripts/import-paddle-md.ts extract <markdown> [outDir]');
    console.error('  npx tsx scripts/import-paddle-md.ts build   [outDir]');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
