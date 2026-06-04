'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flag, Maximize, Moon, Sun } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  fetchExamSessionData,
  questionTypeLabel,
  saveSessionAnswer,
  type ExamSessionData,
  type ExamSessionQuestion,
} from '@/lib/supabase/exam-data';
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

  const handleSubmit = async (force = false) => {
    const confirmed =
      force || window.confirm('Bạn có chắc chắn muốn nộp bài không?');
    if (!confirmed) return;

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
  };

  useEffect(() => {
    if (timeLeft === 0 && !isLoading && examData) {
      void handleSubmit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, isLoading, examData, currentSessionId, router, supabase]);

  const scrollToQuestion = (questionNumber: number) => {
    const el = document.getElementById(`question-${questionNumber}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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

  const persistChoice = async (
    question: ExamSessionQuestion,
    optionId: string,
    label: string,
  ) => {
    setChoiceAnswers((current) => ({ ...current, [question.id]: optionId }));
    setCurrentQuestion(question.number);
    setSaveError('');

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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Không thể lưu đáp án.';
      setSaveError(message);
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

    try {
      await saveSessionAnswer(supabase, {
        sessionQuestionId: question.id,
        answerJson: {
          type: 'true_false',
          items: nextDraft,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Không thể lưu đáp án.';
      setSaveError(message);
    }
  };

  const persistTextAnswer = async (question: ExamSessionQuestion) => {
    const value = textAnswers[question.id]?.trim() ?? '';
    if (!value) return;

    setSaveError('');
    try {
      await saveSessionAnswer(supabase, {
        sessionQuestionId: question.id,
        shortAnswerText: value,
        answerJson: {
          type: question.type,
          value,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Không thể lưu đáp án.';
      setSaveError(message);
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
          <div className={styles.timer}>
            <span>⏱</span> <span>{formatTime(timeLeft)}</span>
          </div>
          <div className={styles.connection}>
            <span className={styles.connectionDot}></span>
            <span>{saveError ? 'Lỗi lưu' : 'Đang kết nối'}</span>
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
            Số câu đã trả lời: {answeredCount} / {totalQuestions}
          </span>
          <button className="btn outline small" disabled>
            Lưu tự động
          </button>
        </div>
      </div>

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
                  onClick={() => toggleMark(question.number)}
                >
                  <Flag size={16} fill={isMarked ? 'currentColor' : 'none'} />
                </button>
                <p className={styles.questionTitle}>
                  Câu {question.displayNo}. {question.content}
                </p>
                <p className={styles.questionType}>
                  {questionTypeLabel(question.type)} · {question.maxPoints} điểm
                </p>

                {question.type === 'multiple_choice' ? (
                  <div className={styles.answers}>
                    {question.options.length === 0 ? (
                      <div className={styles.emptyState}>
                        Câu hỏi này chưa có đáp án lựa chọn trong DB.
                      </div>
                    ) : null}
                    {question.options.map((option) => (
                      <label key={option.id} className={styles.answerOption}>
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          value={option.id}
                          checked={selected === option.id}
                          onChange={() =>
                            void persistChoice(question, option.id, option.label)
                          }
                        />
                        <span>
                          <strong>{option.label}.</strong> {option.content}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}

                {question.type === 'true_false' ? (
                  <div className={styles.trueFalseList}>
                    {question.trueFalseItems.length === 0 ? (
                      <div className={styles.emptyState}>
                        Câu đúng/sai này chưa có mệnh đề trong DB.
                      </div>
                    ) : null}
                    {question.trueFalseItems.map((item) => (
                      <div key={item.id} className={styles.trueFalseItem}>
                        <span>{item.content}</span>
                        <label>
                          <input
                            type="radio"
                            name={`tf-${question.id}-${item.id}`}
                            checked={tfDraft[item.id] === 'true'}
                            onChange={() =>
                              void persistTrueFalse(question, item.id, 'true')
                            }
                          />
                          Đúng
                        </label>
                        <label>
                          <input
                            type="radio"
                            name={`tf-${question.id}-${item.id}`}
                            checked={tfDraft[item.id] === 'false'}
                            onChange={() =>
                              void persistTrueFalse(question, item.id, 'false')
                            }
                          />
                          Sai
                        </label>
                      </div>
                    ))}
                  </div>
                ) : null}

                {question.type === 'short_answer' ? (
                  <input
                    className={styles.textAnswer}
                    value={textValue}
                    onChange={(event) =>
                      setTextAnswers((current) => ({
                        ...current,
                        [question.id]: event.target.value,
                      }))
                    }
                    onBlur={() => void persistTextAnswer(question)}
                    placeholder="Nhập câu trả lời ngắn"
                  />
                ) : null}

                {question.type === 'essay' ? (
                  <textarea
                    className={styles.textAnswer}
                    value={textValue}
                    onChange={(event) =>
                      setTextAnswers((current) => ({
                        ...current,
                        [question.id]: event.target.value,
                      }))
                    }
                    onBlur={() => void persistTextAnswer(question)}
                    placeholder="Nhập bài làm"
                    rows={8}
                  />
                ) : null}
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
    </div>
  );
}
