'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  fetchExamSessionData,
  type ExamSessionData,
} from '@/lib/supabase/exam-data';
import { useExamStore } from '@/store/useExamStore';
import styles from '@/styles/result.module.css';

export default function ResultPage() {
  const router = useRouter();
  const {
    hasHydrated,
    theme,
    setTheme,
    finishSession,
    candidateInfo,
    roomKey,
    currentSessionId,
  } = useExamStore();
  const [examData, setExamData] = useState<ExamSessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (hasHydrated && !candidateInfo) {
      router.push('/');
      return;
    }

    if (hasHydrated && (!roomKey || !currentSessionId)) {
      router.push('/');
    }
  }, [candidateInfo, currentSessionId, hasHydrated, roomKey, router]);

  useEffect(() => {
    if (!hasHydrated || !currentSessionId) return;

    let isMounted = true;

    fetchExamSessionData(createClient(), currentSessionId)
      .then((data) => {
        if (!isMounted) return;
        setExamData(data);
        setLoadError('');
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        const message =
          error instanceof Error
            ? error.message
            : 'Không thể tải kết quả từ Supabase.';
        setLoadError(message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentSessionId, hasHydrated]);

  const resultStats = useMemo(() => {
    const total = examData?.questions.length ?? 0;
    const answered = new Set(
      (examData?.answers ?? []).map((answer) => answer.sessionQuestionId),
    ).size;
    const correctAnswers = (examData?.answers ?? []).filter(
      (answer) => answer.isCorrect === true,
    ).length;
    const wrongAnswers = (examData?.answers ?? []).filter(
      (answer) => answer.isCorrect === false,
    ).length;

    return {
      total,
      answered,
      correctAnswers,
      wrongAnswers,
      empty: Math.max(total - answered, 0),
    };
  }, [examData]);

  const score = examData?.session.score;
  const maxScore = examData?.session.maxScore ?? 10;
  const progressPercent =
    typeof score === 'number' && maxScore > 0 ? (score / maxScore) * 100 : 0;
  const subjectName = examData?.room?.subjectName ?? 'Môn thi';
  const examRoomName = examData?.room?.name ?? 'Phòng thi';

  const handleFinish = () => {
    finishSession();
    router.push('/subjects');
  };

  if (!hasHydrated || !candidateInfo) return null;

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
      <h1 className={styles.title}>KẾT QUẢ PHIÊN THI</h1>
      <div className={styles.center}>
        <section className={styles.card}>
          <h2>Kết quả từ cơ sở dữ liệu</h2>
          <div className={styles.body}>
            {isLoading ? (
              <p className={styles.successMessage}>
                Đang tải kết quả từ Supabase...
              </p>
            ) : null}
            {loadError ? (
              <p className={styles.errorText}>{loadError}</p>
            ) : null}
            {!isLoading && !loadError ? (
              <>
                <p className={styles.successMessage}>
                  Phiên thi đã được ghi nhận trong hệ thống.
                </p>
                <table className={styles.stats}>
                  <tbody>
                    <tr>
                      <td>Môn thi:</td>
                      <td>{subjectName}</td>
                    </tr>
                    <tr>
                      <td>Phòng thi:</td>
                      <td>{examRoomName}</td>
                    </tr>
                    <tr>
                      <td>Số câu đã trả lời:</td>
                      <td>
                        {resultStats.answered} / {resultStats.total}
                      </td>
                    </tr>
                    <tr>
                      <td>Số câu đúng:</td>
                      <td className={styles.statCorrect}>
                        {typeof score !== 'number' ? 'Chưa chấm' : resultStats.correctAnswers}
                      </td>
                    </tr>
                    <tr>
                      <td>Số câu sai:</td>
                      <td className={styles.statWrong}>
                        {typeof score !== 'number' ? 'Chưa chấm' : resultStats.wrongAnswers}
                      </td>
                    </tr>
                    <tr>
                      <td>Số câu bỏ trống:</td>
                      <td className={styles.statEmpty}>{resultStats.empty}</td>
                    </tr>
                    <tr>
                      <td>Trạng thái phiên:</td>
                      <td>{examData?.session.status ?? 'Không rõ'}</td>
                    </tr>
                  </tbody>
                </table>
                <div className={styles.scoreLine}>
                  {typeof score === 'number'
                    ? `${score.toFixed(2)} / ${maxScore}`
                    : 'Chưa có điểm chấm'}
                </div>
                <div className={styles.progress}>
                  <span style={{ width: `${progressPercent}%` }}></span>
                </div>
                <button className="btn" type="button" onClick={handleFinish}>
                  Hoàn thành
                </button>
              </>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
