'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpenCheck,
  FilePenLine,
  GraduationCap,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { difficultyLabel } from '@/lib/supabase/exam-data';
import styles from '@/styles/admin.module.css';

type Subject = {
  code: string;
  name: string;
  duration: number;
  status: 'Đang mở' | 'Nháp';
};

type DraftQuestion = {
  id: string;
  code: string;
  subject: string;
  title: string;
  difficulty: string;
  answer: string | null;
};

type ExamKeyStatus = 'unused' | 'active' | 'exhausted' | 'expired' | 'revoked';
type KeyStatusLabel = 'Chưa dùng' | 'Đang dùng' | 'Hết lượt' | 'Hết hạn' | 'Đã thu hồi';

type ExamKey = {
  id: string;
  code: string;
  subject: string;
  room: string;
  student: string;
  attempts: string;
  status: KeyStatusLabel;
  expiresAt: string | null;
  createdAt: string | null;
};

type Student = {
  code: string;
  name: string;
  school: string;
  key: string;
};

type AdminExamKeyRecord = {
  id: string;
  code: string;
  exam_room_name: string;
  subject_name: string;
  student_name: string | null;
  total_attempts: number;
  used_attempts: number;
  status: ExamKeyStatus;
  expires_at: string | null;
  created_at: string | null;
};

type GeneratedExamKeyRecord = {
  id: string;
  code: string;
  exam_room_name: string;
  subject_code: string | null;
  total_attempts: number;
  used_attempts: number;
  status: ExamKeyStatus;
  expires_at: string | null;
  created_at: string | null;
};

type SubjectRecord = {
  code: string;
  name: string;
  default_duration_minutes: number;
  is_active: boolean;
};

type QuestionRecord = {
  id: string;
  code: string;
  subject_code: string;
  content: string;
  difficulty: number;
  status: string;
  metadata: { draft_answer_label?: string } | null;
  subjects?: { name: string } | { name: string }[] | null;
};

type StudentSummaryRecord = {
  student_id: string;
  gmail: string | null;
  full_name: string | null;
  school_name: string | null;
  current_key_code: string | null;
};

type ExamRoomOption = {
  id: string;
  name: string;
  subject_name: string;
  code: string;
};

const keyStatusLabels: Record<ExamKeyStatus, KeyStatusLabel> = {
  unused: 'Chưa dùng',
  active: 'Đang dùng',
  exhausted: 'Hết lượt',
  expired: 'Hết hạn',
  revoked: 'Đã thu hồi',
};

const activeKeyStatuses = new Set<KeyStatusLabel>(['Chưa dùng', 'Đang dùng']);

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getDefaultExpiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + 30);

  return toDateInputValue(date);
}

function getEndOfDayIso(dateValue: string) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const date = new Date(year, month - 1, day, 23, 59, 59, 999);

  return date.toISOString();
}

function formatDate(value: string | null) {
  if (!value) return 'Không đặt';

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

function mapKeyRecord(key: AdminExamKeyRecord): ExamKey {
  return {
    id: key.id,
    code: key.code,
    subject: key.subject_name,
    room: key.exam_room_name,
    student: key.student_name ?? 'Chưa gán',
    attempts: `${key.used_attempts}/${key.total_attempts}`,
    status: keyStatusLabels[key.status],
    expiresAt: key.expires_at,
    createdAt: key.created_at,
  };
}

function getErrorMessage(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';

  if (message.includes('Only staff') || message.includes('row-level security')) {
    return 'Tài khoản hiện tại cần role admin hoặc teacher trong Supabase để tạo key.';
  }

  if (message.includes('Key expiry must be in the future')) {
    return 'Ngày hết hạn phải nằm trong tương lai.';
  }

  return message ? `Không tạo được key: ${message}` : 'Không tạo được key. Vui lòng thử lại.';
}

function getAdminDataErrorMessage(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';

  if (
    message.includes('permission denied') ||
    message.includes('row-level security')
  ) {
    return 'Tài khoản hiện tại cần role admin hoặc teacher trong Supabase để xem và chỉnh dữ liệu quản trị.';
  }

  return message
    ? `Không tải được dữ liệu từ Supabase: ${message}`
    : 'Không tải được dữ liệu từ Supabase.';
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function mapSubjectRecord(subject: SubjectRecord): Subject {
  return {
    code: subject.code,
    name: subject.name,
    duration: subject.default_duration_minutes,
    status: subject.is_active ? 'Đang mở' : 'Nháp',
  };
}

function mapQuestionRecord(question: QuestionRecord): DraftQuestion {
  const subject = firstRelation(question.subjects);

  return {
    id: question.id,
    code: question.code,
    subject: subject?.name ?? question.subject_code,
    title: question.content,
    difficulty: difficultyLabel(question.difficulty),
    answer: question.metadata?.draft_answer_label ?? null,
  };
}

function mapStudentSummary(student: StudentSummaryRecord): Student {
  return {
    code: student.student_id.slice(0, 8).toUpperCase(),
    name: student.full_name ?? student.gmail ?? 'Chưa cập nhật',
    school: student.school_name ?? 'Chưa cập nhật',
    key: student.current_key_code ?? 'Chưa gán',
  };
}

export default function AdminPage() {
  const router = useRouter();
  const hasConfiguredSupabase = hasSupabaseEnv();
  // null = đang kiểm tra, false = không có quyền, true = có quyền
  const [isStaff, setIsStaff] = useState<boolean | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [keys, setKeys] = useState<ExamKey[]>([]);
  const [examRooms, setExamRooms] = useState<ExamRoomOption[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [keyQuantity, setKeyQuantity] = useState('5');
  const [keyExpiry, setKeyExpiry] = useState(getDefaultExpiryDate);
  const [keyNote, setKeyNote] = useState('');
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [isCreatingKeys, setIsCreatingKeys] = useState(false);
  const [catalogFeedback, setCatalogFeedback] = useState('');
  const [keyFeedback, setKeyFeedback] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Guard: kiểm tra role admin/teacher, redirect nếu không có quyền
  useEffect(() => {
    if (!hasConfiguredSupabase) {
      return;
    }

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.replace('/');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile && ['admin', 'teacher'].includes(profile.role as string)) {
        setIsStaff(true);
      } else {
        router.replace('/subjects');
      }
    }).catch(() => router.replace('/subjects'));
  }, [hasConfiguredSupabase, router]);

  const loadAdminCatalog = useCallback(async () => {
    if (!hasConfiguredSupabase) {
      setCatalogFeedback('Chưa cấu hình Supabase nên admin không tải dữ liệu.');
      return;
    }

    setIsLoadingCatalog(true);
    setCatalogFeedback('');

    try {
      const supabase = createClient();
      const [subjectsResponse, questionsResponse, studentsResponse] =
        await Promise.all([
          supabase
            .from('subjects')
            .select('code,name,default_duration_minutes,is_active')
            .order('name', { ascending: true }),
          supabase
            .from('questions')
            .select('id,code,subject_code,content,difficulty,status,metadata,subjects(name)')
            .order('created_at', { ascending: false })
            .limit(200),
          supabase
            .from('student_key_summary')
            .select('student_id,gmail,full_name,school_name,current_key_code')
            .order('full_name', { ascending: true })
            .limit(200),
        ]);

      if (subjectsResponse.error) throw subjectsResponse.error;
      if (questionsResponse.error) throw questionsResponse.error;
      if (studentsResponse.error) throw studentsResponse.error;

      setSubjects(((subjectsResponse.data ?? []) as unknown as SubjectRecord[]).map(mapSubjectRecord));
      setQuestions(((questionsResponse.data ?? []) as unknown as QuestionRecord[]).map(mapQuestionRecord));
      setStudents(((studentsResponse.data ?? []) as unknown as StudentSummaryRecord[]).map(mapStudentSummary));
    } catch (error) {
      setCatalogFeedback(getAdminDataErrorMessage(error));
    } finally {
      setIsLoadingCatalog(false);
    }
  }, [hasConfiguredSupabase]);

  const loadKeyManagement = useCallback(async () => {
    if (!hasConfiguredSupabase) return;

    setIsLoadingKeys(true);
    setKeyFeedback('');

    try {
      const supabase = createClient();
      const [keysResponse, roomsResponse] = await Promise.all([
        supabase
          .from('admin_exam_key_overview')
          .select('id,code,exam_room_name,subject_name,student_name,total_attempts,used_attempts,status,expires_at,created_at')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('exam_rooms')
          .select('id,name,code,subject_code,subjects(name)')
          .eq('status', 'published')
          .order('subject_code'),
      ]);

      if (keysResponse.error) throw keysResponse.error;

      const loadedKeys = ((keysResponse.data ?? []) as unknown as AdminExamKeyRecord[]).map(mapKeyRecord);
      setKeys(loadedKeys);

      if (!roomsResponse.error && roomsResponse.data) {
        const roomList = roomsResponse.data.map((room) => {
          const subjectRel = Array.isArray(room.subjects) ? room.subjects[0] : room.subjects;
          return {
            id: room.id as string,
            name: room.name as string,
            code: room.code as string,
            subject_name: (subjectRel as { name?: string } | null)?.name ?? room.subject_code as string,
          };
        });
        setExamRooms(roomList);
        // Auto-select phòng thi đầu tiên nếu chưa chọn
        if (roomList.length > 0) {
          setSelectedRoomId((prev) => prev || roomList[0].id);
        }
      }
    } catch (error) {
      setKeyFeedback(getAdminDataErrorMessage(error));
    } finally {
      setIsLoadingKeys(false);
    }
  }, [hasConfiguredSupabase]);

  useEffect(() => {
    if (!hasConfiguredSupabase) return;

    const timeoutId = window.setTimeout(() => {
      void loadAdminCatalog();
      void loadKeyManagement();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [hasConfiguredSupabase, loadAdminCatalog, loadKeyManagement]);

  const filteredStudents = useMemo(() => {
    const nextSearch = searchTerm.trim().toLowerCase();
    if (!nextSearch) return students;

    return students.filter((student) =>
      [student.code, student.name, student.school, student.key].some((value) =>
        value.toLowerCase().includes(nextSearch),
      ),
    );
  }, [searchTerm, students]);

  const handleDeleteSubject = async (code: string) => {
    if (!hasConfiguredSupabase) {
      setCatalogFeedback('Chưa cấu hình Supabase nên không thể xóa môn học.');
      return;
    }

    if (!window.confirm(`Bạn có chắc chắn muốn xóa môn học mã ${code}? Các dữ liệu liên quan có thể bị ảnh hưởng.`)) {
      return;
    }

    try {
      const { error } = await createClient().from('subjects').delete().eq('code', code);

      if (error) throw error;

      await loadAdminCatalog();
    } catch (error) {
      setCatalogFeedback(getAdminDataErrorMessage(error));
    }
  };

  const handleAddSubject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('subjectName') ?? '').trim();
    const code = String(form.get('subjectCode') ?? '').trim().toUpperCase();
    const duration = Number(form.get('duration') ?? 90);

    if (!name || !code) return;

    if (!hasConfiguredSupabase) {
      setCatalogFeedback('Chưa cấu hình Supabase nên không thể lưu môn học.');
      return;
    }

    try {
      const { error } = await createClient().from('subjects').upsert(
        {
          code,
          name,
          exam_group: 'custom',
          default_duration_minutes: duration,
          is_compulsory: false,
          is_active: true,
        },
        { onConflict: 'code' },
      );

      if (error) throw error;

      event.currentTarget.reset();
      await loadAdminCatalog();
    } catch (error) {
      setCatalogFeedback(getAdminDataErrorMessage(error));
    }
  };

  const handleAddQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('questionTitle') ?? '').trim();
    const answer = String(form.get('answer') ?? '').trim().toUpperCase();
    const subjectCode = String(form.get('questionSubject') ?? subjects[0]?.code ?? '')
      .trim()
      .toUpperCase();
    const difficulty = Number(form.get('difficulty') ?? 1);

    if (!title || !subjectCode) return;

    if (!hasConfiguredSupabase) {
      setCatalogFeedback('Chưa cấu hình Supabase nên không thể lưu câu hỏi.');
      return;
    }

    try {
      const questionCode = `${subjectCode}_${Date.now()}`;
      const { error } = await createClient().from('questions').insert({
        code: questionCode,
        subject_code: subjectCode,
        type: 'multiple_choice',
        difficulty,
        content: title,
        status: 'draft',
        metadata: answer ? { draft_answer_label: answer } : {},
      });

      if (error) throw error;

      event.currentTarget.reset();
      await loadAdminCatalog();
    } catch (error) {
      setCatalogFeedback(getAdminDataErrorMessage(error));
    }
  };

  const handleCreateKeys = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const quantity = Number.parseInt(keyQuantity, 10);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
      setKeyFeedback('Số lượng key phải từ 1 đến 500.');
      return;
    }

    const expiresAt = keyExpiry ? getEndOfDayIso(keyExpiry) : null;

    if (expiresAt && new Date(expiresAt) <= new Date()) {
      setKeyFeedback('Ngày hết hạn phải nằm trong tương lai.');
      return;
    }

    if (!hasConfiguredSupabase) {
      setKeyFeedback('Chưa cấu hình Supabase nên không thể tạo key.');
      return;
    }

    if (!selectedRoomId) {
      setKeyFeedback('Vui lòng chọn phòng thi trước khi tạo key.');
      return;
    }

    setIsCreatingKeys(true);
    setKeyFeedback('');

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('generate_exam_keys', {
        p_exam_room_id: selectedRoomId,
        p_quantity: quantity,
        p_expires_at: expiresAt,
        p_note: keyNote.trim() || null,
      });

      if (error) throw error;

      const createdKeys = ((data ?? []) as unknown as GeneratedExamKeyRecord[]).map((key) => ({
        id: key.id,
        code: key.code,
        subject: key.subject_code ?? 'Dùng chung',
        room: key.exam_room_name ?? 'Chưa gán phòng thi',
        student: 'Chưa gán',
        attempts: `${key.used_attempts}/${key.total_attempts}`,
        status: keyStatusLabels[key.status],
        expiresAt: key.expires_at,
        createdAt: key.created_at,
      }));

      setKeys((current) => [...createdKeys, ...current]);
      setKeyNote('');
      setKeyFeedback(`Đã tạo ${createdKeys.length || quantity} key trong cơ sở dữ liệu.`);
      await loadKeyManagement();
    } catch (error) {
      setKeyFeedback(getErrorMessage(error));
    } finally {
      setIsCreatingKeys(false);
    }
  };

  const scrollToKeys = () => {
    document.getElementById('keys')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const activeKeyCount = keys.filter((key) => activeKeyStatuses.has(key.status)).length;

  // Chờ guard kiểm tra quyền trước khi render trang
  if (isStaff === null) {
    return (
      <div className={styles.screen} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Đang kiểm tra quyền truy cập...</p>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}><ShieldCheck size={20} /></span>
          <span>Admin THPT</span>
        </div>
        <nav className={styles.nav}>
          <a href="#compose"><FilePenLine size={18} /> Soạn đề</a>
          <a href="#subjects"><BookOpenCheck size={18} /> Môn học</a>
          <a href="#keys"><KeyRound size={18} /> Quản lý key</a>
          <a href="#students"><Users size={18} /> Học viên</a>
        </nav>
        <button className={styles.backButton} type="button" onClick={() => router.push('/subjects')}>
          Về giao diện thi
        </button>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <div>
            <h1>Quản trị hệ thống thi</h1>
            <p>Soạn đề, mở môn học, cấp key và theo dõi học viên trong một màn hình.</p>
          </div>
          <button className="btn" type="button" onClick={scrollToKeys}>
            <Plus size={16} />
            Tạo key
          </button>
        </header>

        <section className={styles.metrics} aria-label="Tổng quan">
          <div className={styles.metric}>
            <BookOpenCheck size={20} />
            <span>{subjects.length}</span>
            <p>Môn học</p>
          </div>
          <div className={styles.metric}>
            <FilePenLine size={20} />
            <span>{questions.length}</span>
            <p>Câu hỏi</p>
          </div>
          <div className={styles.metric}>
            <KeyRound size={20} />
            <span>{activeKeyCount}</span>
            <p>Key còn hiệu lực</p>
          </div>
          <div className={styles.metric}>
            <GraduationCap size={20} />
            <span>{students.length}</span>
            <p>Học viên</p>
          </div>
        </section>

        <div className={styles.workGrid}>
          <section id="compose" className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Ngân hàng câu hỏi</h2>
                <p>Câu hỏi hiển thị từ bảng questions trong Supabase.</p>
              </div>
              <span className={styles.status}>{isLoadingCatalog ? 'Đang tải' : 'Dữ liệu DB'}</span>
            </div>
            <form className={styles.form} onSubmit={handleAddQuestion}>
              <label>
                Môn học
                <select name="questionSubject" required disabled={subjects.length === 0}>
                  {subjects.length === 0 ? (
                    <option value="">Chưa có môn học trong DB</option>
                  ) : null}
                  {subjects.map((subject) => (
                    <option key={subject.code} value={subject.code}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nội dung câu hỏi
                <textarea name="questionTitle" rows={4} placeholder="Nhập nội dung câu hỏi..." required />
              </label>
              <div className={styles.inlineFields}>
                <label>
                  Mức độ
                  <select name="difficulty" defaultValue="1">
                    <option value="1">Nhận biết</option>
                    <option value="2">Thông hiểu</option>
                    <option value="3">Vận dụng</option>
                    <option value="4">Vận dụng cao</option>
                  </select>
                </label>
                <label>
                  Đáp án nháp
                  <input name="answer" maxLength={1} placeholder="A" />
                </label>
              </div>
              <button className="btn" type="submit" disabled={!hasConfiguredSupabase || subjects.length === 0}>
                <Save size={16} />
                Lưu câu hỏi
              </button>
            </form>

            {catalogFeedback ? <p className={styles.feedback}>{catalogFeedback}</p> : null}

            <div className={styles.list}>
              {questions.length === 0 ? (
                <div className={styles.emptyCell}>
                  {isLoadingCatalog ? 'Đang tải câu hỏi...' : 'Chưa có câu hỏi trong cơ sở dữ liệu.'}
                </div>
              ) : null}
              {questions.map((question) => (
                <article key={question.id} className={styles.questionRow}>
                  <span>{question.code}</span>
                  <div>
                    <strong>{question.title}</strong>
                    <p>
                      {question.subject} · {question.difficulty}
                      {question.answer ? ` · Đáp án nháp ${question.answer}` : ''}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section id="subjects" className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Môn học</h2>
                <p>Danh sách lấy từ bảng subjects, thêm mới sẽ ghi vào Supabase.</p>
              </div>
            </div>
            <form className={styles.form} onSubmit={handleAddSubject}>
              <label>
                Tên môn
                <input name="subjectName" placeholder="Ví dụ: Vật lí" required />
              </label>
              <div className={styles.inlineFields}>
                <label>
                  Mã môn
                  <input name="subjectCode" placeholder="PHYSICS" required />
                </label>
                <label>
                  Thời gian
                  <input name="duration" type="number" defaultValue={90} min={15} />
                </label>
              </div>
              <button className="btn secondary" type="submit" disabled={!hasConfiguredSupabase}>
                <Plus size={16} />
                Thêm môn
              </button>
            </form>
            <div className={styles.subjectTable}>
              {subjects.length === 0 ? (
                <div>
                  <strong>{isLoadingCatalog ? 'Đang tải môn học...' : 'Chưa có môn học trong DB'}</strong>
                </div>
              ) : null}
              {subjects.map((subject) => (
                <div key={subject.code}>
                  <strong>{subject.name}</strong>
                  <span>{subject.code}</span>
                  <span>{subject.duration} phút</span>
                  <em>{subject.status}</em>
                  <button
                    type="button"
                    className={styles.deleteButton}
                    title="Xóa môn học"
                    onClick={() => handleDeleteSubject(subject.code)}
                    disabled={!hasConfiguredSupabase}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section id="keys" className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Quản lý key</h2>
              <p>Tạo key dùng chung, đặt ngày hết hạn và theo dõi phạm vi sử dụng.</p>
            </div>
            <button
              className="btn outline small"
              type="button"
              onClick={loadKeyManagement}
              disabled={isLoadingKeys || !hasConfiguredSupabase}
            >
              <RefreshCw size={15} />
              Tải lại
            </button>
          </div>

          <form className={`${styles.form} ${styles.keyForm}`} onSubmit={handleCreateKeys}>
            <div className={styles.keyFormGrid}>
              <label>
                Phòng thi <span style={{ color: 'var(--color-danger, red)' }}>*</span>
                <select
                  value={selectedRoomId}
                  onChange={(event) => setSelectedRoomId(event.target.value)}
                  required
                >
                  {examRooms.length === 0 ? (
                    <option value="">Chưa có phòng thi nào đang mở</option>
                  ) : (
                    examRooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name} — {room.subject_name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label>
                Số lượng key
                <input
                  value={keyQuantity}
                  onChange={(event) => setKeyQuantity(event.target.value)}
                  type="number"
                  min={1}
                  max={500}
                  inputMode="numeric"
                  required
                />
              </label>
              <label>
                Ngày hết hạn
                <input
                  value={keyExpiry}
                  onChange={(event) => setKeyExpiry(event.target.value)}
                  type="date"
                  min={toDateInputValue(new Date())}
                />
              </label>
              <label>
                Ghi chú batch
                <input
                  value={keyNote}
                  onChange={(event) => setKeyNote(event.target.value)}
                  placeholder="Ví dụ: Đợt bán tháng 6"
                />
              </label>
            </div>

            <div className={styles.keyFormActions}>
              <button
                className="btn"
                type="submit"
                disabled={isCreatingKeys || isLoadingKeys || !hasConfiguredSupabase}
              >
                <Plus size={16} />
                {isCreatingKeys ? 'Đang tạo...' : `Tạo ${Number.parseInt(keyQuantity, 10) || 0} key`}
              </button>
              <span>
                3 lượt/key · Dùng cho mọi phòng thi · Hết hạn {formatDate(keyExpiry ? getEndOfDayIso(keyExpiry) : null)}
              </span>
            </div>

            {keyFeedback ? <p className={styles.feedback}>{keyFeedback}</p> : null}
          </form>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Phạm vi</th>
                  <th>Học viên</th>
                  <th>Lượt</th>
                  <th>Hết hạn</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {keys.length === 0 ? (
                  <tr>
                    <td className={styles.emptyCell} colSpan={6}>
                      {isLoadingKeys ? 'Đang tải key...' : 'Chưa có key nào được tạo.'}
                    </td>
                  </tr>
                ) : (
                  keys.map((key) => (
                    <tr key={key.id}>
                      <td><strong>{key.code}</strong></td>
                      <td>{key.room}</td>
                      <td>{key.student}</td>
                      <td>{key.attempts}</td>
                      <td>{formatDate(key.expiresAt)}</td>
                      <td><span className={styles.keyStatus}>{key.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section id="students" className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Quản lý học viên</h2>
              <p>Tìm kiếm học viên, trường và key được gán.</p>
            </div>
            <label className={styles.search}>
              <Search size={16} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Tìm học viên..."
              />
            </label>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>SBD</th>
                  <th>Họ tên</th>
                  <th>Trường</th>
                  <th>Key hiện tại</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td className={styles.emptyCell} colSpan={4}>
                      {isLoadingCatalog ? 'Đang tải học viên...' : 'Chưa có học viên trong cơ sở dữ liệu.'}
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => (
                    <tr key={student.code}>
                      <td><strong>{student.code}</strong></td>
                      <td>{student.name}</td>
                      <td>{student.school}</td>
                      <td>{student.key}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
