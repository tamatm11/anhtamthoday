import type { SupabaseClient } from '@supabase/supabase-js';

type MaybeArray<T> = T | T[] | null | undefined;

type PublishedRoomRecord = {
  id: string;
  code: string;
  name: string;
  duration_minutes: number;
  status: string;
  price_vnd: number | null;
  total_attempts_default: number | null;
  starts_at: string | null;
  ends_at: string | null;
  published_at: string | null;
  blueprint_code: string | null;
  blueprint_name: string | null;
  subject_code: string;
  subject_name: string;
};

type SubjectRecord = {
  code: string;
  name: string;
  default_duration_minutes: number;
  is_compulsory: boolean;
  is_active: boolean;
};

type QuestionOptionRecord = {
  id: string;
  seq: number;
  label: string;
  content: string;
  image_url: string | null;
  image_alt_text: string | null;
};

type TrueFalseItemRecord = {
  id: string;
  seq: number;
  label: string | null;
  content: string;
};

type QuestionAssetRecord = {
  kind: string;
  url: string;
  alt_text: string | null;
  display_order: number;
};

type QuestionRecord = {
  id: string;
  code: string;
  type: ExamQuestionType;
  content: string;
  image_url: string | null;
  question_options?: QuestionOptionRecord[] | null;
  question_true_false_items?: TrueFalseItemRecord[] | null;
  question_assets?: QuestionAssetRecord[] | null;
};

type SessionQuestionRecord = {
  id: string;
  question_seq: number;
  display_no: string | null;
  max_points: number;
  questions: MaybeArray<QuestionRecord>;
};

type SessionRecord = {
  id: string;
  status: string;
  attempt_number: number;
  started_at: string;
  due_at: string | null;
  submitted_at: string | null;
  score: number | null;
  max_score: number;
  exam_room_id: string;
};

type SessionAnswerRecord = {
  session_question_id: string;
  answer_json: unknown;
  selected_option_id: string | null;
  short_answer_text: string | null;
  is_correct: boolean | null;
  earned_points: number | null;
};

export type SubjectSummary = {
  code: string;
  name: string;
  defaultDurationMinutes: number;
  isCompulsory: boolean;
  isActive: boolean;
  openRoomCount: number;
};

export type ExamRoomSummary = {
  id: string;
  code: string;
  name: string;
  durationMinutes: number;
  priceVnd: number;
  totalAttemptsDefault: number;
  startsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  blueprintCode: string | null;
  blueprintName: string | null;
  subjectCode: string;
  subjectName: string;
};

export type ExamQuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'short_answer'
  | 'essay';

export type ExamQuestionOption = {
  id: string;
  seq: number;
  label: string;
  content: string;
  imageUrl: string | null;
  imageAltText: string | null;
};

export type ExamTrueFalseItem = {
  id: string;
  seq: number;
  label: string | null;
  content: string;
};

export type ExamSessionQuestion = {
  id: string;
  number: number;
  displayNo: string;
  maxPoints: number;
  questionId: string;
  code: string;
  type: ExamQuestionType;
  content: string;
  imageUrl: string | null;
  imageAltText: string | null;
  options: ExamQuestionOption[];
  trueFalseItems: ExamTrueFalseItem[];
};

export type ExamSessionAnswer = {
  sessionQuestionId: string;
  answerJson: unknown;
  selectedOptionId: string | null;
  shortAnswerText: string | null;
  isCorrect: boolean | null;
  earnedPoints: number | null;
};

export type ExamSessionData = {
  session: {
    id: string;
    status: string;
    attemptNumber: number;
    startedAt: string;
    dueAt: string | null;
    submittedAt: string | null;
    score: number | null;
    maxScore: number;
    examRoomId: string;
  };
  room: ExamRoomSummary | null;
  questions: ExamSessionQuestion[];
  answers: ExamSessionAnswer[];
};

function one<T>(value: MaybeArray<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function mapRoom(record: PublishedRoomRecord): ExamRoomSummary {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    durationMinutes: record.duration_minutes,
    priceVnd: record.price_vnd ?? 0,
    totalAttemptsDefault: record.total_attempts_default ?? 3,
    startsAt: record.starts_at,
    endsAt: record.ends_at,
    publishedAt: record.published_at,
    blueprintCode: record.blueprint_code,
    blueprintName: record.blueprint_name,
    subjectCode: record.subject_code,
    subjectName: record.subject_name,
  };
}

function mapQuestion(record: SessionQuestionRecord): ExamSessionQuestion | null {
  const question = one(record.questions);
  if (!question) return null;
  const primaryImage = [...(question.question_assets ?? [])]
    .filter((asset) => asset.kind === 'image')
    .sort((a, b) => a.display_order - b.display_order)
    .find((asset) => !question.image_url || asset.url === question.image_url);

  return {
    id: record.id,
    number: record.question_seq,
    displayNo: record.display_no ?? String(record.question_seq),
    maxPoints: Number(record.max_points),
    questionId: question.id,
    code: question.code,
    type: question.type,
    content: question.content,
    imageUrl: question.image_url,
    imageAltText: primaryImage?.alt_text ?? null,
    options: [...(question.question_options ?? [])]
      .sort((a, b) => a.seq - b.seq)
      .map((option) => ({
        id: option.id,
        seq: option.seq,
        label: option.label,
        content: option.content,
        imageUrl: option.image_url,
        imageAltText: option.image_alt_text,
      })),
    trueFalseItems: [...(question.question_true_false_items ?? [])]
      .sort((a, b) => a.seq - b.seq)
      .map((item) => ({
        id: item.id,
        seq: item.seq,
        label: item.label,
        content: item.content,
      })),
  };
}

export function formatPriceVnd(value: number) {
  if (value <= 0) return 'Miễn phí';

  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

export function difficultyLabel(value: number | null | undefined) {
  switch (value) {
    case 1:
      return 'Nhận biết';
    case 2:
      return 'Thông hiểu';
    case 3:
      return 'Vận dụng';
    case 4:
      return 'Vận dụng cao';
    default:
      return 'Chưa phân loại';
  }
}

export function questionTypeLabel(type: ExamQuestionType) {
  switch (type) {
    case 'multiple_choice':
      return 'Trắc nghiệm';
    case 'true_false':
      return 'Đúng/Sai';
    case 'short_answer':
      return 'Trả lời ngắn';
    case 'essay':
      return 'Tự luận';
    default:
      return 'Câu hỏi';
  }
}

export async function fetchPublishedRooms(
  supabase: SupabaseClient,
  subjectCode?: string,
) {
  let query = supabase
    .from('v_exam_rooms_full')
    .select(
      [
        'id',
        'code',
        'name',
        'duration_minutes',
        'status',
        'price_vnd',
        'total_attempts_default',
        'starts_at',
        'ends_at',
        'published_at',
        'blueprint_code',
        'blueprint_name',
        'subject_code',
        'subject_name',
      ].join(','),
    )
    .eq('status', 'published')
    .order('subject_name', { ascending: true })
    .order('published_at', { ascending: false });

  if (subjectCode) {
    query = query.eq('subject_code', subjectCode.toUpperCase());
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as unknown as PublishedRoomRecord[]).map(mapRoom);
}

export async function fetchSubjectsWithRoomCounts(supabase: SupabaseClient) {
  const [subjectsResult, rooms] = await Promise.all([
    supabase
      .from('subjects')
      .select(
        'code,name,default_duration_minutes,is_compulsory,is_active',
      )
      .eq('is_active', true)
      .order('is_compulsory', { ascending: false })
      .order('name', { ascending: true }),
    fetchPublishedRooms(supabase),
  ]);

  if (subjectsResult.error) throw subjectsResult.error;

  const roomCounts = new Map<string, number>();
  rooms.forEach((room) => {
    roomCounts.set(room.subjectCode, (roomCounts.get(room.subjectCode) ?? 0) + 1);
  });

  return ((subjectsResult.data ?? []) as unknown as SubjectRecord[]).map(
    (subject): SubjectSummary => ({
      code: subject.code,
      name: subject.name,
      defaultDurationMinutes: subject.default_duration_minutes,
      isCompulsory: subject.is_compulsory,
      isActive: subject.is_active,
      openRoomCount: roomCounts.get(subject.code) ?? 0,
    }),
  );
}

export async function fetchSubjectWithRooms(
  supabase: SupabaseClient,
  subjectCode: string,
) {
  const normalizedCode = subjectCode.toUpperCase();
  const [subjectResult, rooms] = await Promise.all([
    supabase
      .from('subjects')
      .select(
        'code,name,default_duration_minutes,is_compulsory,is_active',
      )
      .eq('code', normalizedCode)
      .maybeSingle(),
    fetchPublishedRooms(supabase, normalizedCode),
  ]);

  if (subjectResult.error) throw subjectResult.error;

  const subjectRecord = subjectResult.data as unknown as SubjectRecord | null;
  const subject = subjectRecord
    ? {
        code: subjectRecord.code,
        name: subjectRecord.name,
        defaultDurationMinutes: subjectRecord.default_duration_minutes,
        isCompulsory: subjectRecord.is_compulsory,
        isActive: subjectRecord.is_active,
        openRoomCount: rooms.length,
      }
    : null;

  return { subject, rooms };
}

export async function fetchExamRoomById(
  supabase: SupabaseClient,
  roomId: string,
) {
  const { data, error } = await supabase
    .from('v_exam_rooms_full')
    .select(
      [
        'id',
        'code',
        'name',
        'duration_minutes',
        'status',
        'price_vnd',
        'total_attempts_default',
        'starts_at',
        'ends_at',
        'published_at',
        'blueprint_code',
        'blueprint_name',
        'subject_code',
        'subject_name',
      ].join(','),
    )
    .eq('id', roomId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRoom(data as unknown as PublishedRoomRecord) : null;
}

export async function fetchExamSessionData(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<ExamSessionData> {
  const sessionResult = await supabase
    .from('exam_sessions')
    .select(
      'id,status,attempt_number,started_at,due_at,submitted_at,score,max_score,exam_room_id',
    )
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionResult.error) throw sessionResult.error;
  if (!sessionResult.data) {
    throw new Error('Không tìm thấy phiên thi trong cơ sở dữ liệu.');
  }

  const session = sessionResult.data as unknown as SessionRecord;
  // Fetch questions và room song song — cả 2 đều có session_id và exam_room_id
  const [questionResult, room] = await Promise.all([
    supabase
      .from('exam_session_questions')
      .select(
        `
        id,
        question_seq,
        display_no,
        max_points,
        questions (
          id,
          code,
          type,
          content,
          image_url,
          question_assets (
            kind,
            url,
            alt_text,
            display_order
          ),
          question_options (
            id,
            seq,
            label,
            content,
            image_url,
            image_alt_text
          ),
          question_true_false_items (
            id,
            seq,
            label,
            content
          )
        )
      `,
      )
      .eq('session_id', sessionId)
      .order('question_seq', { ascending: true }),
    fetchExamRoomById(supabase, session.exam_room_id).catch(() => null),
  ]);

  if (questionResult.error) throw questionResult.error;

  const questions = ((questionResult.data ?? []) as unknown as SessionQuestionRecord[])
    .map(mapQuestion)
    .filter((question): question is ExamSessionQuestion => Boolean(question));

  const answerResult =
    questions.length > 0
      ? await supabase
          .from('session_answers')
          .select(
            'session_question_id,answer_json,selected_option_id,short_answer_text,is_correct,earned_points',
          )
          .in(
            'session_question_id',
            questions.map((question) => question.id),
          )
      : { data: [], error: null };

  if (answerResult.error) throw answerResult.error;

  return {
    session: {
      id: session.id,
      status: session.status,
      attemptNumber: session.attempt_number,
      startedAt: session.started_at,
      dueAt: session.due_at,
      submittedAt: session.submitted_at,
      score: session.score,
      maxScore: session.max_score,
      examRoomId: session.exam_room_id,
    },
    room,
    questions,
    answers: ((answerResult.data ?? []) as unknown as SessionAnswerRecord[]).map(
      (answer) => ({
        sessionQuestionId: answer.session_question_id,
        answerJson: answer.answer_json,
        selectedOptionId: answer.selected_option_id,
        shortAnswerText: answer.short_answer_text,
        isCorrect: answer.is_correct,
        earnedPoints: answer.earned_points,
      }),
    ),
  };
}

export async function saveSessionAnswer(
  supabase: SupabaseClient,
  input: {
    sessionQuestionId: string;
    selectedOptionId?: string | null;
    shortAnswerText?: string | null;
    answerJson: Record<string, unknown>;
  },
) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('Phiên đăng nhập đã hết hạn.');

  const { error } = await supabase.from('session_answers').upsert(
    {
      session_question_id: input.sessionQuestionId,
      student_id: user.id,
      selected_option_id: input.selectedOptionId ?? null,
      short_answer_text: input.shortAnswerText ?? null,
      answer_json: input.answerJson,
    },
    { onConflict: 'session_question_id' },
  );

  if (error) throw error;
}
