'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import {
  loadCandidateProfile,
  saveCandidateProfile,
} from '@/lib/supabase/user-profile';
import { useExamStore } from '@/store/useExamStore';
import styles from '@/styles/profile.module.css';

type StoreState = ReturnType<typeof useExamStore.getState>;
type CandidateInfo = NonNullable<StoreState['candidateInfo']>;

type ProfileFormState = {
  name: string;
  dob: string;
  gender: string;
  school: string;
  province: string;
  district: string;
  phone: string;
};

type ProfileContentProps = {
  candidateInfo: CandidateInfo;
  activeKeys: StoreState['activeKeys'];
  usedKeys: string[];
  examHistory: StoreState['examHistory'];
  updateProfile: StoreState['updateProfile'];
  onBack: () => void;
};

type ProfileKeyRecord = {
  code: string;
  status: string;
  total_attempts: number;
  used_attempts: number;
};

type ProfileSessionRecord = {
  id: string;
  status: string;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  max_score: number;
  exam_rooms?: { name: string; subject_code: string } | { name: string; subject_code: string }[] | null;
};

const genderOptions = [
  { value: '', label: 'Chọn giới tính' },
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'other', label: 'Khác' },
];

function toDateInputValue(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const vietnameseDate = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (vietnameseDate) {
    const [, day, month, year] = vietnameseDate;
    return `${year}-${month}-${day}`;
  }

  return '';
}

function toGenderValue(value: string) {
  const normalized = value.trim().toLowerCase();

  if (normalized === 'male' || normalized === 'nam') return 'male';
  if (normalized === 'female' || normalized === 'nữ' || normalized === 'nu') {
    return 'female';
  }
  if (normalized === 'other' || normalized === 'khác' || normalized === 'khac') {
    return 'other';
  }

  return '';
}

function getInitialForm(candidateInfo: CandidateInfo): ProfileFormState {
  return {
    name: candidateInfo.name || '',
    dob: toDateInputValue(candidateInfo.dob || ''),
    gender: toGenderValue(candidateInfo.gender || ''),
    school: candidateInfo.school || '',
    province: candidateInfo.province || '',
    district: candidateInfo.district || '',
    phone: candidateInfo.phone || '',
  };
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default function ProfilePage() {
  const router = useRouter();
  const {
    hasHydrated,
    candidateInfo,
    login,
    updateProfile,
  } = useExamStore();
  const [activeKeys, setActiveKeys] = useState<StoreState['activeKeys']>([]);
  const [usedKeys, setUsedKeys] = useState<string[]>([]);
  const [examHistory, setExamHistory] = useState<StoreState['examHistory']>([]);

  useEffect(() => {
    if (hasHydrated && !candidateInfo) {
      router.push('/');
    }
  }, [hasHydrated, candidateInfo, router]);

  useEffect(() => {
    if (!hasHydrated || !hasSupabaseEnv()) return;

    const currentProfile = useExamStore.getState().candidateInfo;
    if (!currentProfile) return;

    let isMounted = true;
    const supabase = createClient();

    supabase.auth
      .getUser()
      .then(async ({ data, error }) => {
        if (!isMounted) return;

        if (error || !data.user) {
          useExamStore.getState().logout();
          router.push('/');
          return;
        }

        const profile = await loadCandidateProfile(supabase, data.user);
        if (!isMounted) return;

        const latestProfile = useExamStore.getState().candidateInfo;
        const profileUnchanged =
          latestProfile?.code === profile.code &&
          latestProfile.name === profile.name &&
          latestProfile.school === profile.school &&
          latestProfile.dob === profile.dob &&
          latestProfile.gender === profile.gender &&
          latestProfile.province === profile.province &&
          latestProfile.district === profile.district &&
          latestProfile.phone === profile.phone;

        if (!profileUnchanged) {
          login(profile.code, {
            name: profile.name,
            school: profile.school,
            dob: profile.dob,
            gender: profile.gender,
            province: profile.province,
            district: profile.district,
            phone: profile.phone,
          });
        }

        const [keyResult, sessionResult] = await Promise.all([
          supabase
            .from('exam_keys')
            .select('code,status,total_attempts,used_attempts')
            .eq('assigned_to', data.user.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('exam_sessions')
            .select('id,status,started_at,submitted_at,score,max_score,exam_rooms(name,subject_code)')
            .eq('student_id', data.user.id)
            .order('started_at', { ascending: false })
            .limit(20),
        ]);

        if (!isMounted) return;

        const keyRows = (keyResult.data ?? []) as unknown as ProfileKeyRecord[];
        setActiveKeys(
          keyRows
            .filter((key) => {
              const remaining = key.total_attempts - key.used_attempts;
              return ['unused', 'active'].includes(key.status) && remaining > 0;
            })
            .map((key) => ({
              code: key.code,
              remainingAttempts: Math.max(key.total_attempts - key.used_attempts, 0),
            })),
        );
        setUsedKeys(
          keyRows
            .filter((key) => {
              const remaining = key.total_attempts - key.used_attempts;
              return key.status === 'exhausted' || remaining <= 0;
            })
            .map((key) => key.code),
        );

        const sessionRows = (sessionResult.data ?? []) as unknown as ProfileSessionRecord[];
        setExamHistory(
          sessionRows.map((session) => {
            const room = firstRelation(session.exam_rooms);
            const score =
              typeof session.score === 'number'
                ? `${session.score.toFixed(2)} / ${session.max_score}`
                : session.status;

            return {
              id: session.id,
              subject: room?.subject_code ?? 'Chưa rõ môn',
              examSet: room?.name,
              score,
              date: new Intl.DateTimeFormat('vi-VN', {
                dateStyle: 'short',
                timeStyle: 'short',
              }).format(new Date(session.submitted_at ?? session.started_at)),
            };
          }),
        );
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [hasHydrated, login, router]);

  if (!hasHydrated || !candidateInfo) return null;

  return (
    <ProfileContent
      key={[
        candidateInfo.code,
        candidateInfo.name,
        candidateInfo.dob,
        candidateInfo.gender,
        candidateInfo.school,
        candidateInfo.province,
        candidateInfo.district,
        candidateInfo.phone,
      ].join(':')}
      candidateInfo={candidateInfo}
      activeKeys={activeKeys}
      usedKeys={usedKeys}
      examHistory={examHistory}
      updateProfile={updateProfile}
      onBack={() => router.push('/subjects')}
    />
  );
}

function ProfileContent({
  candidateInfo,
  activeKeys,
  usedKeys,
  examHistory,
  updateProfile,
  onBack,
}: ProfileContentProps) {
  const [form, setForm] = useState<ProfileFormState>(() =>
    getInitialForm(candidateInfo),
  );
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>(
    'idle',
  );
  const [feedback, setFeedback] = useState('');
  const today = new Date().toISOString().slice(0, 10);

  const updateField =
    (field: keyof ProfileFormState) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((currentForm) => ({
        ...currentForm,
        [field]: event.target.value,
      }));
      if (status !== 'idle') {
        setStatus('idle');
        setFeedback('');
      }
    };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const fullName = form.name.trim();
    if (!fullName) {
      setStatus('error');
      setFeedback('Vui lòng nhập họ và tên học sinh.');
      return;
    }

    if (!hasSupabaseEnv()) {
      setStatus('error');
      setFeedback('Chưa cấu hình Supabase nên không thể lưu hồ sơ.');
      return;
    }

    setStatus('saving');
    setFeedback('');

    try {
      const supabase = createClient();
      const { data, error: userError } = await supabase.auth.getUser();

      if (!data.user) {
        throw new Error(
          'Phiên đăng nhập Supabase đã hết hạn. Vui lòng đăng nhập lại để lưu hồ sơ.',
        );
      }

      if (userError) {
        throw userError;
      }

      const profile = await saveCandidateProfile(supabase, data.user, {
        fullName,
        dateOfBirth: form.dob || null,
        gender: form.gender || null,
        schoolName: form.school,
        provinceName: form.province,
        districtName: form.district,
        phone: form.phone,
      });

      updateProfile({
        name: profile.name,
        dob: profile.dob,
        gender: profile.gender,
        school: profile.school,
        province: profile.province,
        district: profile.district,
        phone: profile.phone,
      });
      setForm({
        name: profile.name,
        dob: profile.dob,
        gender: profile.gender,
        school: profile.school,
        province: profile.province,
        district: profile.district,
        phone: profile.phone,
      });
      setStatus('success');
      setFeedback('Đã lưu thông tin vào cơ sở dữ liệu.');
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : 'Không thể lưu hồ sơ học sinh.';
      setStatus('error');
      setFeedback(message);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Quản lý hồ sơ</h1>
        <button className="btn outline" type="button" onClick={onBack}>
          Quay lại chọn môn
        </button>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.sectionTitle}>Thông tin học sinh</h2>
          <form onSubmit={handleSave}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Số báo danh / Mã thí sinh</label>
              <input
                type="text"
                className={styles.input}
                value={candidateInfo.code}
                disabled
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Họ và tên</label>
              <input
                type="text"
                required
                className={styles.input}
                value={form.name}
                autoComplete="name"
                onChange={updateField('name')}
              />
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Ngày sinh</label>
                <input
                  type="date"
                  required
                  max={today}
                  className={styles.input}
                  value={form.dob}
                  onChange={updateField('dob')}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Giới tính</label>
                <select
                  className={styles.input}
                  value={form.gender}
                  onChange={updateField('gender')}
                >
                  {genderOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Trường học</label>
              <input
                type="text"
                className={styles.input}
                value={form.school}
                autoComplete="organization"
                onChange={updateField('school')}
              />
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Tỉnh / Thành phố</label>
                <input
                  type="text"
                  className={styles.input}
                  value={form.province}
                  onChange={updateField('province')}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Quận / Huyện</label>
                <input
                  type="text"
                  className={styles.input}
                  value={form.district}
                  onChange={updateField('district')}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Số điện thoại</label>
              <input
                type="tel"
                className={styles.input}
                value={form.phone}
                autoComplete="tel"
                onChange={updateField('phone')}
              />
            </div>

            {feedback && (
              <p
                className={`${styles.feedback} ${
                  status === 'error' ? styles.feedbackError : styles.feedbackSuccess
                }`}
              >
                {feedback}
              </p>
            )}

            <button
              type="submit"
              className={`btn ${styles.submitBtn}`}
              disabled={status === 'saving'}
            >
              {status === 'saving' ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </form>
        </div>

        <div className={styles.stack}>
          <div className={styles.card}>
            <h2 className={styles.sectionTitle}>Quản lý key phòng thi</h2>

            <h3 className={styles.subsectionTitle}>Đang sử dụng</h3>
            {activeKeys.length > 0 ? (
              activeKeys.map((key) => (
                <div key={key.code} className={styles.keyStat}>
                  <span className={styles.code}>Key: {key.code}</span>
                  <span className={styles.attempts}>
                    Còn lại: {key.remainingAttempts} lượt
                  </span>
                </div>
              ))
            ) : (
              <div className={styles.emptyState}>Không có key nào đang dùng</div>
            )}

            <h3 className={`${styles.subsectionTitle} ${styles.spaced}`}>
              Đã dùng hết
            </h3>
            {usedKeys.length > 0 ? (
              usedKeys.map((key) => (
                <div key={key} className={`${styles.keyStat} ${styles.used}`}>
                  <span className={styles.code}>Key: {key}</span>
                  <span className={styles.attempts}>Hết lượt</span>
                </div>
              ))
            ) : (
              <div className={styles.emptyState}>Chưa có key nào đã dùng hết</div>
            )}
          </div>

          <div className={styles.card}>
            <h2 className={styles.sectionTitle}>Lịch sử bài thi</h2>
            {examHistory.length > 0 ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Môn thi</th>
                    <th>Ngày hoàn thành</th>
                    <th>Điểm số</th>
                  </tr>
                </thead>
                <tbody>
                  {examHistory.map((history) => (
                    <tr key={history.id}>
                      <td>
                        <strong>{history.subject}</strong>
                        {history.examSet ? (
                          <span className={styles.historyExamSet}>
                            {history.examSet}
                          </span>
                        ) : null}
                      </td>
                      <td>{history.date}</td>
                      <td className={styles.historyScore}>{history.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={styles.emptyState}>
                Chưa có lịch sử làm bài nào
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
