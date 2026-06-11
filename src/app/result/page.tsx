'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Moon, Sun, Clock, BookOpen, Award, ChevronDown, ChevronUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  fetchExamSessionData,
  questionTypeLabel,
  type ExamSessionData,
  type ExamSessionQuestion,
  type ExamSessionAnswer,
  type ExamQuestionType,
} from '@/lib/supabase/exam-data';
import { useExamStore } from '@/store/useExamStore';
import QuestionRenderer from '@/components/question/QuestionRenderer';
import type { RenderableQuestion } from '@/components/question/QuestionRenderer';
import styles from '@/styles/result.module.css';

/* ─── Types ──────────────────────────────────────────── */
type ReviewFilter = 'all' | 'correct' | 'wrong' | 'unanswered';

type QuestionReviewItem = {
  question: ExamSessionQuestion;
  answer: ExamSessionAnswer | null;
  status: 'correct' | 'wrong' | 'unanswered';
  earnedPoints: number;
  maxPoints: number;
};

type TypeBreakdown = {
  type: ExamQuestionType;
  label: string;
  earned: number;
  max: number;
  correct: number;
  wrong: number;
  unanswered: number;
  total: number;
};

/* ─── SVG Donut Chart ────────────────────────────────── */
function ScoreDonut({ percent, score10 }: { percent: number; score10: string }) {
  const r = 72;
  const circumference = 2 * Math.PI * r;
  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    // Animate on mount
    const timeout = setTimeout(() => {
      setOffset(circumference - (percent / 100) * circumference);
    }, 120);
    return () => clearTimeout(timeout);
  }, [circumference, percent]);

  return (
    <div className={styles.donutWrap}>
      <svg viewBox="0 0 180 180">
        <defs>
          <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="var(--accent)" />
          </linearGradient>
        </defs>
        <circle className={styles.donutTrack} cx="90" cy="90" r={r} />
        <circle
          className={styles.donutValue}
          cx="90"
          cy="90"
          r={r}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className={styles.donutCenter}>
        <span className={styles.donutScore}>{score10}</span>
        <span className={styles.donutLabel}>/ 10 điểm</span>
      </div>
    </div>
  );
}

/* ─── Helpers ────────────────────────────────────────── */
function formatDuration(startedAt: string, submittedAt: string | null): string {
  if (!submittedAt) return 'Chưa nộp bài';
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(submittedAt).getTime();
  const diffSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes} phút ${seconds} giây`;
  return `${seconds} giây`;
}

function buildReviewItems(
  questions: ExamSessionQuestion[],
  answers: ExamSessionAnswer[],
): QuestionReviewItem[] {
  const answerMap = new Map(answers.map((a) => [a.sessionQuestionId, a]));
  return questions.map((q) => {
    const answer = answerMap.get(q.id) ?? null;
    let status: 'correct' | 'wrong' | 'unanswered' = 'unanswered';
    if (answer) {
      if (answer.isCorrect === true) status = 'correct';
      else if (answer.isCorrect === false) status = 'wrong';
      // isCorrect === null means not yet graded — treat as answered but unknown
    }
    // If the student has an answer but isCorrect is null (not graded), still show as 'unanswered'
    // in terms of correctness status
    const hasAnswer = answer && (
      answer.selectedOptionId !== null ||
      answer.shortAnswerText !== null ||
      (answer.answerJson !== null && answer.answerJson !== undefined)
    );
    if (!hasAnswer) status = 'unanswered';

    return {
      question: q,
      answer,
      status,
      earnedPoints: answer?.earnedPoints ?? 0,
      maxPoints: q.maxPoints,
    };
  });
}

function buildTypeBreakdowns(items: QuestionReviewItem[]): TypeBreakdown[] {
  const map = new Map<ExamQuestionType, TypeBreakdown>();
  for (const item of items) {
    const type = item.question.type;
    if (!map.has(type)) {
      map.set(type, {
        type,
        label: questionTypeLabel(type),
        earned: 0,
        max: 0,
        correct: 0,
        wrong: 0,
        unanswered: 0,
        total: 0,
      });
    }
    const b = map.get(type)!;
    b.earned += item.earnedPoints;
    b.max += item.maxPoints;
    b.total += 1;
    if (item.status === 'correct') b.correct += 1;
    else if (item.status === 'wrong') b.wrong += 1;
    else b.unanswered += 1;
  }
  // Sort by: multiple_choice, true_false, short_answer, essay
  const order: ExamQuestionType[] = ['multiple_choice', 'true_false', 'short_answer', 'essay'];
  return order.filter((t) => map.has(t)).map((t) => map.get(t)!);
}

function toRenderableQuestion(q: ExamSessionQuestion): RenderableQuestion {
  return {
    id: q.id,
    displayNo: q.displayNo,
    type: q.type,
    content: q.content,
    imageUrl: q.imageUrl,
    imageAltText: q.imageAltText,
    options: q.options.map((o) => ({
      id: o.id,
      label: o.label,
      content: o.content,
      imageUrl: o.imageUrl,
      imageAltText: o.imageAltText,
    })),
    trueFalseItems: q.trueFalseItems.map((t) => ({
      id: t.id,
      label: t.label,
      content: t.content,
    })),
    maxPoints: q.maxPoints,
  };
}

function getStudentAnswerLabel(
  question: ExamSessionQuestion,
  answer: ExamSessionAnswer | null,
): string {
  if (!answer) return 'Không trả lời';

  if (question.type === 'multiple_choice') {
    if (!answer.selectedOptionId) return 'Không trả lời';
    const option = question.options.find((o) => o.id === answer.selectedOptionId);
    return option ? `${option.label}. ${option.content}` : 'Không xác định';
  }

  if (question.type === 'true_false') {
    if (!answer.answerJson || typeof answer.answerJson !== 'object') return 'Không trả lời';
    const tfAnswers = answer.answerJson as Record<string, string>;
    const parts = question.trueFalseItems.map((item) => {
      const val = tfAnswers[item.id];
      const label = item.label ? `${item.label}) ` : '';
      return `${label}${val === 'true' ? 'Đúng' : val === 'false' ? 'Sai' : '—'}`;
    });
    return parts.join('; ');
  }

  if (question.type === 'short_answer' || question.type === 'essay') {
    return answer.shortAnswerText || 'Không trả lời';
  }

  return 'Không trả lời';
}

function getCorrectAnswerLabel(question: ExamSessionQuestion): string {
  if (question.type === 'multiple_choice') {
    // We don't have correct option data in the current fetch for students
    // The options don't include a `correct` field when fetched by student
    return 'Xem giải thích chi tiết';
  }
  if (question.type === 'true_false') {
    // Similarly, we don't have trueFalseItems.correct here
    return 'Xem giải thích chi tiết';
  }
  return '—';
}

/* ─── Component ──────────────────────────────────────── */
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
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

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

  /* ─── Derived data ──────────────────────────────────── */
  const reviewItems = useMemo(
    () => (examData ? buildReviewItems(examData.questions, examData.answers) : []),
    [examData],
  );

  const resultStats = useMemo(() => {
    const total = reviewItems.length;
    const correctAnswers = reviewItems.filter((i) => i.status === 'correct').length;
    const wrongAnswers = reviewItems.filter((i) => i.status === 'wrong').length;
    const empty = reviewItems.filter((i) => i.status === 'unanswered').length;
    const answered = total - empty;
    return { total, answered, correctAnswers, wrongAnswers, empty };
  }, [reviewItems]);

  const typeBreakdowns = useMemo(
    () => buildTypeBreakdowns(reviewItems),
    [reviewItems],
  );

  const filteredReviewItems = useMemo(() => {
    if (reviewFilter === 'all') return reviewItems;
    return reviewItems.filter((i) => i.status === reviewFilter);
  }, [reviewItems, reviewFilter]);

  const score = examData?.session.score;
  const maxScore = examData?.session.maxScore ?? 10;
  const score10 =
    typeof score === 'number' && maxScore > 0
      ? ((score / maxScore) * 10).toFixed(2)
      : '—';
  const progressPercent =
    typeof score === 'number' && maxScore > 0 ? (score / maxScore) * 100 : 0;
  const subjectName = examData?.room?.subjectName ?? 'Môn thi';
  const examRoomName = examData?.room?.name ?? 'Phòng thi';
  const timeTaken = examData
    ? formatDuration(examData.session.startedAt, examData.session.submittedAt)
    : '';

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
        <div className={styles.mainLayout}>
          {/* ─── Loading / Error card ─── */}
          {(isLoading || loadError) && (
            <section className={styles.card}>
              <h2>Kết quả từ cơ sở dữ liệu</h2>
              <div className={styles.body}>
                {isLoading && (
                  <p className={styles.successMessage}>
                    Đang tải kết quả từ Supabase...
                  </p>
                )}
                {loadError && <p className={styles.errorText}>{loadError}</p>}
              </div>
            </section>
          )}

          {/* ─── Main result display ─── */}
          {!isLoading && !loadError && examData && (
            <>
              {/* Score Hero Card */}
              <section className={styles.card}>
                <h2>
                  {subjectName} — {examRoomName}
                </h2>
                <div className={styles.scoreHero}>
                  <ScoreDonut percent={progressPercent} score10={score10} />
                  <div className={styles.heroDetails}>
                    <div className={styles.heroRow}>
                      <span className={`${styles.heroDot} ${styles.heroDotCorrect}`} />
                      <span>
                        Đúng: <strong>{resultStats.correctAnswers}</strong>
                      </span>
                    </div>
                    <div className={styles.heroRow}>
                      <span className={`${styles.heroDot} ${styles.heroDotWrong}`} />
                      <span>
                        Sai: <strong>{resultStats.wrongAnswers}</strong>
                      </span>
                    </div>
                    <div className={styles.heroRow}>
                      <span className={`${styles.heroDot} ${styles.heroDotEmpty}`} />
                      <span>
                        Bỏ trống: <strong>{resultStats.empty}</strong>
                      </span>
                    </div>
                    <div className={styles.heroRow}>
                      <span>
                        Tổng điểm:{' '}
                        <strong>
                          {typeof score === 'number'
                            ? `${score.toFixed(2)} / ${maxScore}`
                            : 'Chưa chấm'}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Meta tags */}
                <div className={styles.metaBar}>
                  <span className={styles.metaTag}>
                    <Clock size={14} />
                    Thời gian: {timeTaken}
                  </span>
                  <span className={styles.metaTag}>
                    <BookOpen size={14} />
                    {resultStats.answered} / {resultStats.total} câu đã trả lời
                  </span>
                  <span className={styles.metaTag}>
                    <Award size={14} />
                    Lần thi thứ {examData.session.attemptNumber}
                  </span>
                </div>
              </section>

              {/* Score Breakdown by Type */}
              {typeBreakdowns.length > 0 && (
                <section className={styles.card}>
                  <h2>Phân tích điểm theo dạng câu hỏi</h2>
                  <div className={styles.breakdownGrid}>
                    {typeBreakdowns.map((b) => {
                      const pct = b.max > 0 ? (b.earned / b.max) * 100 : 0;
                      return (
                        <div key={b.type} className={styles.breakdownItem}>
                          <div className={styles.breakdownType}>{b.label}</div>
                          <div className={styles.breakdownScore}>
                            {b.earned.toFixed(1)} <span>/ {b.max.toFixed(1)} điểm</span>
                          </div>
                          <div className={styles.breakdownBar}>
                            <div
                              className={styles.breakdownBarFill}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className={styles.breakdownCount}>
                            {b.correct} đúng · {b.wrong} sai · {b.unanswered} bỏ trống — {b.total} câu
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Detailed Answer Review */}
              <section className={styles.card}>
                <div className={styles.reviewHeader}>
                  <h3 className={styles.reviewTitle}>Xem lại bài làm</h3>
                  <div className={styles.reviewFilter}>
                    {(
                      [
                        ['all', 'Tất cả'],
                        ['correct', 'Đúng'],
                        ['wrong', 'Sai'],
                        ['unanswered', 'Bỏ trống'],
                      ] as [ReviewFilter, string][]
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={`${styles.filterBtn} ${
                          reviewFilter === value ? styles.filterBtnActive : ''
                        }`}
                        onClick={() => setReviewFilter(value)}
                      >
                        {label}
                        {value !== 'all' && (
                          <>
                            {' '}
                            (
                            {value === 'correct'
                              ? resultStats.correctAnswers
                              : value === 'wrong'
                                ? resultStats.wrongAnswers
                                : resultStats.empty}
                            )
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.reviewList}>
                  {filteredReviewItems.length === 0 && (
                    <p style={{ textAlign: 'center', color: 'var(--muted)', fontWeight: 700 }}>
                      Không có câu hỏi nào ở bộ lọc này.
                    </p>
                  )}
                  {filteredReviewItems.map((item) => {
                    const isExpanded = expandedItems.has(item.question.id);
                    const statusClass =
                      item.status === 'correct'
                        ? styles.reviewItemCorrect
                        : item.status === 'wrong'
                          ? styles.reviewItemWrong
                          : styles.reviewItemUnanswered;

                    return (
                      <div
                        key={item.question.id}
                        className={`${styles.reviewItem} ${statusClass}`}
                      >
                        <button
                          type="button"
                          className={styles.reviewItemHead}
                          onClick={() => toggleExpand(item.question.id)}
                          style={{ cursor: 'pointer', width: '100%', border: 'none', background: 'inherit' }}
                        >
                          <span className={styles.reviewItemNo}>
                            Câu {item.question.displayNo} — {questionTypeLabel(item.question.type)}
                          </span>
                          <div className={styles.reviewItemBadges}>
                            <span
                              className={`${styles.badge} ${
                                item.status === 'correct'
                                  ? styles.badgeCorrect
                                  : item.status === 'wrong'
                                    ? styles.badgeWrong
                                    : styles.badgeUnanswered
                              }`}
                            >
                              {item.status === 'correct'
                                ? '✓ Đúng'
                                : item.status === 'wrong'
                                  ? '✗ Sai'
                                  : '— Chưa trả lời'}
                            </span>
                            <span className={`${styles.badge} ${styles.badgePoints}`}>
                              {item.earnedPoints.toFixed(1)} / {item.maxPoints.toFixed(1)} đ
                            </span>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className={styles.reviewItemBody}>
                            <QuestionRenderer
                              question={toRenderableQuestion(item.question)}
                              selectedOptionId={item.answer?.selectedOptionId ?? undefined}
                              trueFalseAnswers={
                                item.question.type === 'true_false' &&
                                item.answer?.answerJson &&
                                typeof item.answer.answerJson === 'object'
                                  ? (item.answer.answerJson as Record<string, 'true' | 'false'>)
                                  : undefined
                              }
                              textValue={item.answer?.shortAnswerText ?? ''}
                              showSolutions={false}
                            />
                            <div className={styles.answerCompare}>
                              <div className={`${styles.answerRow} ${styles.answerRowStudent}`}>
                                <span className={styles.answerLabel}>Bạn chọn:</span>
                                <span className={styles.answerValue}>
                                  {getStudentAnswerLabel(item.question, item.answer)}
                                </span>
                              </div>
                              {item.status !== 'unanswered' && (
                                <div className={`${styles.answerRow} ${styles.answerRowCorrect}`}>
                                  <span className={styles.answerLabel}>Đáp án:</span>
                                  <span className={styles.answerValue}>
                                    {item.status === 'correct'
                                      ? '✓ Câu trả lời của bạn đúng!'
                                      : getCorrectAnswerLabel(item.question)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Finish button */}
              <div className={styles.actions}>
                <button className="btn" type="button" onClick={handleFinish}>
                  Hoàn thành
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
