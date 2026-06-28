'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Moon, Sun } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import {
  fetchSubjectWithRooms,
  formatPriceVnd,
  type ExamRoomSummary,
  type SubjectSummary,
} from '@/lib/supabase/exam-data';
import { useExamStore } from '@/store/useExamStore';
import styles from '@/styles/subjects.module.css';

function getRouteSubjectCode(value: string | string[] | undefined) {
  const subjectCode = Array.isArray(value) ? value[0] : value;
  return subjectCode?.toUpperCase() ?? null;
}

export default function SubjectExamSetsPage() {
  const params = useParams<{ subjectCode?: string }>();
  const router = useRouter();
  const hasConfiguredSupabase = hasSupabaseEnv();
  const theme = useExamStore((state) => state.theme);
  const setTheme = useExamStore((state) => state.setTheme);
  const selectExamSet = useExamStore((state) => state.selectExamSet);
  const hasHydrated = useExamStore((state) => state.hasHydrated);
  const candidateInfo = useExamStore((state) => state.candidateInfo);
  const isAuthenticated = useExamStore((state) => state.isAuthenticated);
  const subjectCode = getRouteSubjectCode(params.subjectCode);
  const [subject, setSubject] = useState<SubjectSummary | null>(null);
  const [rooms, setRooms] = useState<ExamRoomSummary[]>([]);
  const [isLoading, setIsLoading] = useState(hasConfiguredSupabase);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!hasHydrated) return;

    if (!isAuthenticated || !candidateInfo) {
      router.push('/');
      return;
    }

    if (!subjectCode) {
      router.push('/subjects');
    }
  }, [candidateInfo, hasHydrated, isAuthenticated, router, subjectCode]);

  useEffect(() => {
    if (hasHydrated) return;

    const timeoutId = window.setTimeout(() => {
      router.push('/');
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [hasHydrated, router]);

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated || !subjectCode) return;

    if (!hasConfiguredSupabase) return;

    let isMounted = true;
    const supabase = createClient();

    fetchSubjectWithRooms(supabase, subjectCode)
      .then(({ subject: loadedSubject, rooms: loadedRooms }) => {
        if (!isMounted) return;

        if (!loadedSubject) {
          router.push('/subjects');
          return;
        }

        setSubject(loadedSubject);
        setRooms(loadedRooms);
        setLoadError('');
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        const message =
          error instanceof Error
            ? error.message
            : 'Không thể tải dữ liệu phòng thi từ Supabase.';
        setLoadError(message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [hasConfiguredSupabase, hasHydrated, isAuthenticated, router, subjectCode]);

  if (!hasHydrated) {
    return (
      <div className={styles.screen}>
        <div className={styles.main}>
          <div className={styles.emptyState}>Đang tải phiên đăng nhập...</div>
        </div>
      </div>
    );
  }

  if (!candidateInfo) {
    return (
      <div className={styles.screen}>
        <div className={styles.main}>
          <div className={styles.emptyState}>Đang chuyển về màn đăng nhập...</div>
        </div>
      </div>
    );
  }

  const displayLoadError =
    loadError ||
    (!hasConfiguredSupabase
      ? 'Chưa cấu hình Supabase nên không thể tải phòng thi.'
      : '');

  return (
    <div className={styles.screen}>
      <div className={styles.pageTools}>
        <button
          className="theme-toggle"
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <span className="icon">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </span>
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>

      <div className={styles.main}>
        <button
          className={`btn secondary small ${styles.backButton}`}
          type="button"
          onClick={() => router.push('/subjects', { transitionTypes: ['nav-back'] })}
        >
          <ArrowLeft size={15} />
          Quay lại môn thi
        </button>

        <section className={styles.examListHero}>
          <div>
            <span className={styles.heroKicker}>Phòng thi từ cơ sở dữ liệu</span>
            <h1 className={styles.examTitle}>
              {subject ? `Môn ${subject.name}` : 'Đang tải môn thi'}
            </h1>
            <p>
              Chọn một phòng thi đang mở, sau đó nhập key được cấp để bắt đầu phiên thi.
            </p>
          </div>
          <div className={styles.heroStat}>
            <strong>{rooms.length}</strong>
            <span>phòng đang mở</span>
          </div>
        </section>

        {displayLoadError ? (
          <div className={styles.emptyState}>{displayLoadError}</div>
        ) : null}

        <section className={styles.examSetGrid}>
          {isLoading ? (
            <div className={styles.emptyState}>Đang tải phòng thi từ Supabase...</div>
          ) : null}
          {!isLoading && rooms.length === 0 && !displayLoadError ? (
            <div className={styles.emptyState}>
              Cơ sở dữ liệu chưa có phòng thi đang mở cho môn này.
            </div>
          ) : null}
          {rooms.map((room) => (
            <article key={room.id} className={styles.examSetCard}>
              <div className={styles.examSetCardHeader}>
                <span className={styles.examSetCardIcon}>
                  <FileText size={18} />
                </span>
                <span>{room.code}</span>
              </div>
              <h2>{room.name}</h2>
              <p>{room.blueprintName ?? 'Phòng thi được lấy trực tiếp từ Supabase.'}</p>
              <div className={styles.examSetStats}>
                <span>{room.durationMinutes} phút</span>
                <span>{room.totalAttemptsDefault} lượt/key</span>
                <span>{formatPriceVnd(room.priceVnd)}</span>
              </div>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  selectExamSet(room.subjectCode, room.id);
                  router.push('/room-key', { transitionTypes: ['nav-forward'] });
                }}
              >
                Chọn phòng này
              </button>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
