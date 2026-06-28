'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpenCheck,
  FilePenLine,
  GraduationCap,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { difficultyLabel } from '@/lib/supabase/exam-data';
import { HANOI_TZ, hanoiEndOfDayISO, hanoiTodayInputValue } from '@/lib/datetime';
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
  isPublic: boolean;
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
  is_public: boolean;
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
  is_public: boolean;
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

const keyStatusLabels: Record<ExamKeyStatus, KeyStatusLabel> = {
  unused: 'Chưa dùng',
  active: 'Đang dùng',
  exhausted: 'Hết lượt',
  expired: 'Hết hạn',
  revoked: 'Đã thu hồi',
};

const activeKeyStatuses = new Set<KeyStatusLabel>(['Chưa dùng', 'Đang dùng']);

function getDefaultExpiryDate() {
  // 30 ngày kể từ "hôm nay" theo giờ Hà Nội.
  const base = new Date(`${hanoiTodayInputValue()}T00:00:00+07:00`);
  base.setDate(base.getDate() + 30);

  return hanoiTodayInputValue(base);
}

function getEndOfDayIso(dateValue: string) {
  // 23:59:59.999 cuối ngày theo giờ Hà Nội của ngày người dùng chọn.
  return hanoiEndOfDayISO(dateValue) ?? new Date(dateValue).toISOString();
}

function formatDate(value: string | null) {
  if (!value) return 'Không đặt';

  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: HANOI_TZ,
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
    student: key.is_public ? 'Nhiều tài khoản' : key.student_name ?? 'Chưa gán',
    isPublic: key.is_public,
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

  if (message.includes('Total attempts must be between')) {
    return 'Giới hạn lượt làm phải từ 1 đến 100.000.';
  }

  return message ? `Không tạo được key: ${message}` : 'Không tạo được key. Vui lòng thử lại.';
}

function getAdminDataErrorMessage(error: unknown) {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  if (
    message.includes('permission denied') ||
    message.includes('row-level security')
  ) {
    return 'Tài khoản hiện tại cần role admin hoặc teacher trong Supabase để xem và chỉnh dữ liệu quản trị.';
  }

  if (code === '23503' || message.includes('foreign key constraint')) {
    return 'Không thể xóa vì dữ liệu này đang được sử dụng (ví dụ: đã có câu hỏi, phòng thi, v.v.). Vui lòng chuyển sang trạng thái "Nháp" thay vì xóa.';
  }

  return message
    ? `Lỗi thao tác dữ liệu: ${message}`
    : 'Lỗi thao tác dữ liệu. Vui lòng thử lại.';
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
  const [keyMode, setKeyMode] = useState<'public' | 'private'>('public');
  const [keyQuantity, setKeyQuantity] = useState('1');
  const [keyTotalAttempts, setKeyTotalAttempts] = useState('100');
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
      const keysResponse = await supabase
        .from('admin_exam_key_overview')
        .select('id,code,exam_room_name,subject_name,student_name,is_public,total_attempts,used_attempts,status,expires_at,created_at')
        .order('created_at', { ascending: false })
        .limit(200);

      if (keysResponse.error) throw keysResponse.error;

      const loadedKeys = ((keysResponse.data ?? []) as unknown as AdminExamKeyRecord[]).map(mapKeyRecord);
      setKeys(loadedKeys);
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
      const supabase = createClient();
      const { error } = await supabase.from('subjects').delete().eq('code', code);

      if (error) {
        if (error.code === '23503' || error.message.includes('foreign key constraint')) {
          if (window.confirm(`Môn học ${code} đang được sử dụng (đã có câu hỏi/phòng thi) nên không thể xóa hoàn toàn.\n\nBạn có muốn chuyển môn học này sang trạng thái "Nháp" để ẩn đi không?`)) {
            const { error: updateError } = await supabase.from('subjects').update({ is_active: false }).eq('code', code);
            if (updateError) throw updateError;
            await loadAdminCatalog();
            return;
          } else {
            return;
          }
        }
        throw error;
      }

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

  const handleCreateKeys = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const quantity = Number.parseInt(keyQuantity, 10);
    const totalAttempts = Number.parseInt(keyTotalAttempts, 10);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 500) {
      setKeyFeedback('Số lượng key phải từ 1 đến 500.');
      return;
    }

    if (!Number.isInteger(totalAttempts) || totalAttempts < 1 || totalAttempts > 100000) {
      setKeyFeedback('Giới hạn lượt làm phải từ 1 đến 100.000.');
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

    const isPublicKey = keyMode === 'public';

    setIsCreatingKeys(true);
    setKeyFeedback('');

    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('generate_exam_keys', {
        p_exam_room_id: null,
        p_quantity: quantity,
        p_expires_at: expiresAt,
        p_note: keyNote.trim() || null,
        p_total_attempts: totalAttempts,
        p_is_public: isPublicKey,
      });

      if (error) throw error;

      const createdKeys = ((data ?? []) as unknown as GeneratedExamKeyRecord[]).map((key) => ({
        id: key.id,
        code: key.code,
        subject: key.subject_code ?? 'Dùng chung',
        room: key.exam_room_name ?? 'Dùng cho mọi phòng thi',
        student: key.is_public ? 'Nhiều tài khoản' : 'Chưa gán',
        isPublic: key.is_public,
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
          <Link href="/admin/authoring" transitionTypes={['nav-forward']}><FilePenLine size={18} /> Soạn đề</Link>
          <a href="#subjects"><BookOpenCheck size={18} /> Môn học</a>
          <a href="#keys"><KeyRound size={18} /> Quản lý key</a>
          <a href="#students"><Users size={18} /> Học viên</a>
        </nav>
        <button className={styles.backButton} type="button" onClick={() => router.push('/subjects', { transitionTypes: ['nav-back'] })}>
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
            <div className={styles.form}>
              <p>
                Workspace LaTeX mới hỗ trợ preview trực tiếp, autosave, xuất bản
                atomic và ảnh Cloudflare R2 trong câu hỏi hoặc từng lựa chọn.
              </p>
              <button
                className="btn"
                type="button"
                onClick={() => router.push('/admin/authoring', { transitionTypes: ['nav-forward'] })}
                disabled={!hasConfiguredSupabase || subjects.length === 0}
              >
                <FilePenLine size={16} />
                Mở trang soạn đề
              </button>
            </div>

            {catalogFeedback ? <p className={styles.feedback}>{catalogFeedback}</p> : null}

            {questions.length === 0 ? (
              <div className={styles.list}>
                <div className={styles.emptyCell}>
                  {isLoadingCatalog ? 'Đang tải câu hỏi...' : 'Chưa có câu hỏi trong cơ sở dữ liệu.'}
                </div>
              </div>
            ) : (
              <details className={styles.questionDisclosure}>
                <summary>
                  <span>
                    <strong>{questions.length} câu hỏi trong ngân hàng</strong>
                    <small>Danh sách chi tiết đang được thu gọn để màn hình quản trị dễ quét hơn.</small>
                  </span>
                  <span className={styles.disclosureAction}>Xem danh sách</span>
                </summary>
                <div className={styles.list}>
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
              </details>
            )}
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
                <div className={styles.subjectEmpty}>
                  <strong>{isLoadingCatalog ? 'Đang tải môn học...' : 'Chưa có môn học trong DB'}</strong>
                </div>
              ) : null}
              {subjects.map((subject) => (
                <div key={subject.code} className={styles.subjectRow}>
                  <div className={styles.subjectMain}>
                    <strong>{subject.name}</strong>
                    <span className={styles.subjectCode}>{subject.code}</span>
                  </div>
                  <span className={styles.subjectDuration}>{subject.duration} phút</span>
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
              <p>Tạo key public hoặc cá nhân, đặt quota và theo dõi lượt sử dụng.</p>
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
                Loại key
                <select
                  value={keyMode}
                  onChange={(event) => {
                    const mode = event.target.value as 'public' | 'private';
                    setKeyMode(mode);
                    setKeyTotalAttempts(mode === 'public' ? '100' : '3');
                  }}
                >
                  <option value="public">Public — nhiều tài khoản</option>
                  <option value="private">Cá nhân — một tài khoản</option>
                </select>
              </label>
              <label>
                Giới hạn lượt làm
                <input
                  value={keyTotalAttempts}
                  onChange={(event) => setKeyTotalAttempts(event.target.value)}
                  type="number"
                  min={1}
                  max={100000}
                  inputMode="numeric"
                  required
                />
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
                  min={hanoiTodayInputValue()}
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
                disabled={
                  isCreatingKeys ||
                  isLoadingKeys ||
                  !hasConfiguredSupabase
                }
              >
                <Plus size={16} />
                {isCreatingKeys ? 'Đang tạo...' : `Tạo ${Number.parseInt(keyQuantity, 10) || 0} key`}
              </button>
              <span>
                {keyTotalAttempts || 0} lượt/key ·{' '}
                {keyMode === 'public'
                  ? 'Dùng chung nhiều tài khoản, mọi phòng thi'
                  : 'Một tài khoản, mọi phòng thi'} ·{' '}
                Hết hạn {formatDate(keyExpiry ? getEndOfDayIso(keyExpiry) : null)}
              </span>
            </div>

            {keyFeedback ? <p className={styles.feedback}>{keyFeedback}</p> : null}
          </form>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Loại</th>
                  <th>Hiệu lực</th>
                  <th>Học viên</th>
                  <th>Lượt</th>
                  <th>Hết hạn</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {keys.length === 0 ? (
                  <tr>
                    <td className={styles.emptyCell} colSpan={7}>
                      {isLoadingKeys ? 'Đang tải key...' : 'Chưa có key nào được tạo.'}
                    </td>
                  </tr>
                ) : (
                  keys.map((key) => (
                    <tr key={key.id}>
                      <td><strong>{key.code}</strong></td>
                      <td><span className={styles.keyStatus}>{key.isPublic ? 'Public' : 'Cá nhân'}</span></td>
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
