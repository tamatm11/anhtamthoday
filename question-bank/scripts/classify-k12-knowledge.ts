import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type ExamIndexEntry = {
  ordinal: number;
  title: string;
  directory: string;
  flags?: string[];
};

type ParsedQuestion = {
  key: string;
  part: string;
  indexInPart: number;
  type: 'multiple_choice' | 'true_false' | 'short_answer' | string;
  content: string;
  options?: Array<{ label: string; content: string }>;
  statements?: Array<{ label: string; content: string; correct?: boolean | null }>;
  answer?: string | null;
  explanation?: string | null;
  flags?: string[];
};

type ParsedExam = {
  title: string;
  questions: ParsedQuestion[];
};

type TaxonomyEntry = {
  code: string;
  title: string;
  level: number;
  parent: string | null;
};

type Rule = {
  code: string;
  name: string;
  patterns: RegExp[];
  weight: number;
};

type OutsideRule = {
  topic: string;
  name: string;
  patterns: RegExp[];
  weight: number;
};

type ClassificationRow = {
  examOrdinal: number;
  examTitle: string;
  examDirectory: string;
  questionKey: string;
  part: string;
  questionIndex: number;
  questionType: string;
  questionTag: 'TN4' | 'DS' | 'TLN' | 'TL';
  maxScore: number;
  cognitiveLevel: 'NB' | 'TH' | 'VD' | 'VDC';
  difficulty: 1 | 2 | 3 | 4;
  knowledgeCode: string | null;
  knowledgeTitle: string | null;
  knowledgeParent: string | null;
  chapterCode: string | null;
  chapterTitle: string | null;
  inFramework: boolean;
  outsideTopic: string | null;
  outsideTitle: string | null;
  confidence: number;
  matchedSignals: string[];
  reviewFlags: string[];
  contentPreview: string;
};

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_BASE = path.join(ROOT, 'artifacts', 'import', 'toan-2026-resplit-v4');
const DEFAULT_TAXONOMY = path.join(ROOT, 'khung-phan-loai-kien-thuc-toan-12-ket-noi.md');

const SCORE_BY_TYPE: Record<string, number> = {
  multiple_choice: 0.25,
  true_false: 1,
  short_answer: 0.5,
};

const IN_FRAME_RULES: Rule[] = [
  r('C5.B14.5', 'distance point-plane', 130, /khoang cach[^.]{0,90}(diem|[a-z]\().{0,90}mat phang/, /d\s*\(.{0,50},\s*\(.{1,20}\)\s*\)/),
  r('C5.B16.3', 'angle plane-plane', 128, /goc giua hai mat phang/, /goc.{0,50}mat phang.{0,50}mat phang/),
  r('C5.B16.2', 'angle line-plane', 128, /goc giua duong thang va mat phang/, /goc.{0,50}duong thang.{0,50}mat phang/),
  r('C5.B16.1', 'angle line-line', 126, /goc giua hai duong thang/, /goc.{0,50}duong thang.{0,50}duong thang/),
  r('C5.B17.2', 'sphere application', 125, /mat cau.{0,120}(thuc te|tam bao phu|radar|anten|ve tinh)/),
  r('C5.B17.1', 'sphere equation', 122, /mat cau/, /tam\s*[iabc]\b.{0,50}ban kinh/, /phuong trinh.{0,60}cau/),
  r('C5.B15.3', 'relative lines in Oxyz', 121, /vi tri tuong doi.{0,80}duong thang/, /duong thang.{0,80}(cheo nhau|cat nhau|trung nhau|song song)/),
  r('C5.B15.2', 'perpendicular lines in Oxyz', 120, /hai duong thang vuong goc/, /duong thang.{0,70}vuong goc.{0,70}duong thang/),
  r('C5.B15.1', 'line equation in Oxyz', 118, /phuong trinh.{0,70}duong thang/, /duong thang.{0,70}(tham so|chinh tac|di qua).{0,90}(oxyz|toa do|vec|vecto)/),
  r('C5.B14.4', 'parallel perpendicular planes', 117, /hai mat phang.{0,80}(vuong goc|song song)/, /mat phang.{0,80}(vuong goc|song song).{0,80}mat phang/),
  r('C5.B14.3', 'build plane equation', 116, /lap phuong trinh.{0,40}mat phang/, /mat phang.{0,70}di qua.{0,90}(diem|duong thang)/),
  r('C5.B14.2', 'plane equation', 114, /phuong trinh.{0,70}mat phang/, /mat phang.{0,60}co phuong trinh/),
  r('C5.B14.1', 'plane normal vector', 112, /vecto phap tuyen/, /vec ?to phap tuyen/, /cap vecto chi phuong/),

  r('C4.B13.2', 'integral volume', 110, /the tich.{0,80}(vat the|khoi tron xoay|tron xoay)/, /quay quanh.{0,50}(truc|ox|oy)/),
  r('C4.B13.1', 'integral area', 109, /dien tich.{0,80}hinh phang/, /hinh phang.{0,100}gioi han/, /dien tich.{0,80}gioi han/),
  r('C4.B11.3', 'common antiderivatives', 107, /nguyen ham.{0,80}(luong giac|sin|cos|tan|e\^|log|ln|mu)/),
  r('C4.B11.2', 'antiderivative properties', 106, /tinh chat.{0,50}nguyen ham/),
  r('C4.B11.1', 'antiderivative concept', 105, /nguyen ham/, /ho nguyen ham/),
  r('C4.B12.2', 'integral properties', 104, /tinh chat.{0,50}tich phan/),
  r('C4.B12.1', 'integral concept', 103, /tich phan/, /\\int/),

  r('C6.B19.2', 'bayes', 101, /bayes/, /xac suat.{0,80}nguoc/),
  r('C6.B19.1', 'total probability', 100, /xac suat toan phan/, /cong thuc toan phan/),
  r('C6.B18.2', 'multiplication rule probability', 99, /cong thuc nhan xac suat/, /p\(.{0,20}\)\s*p\(.{0,20}\|.{0,20}\)/),
  r('C6.B18.1', 'conditional probability', 98, /xac suat co dieu kien/, /p\(.{0,30}\|.{0,30}\)/, /biet rang.{0,120}xac suat/),

  r('CD1.B2.2', 'binomial distribution', 97, /phan bo nhi thuc/, /bien ngau nhien.{0,80}nhi thuc/),
  r('CD1.B2.1', 'bernoulli repeated trials', 96, /bernoulli/, /phep thu lap/, /lap lai doc lap/),
  r('CD1.B1.2', 'random variable characteristics', 95, /bien ngau nhien.{0,120}(ky vong|phuong sai|do lech chuan)/, /bang phan bo xac suat.{0,120}(ky vong|phuong sai|do lech chuan)/),
  r('CD1.B1.1', 'discrete random variable', 94, /bien ngau nhien roi rac/, /bang phan bo xac suat/),

  r('C3.B10.2', 'risk via variance', 92, /rui ro.{0,80}(phuong sai|do lech chuan)/),
  r('C3.B10.1', 'variance standard deviation grouped data', 91, /phuong sai/, /do lech chuan/),
  r('C3.B9.2', 'interquartile range grouped data', 90, /khoang tu phan vi/, /\bq_?1\b|\bq_?3\b|tu phan vi/),
  r('C3.B9.1', 'range grouped data', 89, /khoang bien thien/),

  r('CD3.B7.3', 'personal finance plan', 87, /ke hoach tai chinh ca nhan/),
  r('CD3.B7.2', 'investment problem', 86, /dau tu.{0,120}(loi nhuan|rui ro|co phieu|trai phieu)/),
  r('CD3.B7.1', 'investment concept', 85, /dau tu tai chinh/),
  r('CD3.B6.2', 'loan debt', 84, /vay no|tra gop|khoan vay|du no/),
  r('CD3.B6.1', 'credit card', 83, /the tin dung/),
  r('CD3.B5.3', 'inflation', 82, /lam phat/),
  r('CD3.B5.2', 'interest', 81, /lai suat|lai kep|lai don/),
  r('CD3.B5.1', 'money', 80, /tien te/),

  r('CD2.B3.2', 'linear programming polygon', 78, /quy hoach tuyen tinh.{0,120}(mien da giac|mien chap nhan)/),
  r('CD2.B3.1', 'linear programming two variables', 77, /quy hoach tuyen tinh/, /ham muc tieu/),
  r('CD2.B4.2', 'economic optimization', 76, /toi uu.{0,120}(kinh te|doanh thu|loi nhuan|chi phi)/, /(doanh thu|loi nhuan|chi phi).{0,120}(lon nhat|nho nhat|toi da|toi thieu)/),
  r('CD2.B4.1', 'real optimization', 75, /toi uu.{0,120}thuc tien/),

  r('C1.B5.1', 'rate of change', 74, /toc do thay doi/, /van toc tuc thoi/, /toc do.{0,80}tai thoi diem/),
  r('C1.B5.2', 'simple optimization', 73, /(thoi gian|quang duong|dien tich|the tich|san pham|vat lieu).{0,150}(nho nhat|lon nhat|ngan nhat|toi da|toi thieu)/),
  r('C1.B3.3', 'oblique asymptote', 72, /tiem can xien/),
  r('C1.B3.2', 'vertical asymptote', 71, /tiem can dung/),
  r('C1.B3.1', 'horizontal asymptote', 70, /tiem can ngang/),
  r('C1.B2.2', 'max min on domain', 69, /(gia tri lon nhat|gia tri nho nhat|gtln|gtnn|max|min)/, /(lon nhat|nho nhat).{0,80}(ham so|do thi|bieu thuc)/),
  r('C1.B2.1', 'max min definition', 68, /dinh nghia.{0,60}(gtln|gtnn|gia tri lon nhat|gia tri nho nhat)/),
  r('C1.B1.2', 'extrema', 67, /cuc tri|cuc dai|cuc tieu/, /diem cuc/),
  r('C1.B1.1', 'monotonicity', 66, /dong bien|nghich bien|don dieu|xet dau dao ham|bang bien thien/),
  r('C1.B4.3', 'rational graph survey', 65, /ham phan thuc/, /do thi.{0,80}phan thuc/, /y\s*=\s*\\frac/),
  r('C1.B4.2', 'cubic graph survey', 64, /ham da thuc bac ba/, /bac ba/, /x\^3/),
  r('C1.B4.1', 'function survey graph', 63, /khao sat.{0,80}ham so/, /ve do thi/, /do thi ham so/),

  r('C2.B8.3', 'coordinate vector application', 92, /toa do.{0,120}thuc tien/),
  r('C2.B8.2', 'coordinate dot product', 91, /tich vo huong.{0,120}toa do/, /(vecto|vec ?to|vec to).{0,120}tich vo huong/),
  r('C2.B8.1', 'coordinate vector operations', 90, /toa do.{0,120}(tong|hieu|nhan voi mot so|trung diem|trong tam)/),
  r('C2.B7.2', 'coordinates of point vector', 89, /toa do.{0,80}(diem|vecto|vec ?to|vec to)/),
  r('C2.B7.1', 'Oxyz coordinate system', 88, /he truc toa do|oxyz/),
  r('C2.B6.4', 'dot product angle vectors', 87, /tich vo huong|goc giua hai vec|goc giua hai vecto|goc giua hai vec to/),
  r('C2.B6.3', 'scalar vector multiplication', 86, /tich cua mot so voi mot vecto/, /nhan.{0,40}(vecto|vec ?to|vec to)/),
  r('C2.B6.2', 'vector sum difference', 85, /tong.{0,40}(vecto|vec ?to|vec to)|hieu.{0,40}(vecto|vec ?to|vec to)/, /(vecto|vec ?to|vec to) nao.{0,80}bang/, /overrightarrow/),
  r('C2.B6.1', 'spatial vector concept', 84, /vecto|vec ?to|vec to|overrightarrow/),
];

const OUTSIDE_RULES: OutsideRule[] = [
  o('OUT.MU_LOGARIT', 'Ham mu - logarit / tap xac dinh log', 100, /log|ln|e\^|a\^x|mu log|ham so mu|ham so logarit/),
  o('OUT.LUY_THUA_CAN_THUC', 'Luy thua - can thuc ngoai khung', 92, /tap xac dinh.{0,120}(\\sqrt|can bac|luy thua|x\^|\^\{)/, /rut gon.{0,120}(\\sqrt|can bac|luy thua)/, /bieu thuc.{0,120}(\\sqrt|can bac|luy thua|x\^\{?-\s*\\frac)/, /x\^\{?-\s*\\frac/),
  o('OUT.LUONG_GIAC', 'Luong giac ngoai nguyen ham/tich phan', 98, /\\sin\b|\\cos\b|\\tan\b|\\cot\b|\bsin\s*[({x0-9]|\bcos\s*[({x0-9]|\btan\s*[({x0-9]|\bcot\s*[({x0-9]|luong giac/),
  o('OUT.GIOI_HAN', 'Gioi han', 96, /\\lim|gioi han/),
  o('OUT.DAO_HAM_CO_BAN', 'Dao ham co ban / tiep tuyen', 95, /f'\(|dao ham|tiep tuyen|he so goc/),
  o('OUT.CAP_SO', 'Cap so cong - cap so nhan', 94, /cap so cong|cap so nhan|cong boi|so hang tong quat/),
  o('OUT.TO_HOP_XAC_SUAT_CO_BAN', 'To hop / xac suat co ban', 93, /hoan vi|chinh hop|to hop|xac suat|khong gian mau|bien co/),
  o('OUT.THONG_KE_KHAC', 'Thong ke ngoai khung phan tan', 92, /trung vi|so trung binh|mau so lieu|tan so|tan suat|mot cua mau|so lieu ghep nhom|so hoc sinh|so cong nhan|muc thuong/),
  o('OUT.HINH_HOC_KHONG_GIAN_CO_DIEN', 'Hinh hoc khong gian co dien', 91, /hinh chop|lang tru|khoi chop|khoi lang tru|khoi non|khoi tru|khoi cau|song song|vuong goc|khoang cach giua hai duong/),
  o('OUT.HINH_OXY', 'Phuong phap toa do Oxy / conic', 90, /parabol|duong tron|elip|hyperbol|oxy/),
  o('OUT.SO_PHUC', 'So phuc', 89, /so phuc|modun|phan thuc phuc/),
  o('OUT.TAP_HOP_MENH_DE', 'Tap hop / menh de ngoai khung', 88, /tap con|menh de|tap hop/),
  o('OUT.PHUONG_TRINH_BAT_PHUONG_TRINH', 'Phuong trinh / bat phuong trinh ngoai khung', 80, /phuong trinh|bat phuong trinh|nghiem/),
];

function r(code: string, name: string, weight: number, ...patterns: RegExp[]): Rule {
  return { code, name, weight, patterns };
}

function o(topic: string, name: string, weight: number, ...patterns: RegExp[]): OutsideRule {
  return { topic, name, weight, patterns };
}

function fold(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function csv(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function preview(text: string, max = 180) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}...` : flat;
}

function parseTaxonomy(markdown: string) {
  const entries = new Map<string, TaxonomyEntry>();
  const chapterTitles = new Map<string, string>();
  for (const line of markdown.split(/\r?\n/)) {
    const chapter = line.match(/^###\s+((?:CD|C)\d+)\s+.+?\s+(.+)$/);
    if (chapter) {
      const code = chapter[1];
      const title = chapter[2].replace(/\s+$/g, '').trim();
      chapterTitles.set(code, title);
      entries.set(code, { code, title, level: 1, parent: null });
      continue;
    }
    const row = line.match(/^\|\s*(?:\*\*)?((?:CD|C)\d+\.B\d+(?:\.\d+)?)(?:\*\*)?\s*\|\s*(?:\*\*)?(.+?)(?:\*\*)?\s*\|/);
    if (!row) continue;
    const code = row[1];
    const title = row[2].replace(/\*\*/g, '').trim();
    const parts = code.split('.');
    const parent = parts.length === 2 ? parts[0] : parts.slice(0, 2).join('.');
    entries.set(code, { code, title, level: parts.length, parent });
  }
  return { entries, chapterTitles };
}

function questionText(question: ParsedQuestion) {
  const options = question.options?.map((item) => `${item.label}. ${item.content}`).join('\n') ?? '';
  const statements = question.statements?.map((item) => `${item.label}) ${item.content}`).join('\n') ?? '';
  return [question.content, options, statements, question.answer ?? '', question.explanation ?? ''].filter(Boolean).join('\n');
}

function matchRules<T extends { patterns: RegExp[]; weight: number; name: string }>(text: string, rules: T[]) {
  return rules
    .map((rule) => {
      const hits = rule.patterns.filter((pattern) => pattern.test(text)).length;
      return { rule, hits, score: hits ? rule.weight + hits * 8 : 0 };
    })
    .filter((item) => item.hits > 0)
    .sort((a, b) => b.score - a.score || b.rule.weight - a.rule.weight);
}

function questionTag(type: string): ClassificationRow['questionTag'] {
  if (type === 'multiple_choice') return 'TN4';
  if (type === 'true_false') return 'DS';
  if (type === 'short_answer') return 'TLN';
  return 'TL';
}

function difficultyFor(question: ParsedQuestion, text: string): { level: ClassificationRow['cognitiveLevel']; difficulty: 1 | 2 | 3 | 4 } {
  let score = question.part === 'I' ? 1.35 : question.part === 'II' ? 2.45 : 3.15;
  const contentOnly = fold(question.content);
  if (/tham so|gia tri cua m|bao nhieu gia tri|so gia tri nguyen|tat ca cac gia tri|co nghiem|nghiem dung/.test(contentOnly)) score += 0.7;
  if (/thuc te|doanh thu|loi nhuan|chi phi|san pham|lai suat|vay|km|gio|phut|khao sat|hoc sinh|cong ty|xuong|nha may/.test(contentOnly)) score += 0.35;
  if (/(lon nhat|nho nhat|toi da|toi thieu|ngan nhat)/.test(contentOnly)) score += 0.25;
  if (question.type === 'true_false') score += 0.25;
  if (question.type === 'short_answer') score += 0.15;
  if (text.length > 1800) score += 0.35;
  if (text.length > 3200) score += 0.25;

  if (score < 1.85) return { level: 'NB', difficulty: 1 };
  if (score < 2.75) return { level: 'TH', difficulty: 2 };
  if (score < 3.65) return { level: 'VD', difficulty: 3 };
  return { level: 'VDC', difficulty: 4 };
}

function classifyQuestion(
  exam: ExamIndexEntry,
  parsed: ParsedExam,
  question: ParsedQuestion,
  taxonomy: ReturnType<typeof parseTaxonomy>,
): ClassificationRow {
  const rawText = questionText(question);
  const text = fold(rawText);
  const inMatches = matchRules(text, IN_FRAME_RULES);
  const outMatches = matchRules(text, OUTSIDE_RULES);
  const bestIn = inMatches[0];
  const bestOut = outMatches[0];
  const taxonomyEntry = bestIn ? taxonomy.entries.get(bestIn.rule.code) ?? null : null;
  const coordinateSignal = /oxyz|toa do|phuong trinh|tham so|chinh tac|phap tuyen|mat cau|x\s*[+-]\s*y|ax\s*\+\s*by|[xyz]\s*=/.test(text);
  const vectorSignal = /vecto|vec ?to|vec to|overrightarrow|tich vo huong/.test(text);
  const classicalGeometrySignal = /hinh chop|lang tru|tu dien|hinh hop|hinh lap phuong|mat phang\s*\([a-z]/.test(text);

  let useFramework = Boolean(bestIn);
  if (bestOut && (!bestIn || bestOut.score > bestIn.score + 20)) {
    useFramework = false;
  }
  if (bestIn?.rule.code.startsWith('C5.') && classicalGeometrySignal && !coordinateSignal) {
    useFramework = false;
  }
  if (bestIn?.rule.code.startsWith('C2.') && vectorSignal) {
    useFramework = true;
  }

  const code = useFramework && taxonomyEntry ? taxonomyEntry.code : null;
  const parent = code ? (taxonomyEntry?.parent ?? null) : null;
  const chapterCode = code?.split('.')[0] ?? null;
  const chapterTitle = chapterCode ? taxonomy.entries.get(chapterCode)?.title ?? null : null;
  const difficulty = difficultyFor(question, text);
  const matchedSignals = [
    ...inMatches.slice(0, 3).map((item) => `${item.rule.code}:${item.rule.name}`),
    ...outMatches.slice(0, 2).map((item) => `${item.rule.topic}:${item.rule.name}`),
  ];
  const confidenceBase = useFramework && bestIn
    ? Math.min(0.96, 0.52 + bestIn.hits * 0.16 + Math.max(0, bestIn.score - (bestOut?.score ?? 0)) / 220)
    : bestOut
      ? Math.min(0.9, 0.48 + bestOut.hits * 0.15)
      : 0.25;

  return {
    examOrdinal: exam.ordinal,
    examTitle: parsed.title || exam.title,
    examDirectory: exam.directory,
    questionKey: question.key,
    part: question.part,
    questionIndex: question.indexInPart,
    questionType: question.type,
    questionTag: questionTag(question.type),
    maxScore: SCORE_BY_TYPE[question.type] ?? 0,
    cognitiveLevel: difficulty.level,
    difficulty: difficulty.difficulty,
    knowledgeCode: code,
    knowledgeTitle: code ? taxonomy.entries.get(code)?.title ?? null : null,
    knowledgeParent: parent,
    chapterCode,
    chapterTitle,
    inFramework: useFramework,
    outsideTopic: useFramework ? null : bestOut?.rule.topic ?? 'OUT.UNCLASSIFIED',
    outsideTitle: useFramework ? null : bestOut?.rule.name ?? 'Chua nhan dien duoc theo khung',
    confidence: Number(confidenceBase.toFixed(3)),
    matchedSignals,
    reviewFlags: [
      ...(exam.flags ?? []).map((flag) => `EXAM_${flag}`),
      ...(question.flags ?? []).map((flag) => `QUESTION_${flag}`),
      ...(useFramework ? [] : ['OUT_OF_FRAME']),
      ...(confidenceBase < 0.58 ? ['LOW_CONFIDENCE'] : []),
    ],
    contentPreview: preview(question.content),
  };
}

function addCount<T extends string>(map: Map<T, number>, key: T, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function summarize(rows: ClassificationRow[], index: ExamIndexEntry[]) {
  const byCode = new Map<string, { count: number; score: number; title: string }>();
  const byChapter = new Map<string, { count: number; score: number; title: string }>();
  const byOutside = new Map<string, { count: number; score: number; title: string }>();
  const byType = new Map<string, number>();
  const byLevel = new Map<string, number>();
  for (const row of rows) {
    addCount(byType, row.questionTag);
    addCount(byLevel, row.cognitiveLevel);
    if (row.inFramework && row.knowledgeCode) {
      const current = byCode.get(row.knowledgeCode) ?? { count: 0, score: 0, title: row.knowledgeTitle ?? '' };
      current.count += 1;
      current.score += row.maxScore;
      byCode.set(row.knowledgeCode, current);
      const chapter = row.chapterCode ?? 'UNKNOWN';
      const chapterCurrent = byChapter.get(chapter) ?? { count: 0, score: 0, title: row.chapterTitle ?? '' };
      chapterCurrent.count += 1;
      chapterCurrent.score += row.maxScore;
      byChapter.set(chapter, chapterCurrent);
    } else {
      const outside = row.outsideTopic ?? 'OUT.UNCLASSIFIED';
      const current = byOutside.get(outside) ?? { count: 0, score: 0, title: row.outsideTitle ?? '' };
      current.count += 1;
      current.score += row.maxScore;
      byOutside.set(outside, current);
    }
  }

  const examRows = index.map((exam) => {
    const items = rows.filter((row) => row.examOrdinal === exam.ordinal);
    const inFramework = items.filter((row) => row.inFramework).length;
    const score = items.reduce((sum, row) => sum + row.maxScore, 0);
    const buckets = new Map<string, number>();
    for (const row of items) addCount(buckets, row.chapterCode ?? row.outsideTopic ?? 'OUT.UNCLASSIFIED');
    return {
      ordinal: exam.ordinal,
      title: exam.title,
      directory: exam.directory,
      questions: items.length,
      maxScore: Number(score.toFixed(2)),
      inFramework,
      outsideFramework: items.length - inFramework,
      buckets: Object.fromEntries([...buckets.entries()].sort()),
      reviewFlags: [...new Set(items.flatMap((row) => row.reviewFlags))],
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    sourceRoot: DEFAULT_BASE,
    exams: index.length,
    questions: rows.length,
    maxScore: Number(rows.reduce((sum, row) => sum + row.maxScore, 0).toFixed(2)),
    inFramework: rows.filter((row) => row.inFramework).length,
    outsideFramework: rows.filter((row) => !row.inFramework).length,
    lowConfidence: rows.filter((row) => row.reviewFlags.includes('LOW_CONFIDENCE')).length,
    byType: Object.fromEntries([...byType.entries()].sort()),
    byCognitiveLevel: Object.fromEntries([...byLevel.entries()].sort()),
    byChapter: Object.fromEntries([...byChapter.entries()].sort()),
    byKnowledgeCode: Object.fromEntries([...byCode.entries()].sort()),
    byOutsideTopic: Object.fromEntries([...byOutside.entries()].sort()),
    byExam: examRows,
  };
}

function renderMarkdown(summary: ReturnType<typeof summarize>) {
  const pct = (count: number) => `${((count / Math.max(1, summary.questions)) * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push('# Bao cao phan loai kien thuc Toan 12 KNTT');
  lines.push('');
  lines.push(`- Bo de: ${summary.exams} de`);
  lines.push(`- Tong cau: ${summary.questions}`);
  lines.push(`- Tong diem toi da quy doi: ${summary.maxScore}`);
  lines.push(`- Trong khung: ${summary.inFramework} cau (${pct(summary.inFramework)})`);
  lines.push(`- Ngoai khung: ${summary.outsideFramework} cau (${pct(summary.outsideFramework)})`);
  lines.push(`- Can soat do tin cay thap: ${summary.lowConfidence} cau`);
  lines.push('');
  lines.push('## Theo chuong trong khung');
  lines.push('| Ma | So cau | Diem toi da | Ten |');
  lines.push('|---|---:|---:|---|');
  for (const [code, item] of Object.entries(summary.byChapter)) {
    lines.push(`| ${code} | ${item.count} | ${item.score.toFixed(2)} | ${item.title} |`);
  }
  lines.push('');
  lines.push('## Ngoai khung');
  lines.push('| Nhom | So cau | Diem toi da | Ghi chu |');
  lines.push('|---|---:|---:|---|');
  for (const [code, item] of Object.entries(summary.byOutsideTopic)) {
    lines.push(`| ${code} | ${item.count} | ${item.score.toFixed(2)} | ${item.title} |`);
  }
  lines.push('');
  lines.push('## Theo muc do tu duy');
  lines.push('| Muc | So cau |');
  lines.push('|---|---:|');
  for (const [code, count] of Object.entries(summary.byCognitiveLevel)) lines.push(`| ${code} | ${count} |`);
  lines.push('');
  lines.push('## Theo tung de');
  lines.push('| De | So cau | Trong khung | Ngoai khung | Diem toi da | Flags |');
  lines.push('|---:|---:|---:|---:|---:|---|');
  for (const exam of summary.byExam) {
    lines.push(`| ${exam.ordinal} | ${exam.questions} | ${exam.inFramework} | ${exam.outsideFramework} | ${exam.maxScore.toFixed(2)} | ${exam.reviewFlags.join('; ')} |`);
  }
  lines.push('');
  lines.push('Ghi chu: DS duoc tinh diem toi da 1.0/cau theo cau truc 2025+, diem thuc te phu thuoc so menh de dung khi cham bai.');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const baseArg = process.argv.find((arg) => arg.startsWith('--base='));
  const taxonomyArg = process.argv.find((arg) => arg.startsWith('--taxonomy='));
  const outArg = process.argv.find((arg) => arg.startsWith('--out='));
  const base = path.resolve(ROOT, baseArg ? baseArg.slice('--base='.length) : DEFAULT_BASE);
  const taxonomyPath = path.resolve(ROOT, taxonomyArg ? taxonomyArg.slice('--taxonomy='.length) : DEFAULT_TAXONOMY);
  const outDir = path.resolve(ROOT, outArg ? outArg.slice('--out='.length) : base);

  const taxonomy = parseTaxonomy(await readFile(taxonomyPath, 'utf8'));
  const index = JSON.parse(await readFile(path.join(base, 'exams.index.json'), 'utf8')) as ExamIndexEntry[];
  const rows: ClassificationRow[] = [];
  for (const exam of index) {
    const parsedPath = path.join(base, exam.directory, 'parsed.json');
    const parsed = JSON.parse(await readFile(parsedPath, 'utf8')) as ParsedExam;
    for (const question of parsed.questions) rows.push(classifyQuestion(exam, parsed, question, taxonomy));
  }
  const summary = summarize(rows, index);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'knowledge-classification.json'), JSON.stringify(rows, null, 2), 'utf8');
  await writeFile(path.join(outDir, 'knowledge-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  await writeFile(path.join(outDir, 'knowledge-summary.md'), renderMarkdown(summary), 'utf8');
  const header = [
    'examOrdinal',
    'questionKey',
    'questionTag',
    'maxScore',
    'cognitiveLevel',
    'difficulty',
    'knowledgeCode',
    'knowledgeTitle',
    'chapterCode',
    'inFramework',
    'outsideTopic',
    'outsideTitle',
    'confidence',
    'reviewFlags',
    'contentPreview',
  ];
  const csvRows = rows.map((row) => [
    row.examOrdinal,
    row.questionKey,
    row.questionTag,
    row.maxScore,
    row.cognitiveLevel,
    row.difficulty,
    row.knowledgeCode,
    row.knowledgeTitle,
    row.chapterCode,
    row.inFramework,
    row.outsideTopic,
    row.outsideTitle,
    row.confidence,
    row.reviewFlags.join(';'),
    row.contentPreview,
  ].map(csv).join(','));
  await writeFile(path.join(outDir, 'knowledge-classification.csv'), `${header.join(',')}\n${csvRows.join('\n')}\n`, 'utf8');
  console.log(JSON.stringify({
    exams: summary.exams,
    questions: summary.questions,
    maxScore: summary.maxScore,
    inFramework: summary.inFramework,
    outsideFramework: summary.outsideFramework,
    lowConfidence: summary.lowConfidence,
    outDir,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
