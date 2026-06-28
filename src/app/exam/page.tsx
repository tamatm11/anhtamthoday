'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Flag, Maximize, Moon, Sun, AlertTriangle, X, Eye } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  fetchExamSessionData,
  saveSessionAnswer,
  type ExamSessionData,
  type ExamSessionQuestion,
} from '@/lib/supabase/exam-data';
import QuestionRenderer from '@/components/question/QuestionRenderer';
import { useExamStore } from '@/store/useExamStore';
import styles from '@/styles/exam.module.css';

type TrueFalseDraft = Record<string, 'true' | 'false'>;

function readTrueFalseAnswer(value: unknown): TrueFalseDraft {
  if (!value || typeof value !== 'object' || !('items' in value)) {
    return {};
  }

  const items = (value as { items?: unknown }).items;
  if (!items || typeof items !== 'object') {
    return {};
  }

  return Object.entries(items as Record<string, unknown>).reduce<TrueFalseDraft>(
    (draft, [itemId, itemValue]) => {
      if (itemValue === 'true' || itemValue === true) {
        draft[itemId] = 'true';
      }
      if (itemValue === 'false' || itemValue === false) {
        draft[itemId] = 'false';
      }
      return draft;
    },
    {},
  );
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

export default function ExamPage() {
  const router = useRouter();
  const {
    hasHydrated,
    theme,
    setTheme,
    zoom,
    setZoom,
    currentQuestion,
    setCurrentQuestion,
    marked,
    toggleMark,
    candidateInfo,
    roomKey,
    currentSessionId,
    finishSession,
  } = useExamStore();

  // Tạo client 1 lần và tái sử dụng trong mọi handlers
  const supabase = useMemo(() => createClient(), []);

  const [examData, setExamData] = useState<ExamSessionData | null>(null);
  const [choiceAnswers, setChoiceAnswers] = useState<Record<string, string>>({});
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [trueFalseAnswers, setTrueFalseAnswers] = useState<
    Record<string, TrueFalseDraft>
  >({});
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showTabWarning, setShowTabWarning] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    if (!hasHydrated) return;

    if (!candidateInfo) {
      router.push('/');
      return;
    }

    if (!roomKey || !currentSessionId) {
      router.push('/subjects');
    }
  }, [candidateInfo, currentSessionId, hasHydrated, roomKey, router]);

  useEffect(() => {
    if (!hasHydrated || !currentSessionId) return;

    let isMounted = true;

    fetchExamSessionData(supabase, currentSessionId)
      .then((data) => {
        if (!isMounted) return;

        // Tính elapsed time từ started_at để timer không reset về 0 khi reload
        const durationSec = (data.room?.durationMinutes ?? 50) * 60;
        if (data.session.startedAt) {
          const alreadyElapsed = Math.floor(
            (Date.now() - new Date(data.session.startedAt).getTime()) / 1000,
          );
          setElapsedSeconds(Math.min(Math.max(alreadyElapsed, 0), durationSec));
        }

        const nextChoices: Record<string, string> = {};
        const nextTexts: Record<string, string> = {};
        const nextTrueFalse: Record<string, TrueFalseDraft> = {};

        data.answers.forEach((answer) => {
          const question = data.questions.find(
            (item) => item.id === answer.sessionQuestionId,
          );
          if (!question) return;

          if (question.type === 'multiple_choice' && answer.selectedOptionId) {
            nextChoices[question.id] = answer.selectedOptionId;
          }

          if (
            question.type === 'short_answer' ||
            question.type === 'essay'
          ) {
            nextTexts[question.id] = answer.shortAnswerText ?? '';
          }

          if (question.type === 'true_false') {
            nextTrueFalse[question.id] = readTrueFalseAnswer(answer.answerJson);
          }
        });

        setExamData(data);
        setChoiceAnswers(nextChoices);
        setTextAnswers(nextTexts);
        setTrueFalseAnswers(nextTrueFalse);
        setLoadError('');
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        const message =
          error instanceof Error
            ? error.message
            : 'Không thể tải phiên thi từ Supabase.';
        setLoadError(message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentSessionId, hasHydrated, supabase]);

  const questions = useMemo(() => examData?.questions ?? [], [examData]);
  const totalQuestions = questions.length;
  const durationSeconds = (examData?.room?.durationMinutes ?? 50) * 60;

  useEffect(() => {
    if (currentQuestion > Math.max(totalQuestions, 1)) {
      setCurrentQuestion(1);
    }
  }, [currentQuestion, setCurrentQuestion, totalQuestions]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) =>
        prev < durationSeconds ? prev + 1 : durationSeconds,
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [durationSeconds]);

  const answeredCount = useMemo(
    () =>
      questions.filter((question) => {
        if (question.type === 'multiple_choice') {
          return Boolean(choiceAnswers[question.id]);
        }
        if (question.type === 'true_false') {
          return Object.keys(trueFalseAnswers[question.id] ?? {}).length > 0;
        }
        return Boolean(textAnswers[question.id]?.trim());
      }).length,
    [choiceAnswers, questions, textAnswers, trueFalseAnswers],
  );

  const timeLeft = Math.max(durationSeconds - elapsedSeconds, 0);
  const room = examData?.room;
  const timerWarning = timeLeft <= 60 ? 'critical' : timeLeft <= 300 ? 'warning' : 'normal';

  const unansweredQuestions = useMemo(
    () =>
      questions.filter((question) => {
        if (question.type === 'multiple_choice') return !choiceAnswers[question.id];
        if (question.type === 'true_false')
          return Object.keys(trueFalseAnswers[question.id] ?? {}).length === 0;
        return !textAnswers[question.id]?.trim();
      }),
    [choiceAnswers, questions, textAnswers, trueFalseAnswers],
  );

  const markedQuestions = useMemo(
    () => questions.filter((q) => marked.includes(q.number)),
    [questions, marked],
  );

  const scrollToQuestion = useCallback((questionNumber: number) => {
    const el = document.getElementById(`question-${questionNumber}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const showSaveIndicator = useCallback((status: 'saving' | 'saved' | 'error') => {
    setSaveStatus(status);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (status === 'saved') {
      saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    }
  }, []);

  const persistChoice = useCallback(async (
    question: ExamSessionQuestion,
    optionId: string,
    label: string,
  ) => {
    setChoiceAnswers((current) => ({ ...current, [question.id]: optionId }));
    setCurrentQuestion(question.number);
    setSaveError('');
    showSaveIndicator('saving');

    try {
      await saveSessionAnswer(supabase, {
        sessionQuestionId: question.id,
        selectedOptionId: optionId,
        answerJson: {
          type: 'multiple_choice',
          option_id: optionId,
          label,
        },
      });
      showSaveIndicator('saved');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Không thể lưu đáp án.';
      setSaveError(message);
      showSaveIndicator('error');
    }
  }, [setCurrentQuestion, showSaveIndicator, supabase]);

  const handleSubmit = useCallback(async (force = false) => {
    if (!force) {
      setShowReviewPanel(true);
      return;
    }

    // Gọi RPC để ghi trạng thái 'submitted' vào DB trước khi navigate
    if (currentSessionId) {
      try {
        await supabase.rpc('submit_exam_session', {
          p_session_id: currentSessionId,
        });
      } catch {
        // Không block UX nếu RPC thất bại (network issue, v.v.)
      }
    }

    finishSession();
    router.push('/result');
  }, [currentSessionId, finishSession, router, supabase]);

  const handleConfirmSubmit = useCallback(async () => {
    setShowReviewPanel(false);
    await handleSubmit(true);
  }, [handleSubmit]);

  useEffect(() => {
    if (timeLeft !== 0 || isLoading || !examData || autoSubmittedRef.current) {
      return;
    }

    autoSubmittedRef.current = true;
    const timeout = window.setTimeout(() => {
      void handleSubmit(true);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [examData, handleSubmit, isLoading, timeLeft]);

  // Anti-cheat: detect tab switching
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && examData && !isLoading) {
        setTabSwitchCount((c) => c + 1);
        setShowTabWarning(true);
        setTimeout(() => setShowTabWarning(false), 4000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [examData, isLoading]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showReviewPanel) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      const q = questions[currentQuestion - 1];
      switch (e.key.toLowerCase()) {
        case 'n':
        case 'arrowright':
          e.preventDefault();
          if (currentQuestion < totalQuestions) {
            setCurrentQuestion(currentQuestion + 1);
            scrollToQuestion(currentQuestion + 1);
          }
          break;
        case 'p':
        case 'arrowleft':
          e.preventDefault();
          if (currentQuestion > 1) {
            setCurrentQuestion(currentQuestion - 1);
            scrollToQuestion(currentQuestion - 1);
          }
          break;
        case 'm':
          e.preventDefault();
          toggleMark(currentQuestion);
          break;
        case '1': case '2': case '3': case '4':
          if (q?.type === 'multiple_choice') {
            const optIndex = parseInt(e.key) - 1;
            const opt = q.options[optIndex];
            if (opt) {
              e.preventDefault();
              void persistChoice(q, opt.id, opt.label);
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentQuestion,
    persistChoice,
    questions,
    scrollToQuestion,
    setCurrentQuestion,
    showReviewPanel,
    toggleMark,
    totalQuestions,
  ]);

  const handleNext = () => {
    if (currentQuestion < totalQuestions) {
      setCurrentQuestion(currentQuestion + 1);
      scrollToQuestion(currentQuestion + 1);
    }
  };

  const handlePrev = () => {
    if (currentQuestion > 1) {
      setCurrentQuestion(currentQuestion - 1);
      scrollToQuestion(currentQuestion - 1);
    }
  };

  const persistTrueFalse = async (
    question: ExamSessionQuestion,
    itemId: string,
    value: 'true' | 'false',
  ) => {
    const nextDraft = {
      ...(trueFalseAnswers[question.id] ?? {}),
      [itemId]: value,
    };

    setTrueFalseAnswers((current) => ({
      ...current,
      [question.id]: nextDraft,
    }));
    setCurrentQuestion(question.number);
    setSaveError('');
    showSaveIndicator('saving');

    try {
      await saveSessionAnswer(supabase, {
        sessionQuestionId: question.id,
        answerJson: {
          type: 'true_false',
          items: nextDraft,
        },
      });
      showSaveIndicator('saved');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Không thể lưu đáp án.';
      setSaveError(message);
      showSaveIndicator('error');
    }
  };

  const persistTextAnswer = async (question: ExamSessionQuestion) => {
    const value = textAnswers[question.id]?.trim() ?? '';
    if (!value) return;

    setSaveError('');
    showSaveIndicator('saving');
    try {
      await saveSessionAnswer(supabase, {
        sessionQuestionId: question.id,
        shortAnswerText: value,
        answerJson: {
          type: question.type,
          value,
        },
      });
      showSaveIndicator('saved');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Không thể lưu đáp án.';
      setSaveError(message);
      showSaveIndicator('error');
    }
  };



  if (!hasHydrated || !roomKey || !candidateInfo || !currentSessionId) {
    return null;
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div>
          <div className={styles.candidateLine}>{candidateInfo.name}</div>
          <div className={styles.candidateSub}>
            SBD: {candidateInfo.code} &nbsp;&nbsp; Môn thi:{' '}
            {(room?.subjectName ?? 'Đang tải').toLocaleUpperCase('vi-VN')}
            &nbsp;&nbsp; {room?.name ?? 'Phiên thi'} &nbsp;&nbsp; Ca thi:{' '}
            {candidateInfo.session}
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={`${styles.timer} ${timerWarning === 'critical' ? styles.timerCritical : timerWarning === 'warning' ? styles.timerWarning : ''}`}>
            <span>⏱</span> <span>{formatTime(timeLeft)}</span>
          </div>
          <div className={styles.connection}>
            <span className={`${styles.connectionDot} ${saveStatus === 'error' ? styles.connectionError : ''}`}></span>
            <span>{
              saveStatus === 'saving' ? 'Đang lưu...' :
              saveStatus === 'saved' ? '✓ Đã lưu' :
              saveStatus === 'error' ? 'Lỗi lưu' :
              'Đang kết nối'
            }</span>
          </div>
          <button
            className={styles.submitBtn}
            onClick={() => void handleSubmit(false)}
            disabled={isLoading}
          >
            NỘP BÀI
          </button>
          <button
            className={styles.headerIconBtn}
            aria-label="Bật hoặc tắt toàn màn hình"
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen?.();
              } else {
                document.exitFullscreen?.();
              }
            }}
          >
            <Maximize size={16} />
          </button>
          <button
            className="theme-toggle"
            aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <span className="icon">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </span>
          </button>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <button className="btn secondary small" onClick={handlePrev}>
            Quay lại
          </button>
          <button className="btn small" onClick={handleNext}>
            Tiếp theo
          </button>
          <button
            className="btn secondary small"
            onClick={() => setZoom(Math.max(100, zoom - 25))}
          >
            A-
          </button>
          <button
            className="btn secondary small"
            onClick={() => setZoom(Math.min(150, zoom + 25))}
          >
            A+
          </button>
          <select
            className={styles.zoomSelect}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            <option value={100}>100%</option>
            <option value={125}>125%</option>
            <option value={150}>150%</option>
          </select>
          <button className="btn secondary small" onClick={() => setZoom(100)}>
            Đặt lại
          </button>
        </div>
        <div className={styles.toolbarGroup}>
          <span className={styles.answeredCount}>
            Đã trả lời: {answeredCount} / {totalQuestions}
            {markedQuestions.length > 0 && ` · ${markedQuestions.length} đánh dấu`}
          </span>
          <button
            className="btn outline small"
            onClick={() => setShowReviewPanel(true)}
          >
            <Eye size={14} /> Xem lại
          </button>
        </div>
      </div>

      {/* Tab switch warning */}
      {showTabWarning && (
        <div className={styles.tabWarning}>
          <AlertTriangle size={16} />
          <span>Bạn đã rời khỏi tab thi! ({tabSwitchCount} lần)</span>
        </div>
      )}

      <div className={styles.content}>
        <article className={styles.passagePanel}>
          <h2>{room?.name ?? 'Phiên thi từ cơ sở dữ liệu'}</h2>
          <p>
            <strong>{room?.blueprintName ?? 'Đang tải cấu trúc đề thi'}</strong>
          </p>
          <p>Mã phòng: {room?.code ?? '...'}</p>
          <p>Thời gian làm bài: {room?.durationMinutes ?? 50} phút</p>
          <p>Số lượt/key: {room?.totalAttemptsDefault ?? 3}</p>
          {loadError ? <p className={styles.errorText}>{loadError}</p> : null}
          {saveError ? <p className={styles.errorText}>{saveError}</p> : null}
          <p className={styles.passageNote}>
            Nội dung câu hỏi bên phải được tải từ bảng câu hỏi của phiên thi.
          </p>
        </article>
        <section className={styles.questionPanel}>
          {isLoading ? (
            <div className={styles.emptyState}>Đang tải câu hỏi từ Supabase...</div>
          ) : null}
          {!isLoading && questions.length === 0 && !loadError ? (
            <div className={styles.emptyState}>
              Cơ sở dữ liệu chưa có câu hỏi cho phiên thi này.
            </div>
          ) : null}
          {questions.map((question) => {
            const selected = choiceAnswers[question.id];
            const textValue = textAnswers[question.id] ?? '';
            const tfDraft = trueFalseAnswers[question.id] ?? {};
            const isAnswered =
              Boolean(selected) ||
              Boolean(textValue.trim()) ||
              Object.keys(tfDraft).length > 0;
            const isMarked = marked.includes(question.number);
            const isCurrent = question.number === currentQuestion;

            return (
              <article
                key={question.id}
                id={`question-${question.number}`}
                className={`${styles.questionBlock} ${
                  isAnswered ? styles.answered : ''
                } ${isMarked ? styles.marked : ''} ${
                  isCurrent ? styles.current : ''
                }`}
              >
                <button
                  className={`${styles.flagBtn} ${isMarked ? styles.marked : ''}`}
                  aria-label={isMarked ? 'Bỏ đánh dấu câu hỏi' : 'Đánh dấu câu hỏi'}
                  onClick={() => toggleMark(question.number)}
                >
                  <Flag size={16} fill={isMarked ? 'currentColor' : 'none'} />
                </button>
                <QuestionRenderer
                  question={{
                    id: question.id,
                    displayNo: question.displayNo,
                    type: question.type,
                    content: question.content,
                    imageUrl: question.imageUrl,
                    imageAltText: question.imageAltText,
                    maxPoints: question.maxPoints,
                    options: question.options.map((option) => ({
                      id: option.id,
                      label: option.label,
                      content: option.content,
                      imageUrl: option.imageUrl,
                      imageAltText: option.imageAltText,
                    })),
                    trueFalseItems: question.trueFalseItems.map((item) => ({
                      id: item.id,
                      label: item.label,
                      content: item.content,
                    })),
                  }}
                  selectedOptionId={selected}
                  trueFalseAnswers={tfDraft}
                  textValue={textValue}
                  onSelectOption={(optionId, label) =>
                    void persistChoice(question, optionId, label)
                  }
                  onTrueFalseChange={(itemId, value) =>
                    void persistTrueFalse(question, itemId, value)
                  }
                  onTextChange={(value) =>
                    setTextAnswers((current) => ({
                      ...current,
                      [question.id]: value,
                    }))
                  }
                  onTextBlur={() => void persistTextAnswer(question)}
                />
              </article>
            );
          })}
        </section>
      </div>

      <nav className={styles.questionNav}>
        <div className={styles.questionButtons}>
          {questions.map((question) => {
            const answered =
              Boolean(choiceAnswers[question.id]) ||
              Boolean(textAnswers[question.id]?.trim()) ||
              Object.keys(trueFalseAnswers[question.id] ?? {}).length > 0;
            const isMarked = marked.includes(question.number);
            return (
              <button
                key={question.id}
                className={`${styles.qNumber} ${
                  answered ? styles.answered : ''
                } ${isMarked ? styles.marked : ''} ${
                  question.number === currentQuestion ? styles.current : ''
                }`}
                onClick={() => {
                  setCurrentQuestion(question.number);
                  scrollToQuestion(question.number);
                }}
              >
                {question.displayNo}
              </button>
            );
          })}
        </div>
        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.legendDot}></span>Chưa làm
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.done}`}></span>Đã làm
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.now}`}></span>Đang xem
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.mark}`}></span>Đánh dấu
          </span>
        </div>
      </nav>

      {/* Answer Review Panel */}
      {showReviewPanel && (
        <div className={styles.reviewOverlay} onClick={() => setShowReviewPanel(false)}>
          <div className={styles.reviewPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.reviewHeader}>
              <h2>Xem lại bài làm</h2>
              <button className={styles.reviewClose} onClick={() => setShowReviewPanel(false)}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.reviewStats}>
              <div className={styles.reviewStat}>
                <span className={styles.reviewStatNumber}>{answeredCount}</span>
                <span className={styles.reviewStatLabel}>Đã trả lời</span>
              </div>
              <div className={styles.reviewStat}>
                <span className={`${styles.reviewStatNumber} ${styles.statEmpty}`}>{unansweredQuestions.length}</span>
                <span className={styles.reviewStatLabel}>Chưa trả lời</span>
              </div>
              <div className={styles.reviewStat}>
                <span className={`${styles.reviewStatNumber} ${styles.statMarked}`}>{markedQuestions.length}</span>
                <span className={styles.reviewStatLabel}>Đánh dấu</span>
              </div>
            </div>

            {unansweredQuestions.length > 0 && (
              <div className={styles.reviewSection}>
                <h3>Câu chưa trả lời</h3>
                <div className={styles.reviewQuestionList}>
                  {unansweredQuestions.map((q) => (
                    <button
                      key={q.id}
                      className={styles.reviewQuestionBtn}
                      onClick={() => {
                        setShowReviewPanel(false);
                        setCurrentQuestion(q.number);
                        scrollToQuestion(q.number);
                      }}
                    >
                      Câu {q.displayNo}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {markedQuestions.length > 0 && (
              <div className={styles.reviewSection}>
                <h3>Câu đánh dấu xem lại</h3>
                <div className={styles.reviewQuestionList}>
                  {markedQuestions.map((q) => (
                    <button
                      key={q.id}
                      className={`${styles.reviewQuestionBtn} ${styles.reviewMarked}`}
                      onClick={() => {
                        setShowReviewPanel(false);
                        setCurrentQuestion(q.number);
                        scrollToQuestion(q.number);
                      }}
                    >
                      Câu {q.displayNo}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.reviewFooter}>
              <p>Thời gian còn lại: <strong>{formatTime(timeLeft)}</strong></p>
              <div className={styles.reviewActions}>
                <button className="btn secondary" onClick={() => setShowReviewPanel(false)}>
                  Quay lại làm bài
                </button>
                <button className="btn" onClick={() => void handleConfirmSubmit()}>
                  <CheckCircle size={16} /> Xác nhận nộp bài
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
