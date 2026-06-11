'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import type { ExamQuestionType } from '@/lib/supabase/exam-data';
import styles from '@/styles/question-renderer.module.css';

export type RenderableQuestionOption = {
  id: string;
  label: string;
  content: string;
  imageUrl: string | null;
  imageAltText: string | null;
  correct?: boolean;
};

export type RenderableTrueFalseItem = {
  id: string;
  label?: string | null;
  content: string;
  correct?: boolean;
};

export type RenderableQuestion = {
  id: string;
  displayNo: string;
  type: ExamQuestionType;
  content: string;
  imageUrl: string | null;
  imageAltText: string | null;
  options: RenderableQuestionOption[];
  trueFalseItems: RenderableTrueFalseItem[];
  maxPoints?: number;
};

type QuestionRendererProps = {
  question: RenderableQuestion;
  selectedOptionId?: string;
  trueFalseAnswers?: Record<string, 'true' | 'false'>;
  textValue?: string;
  showSolutions?: boolean;
  onSelectOption?: (optionId: string, label: string) => void;
  onTrueFalseChange?: (itemId: string, value: 'true' | 'false') => void;
  onTextChange?: (value: string) => void;
  onTextBlur?: () => void;
};

export function MathText({ value }: { value: string }) {
  const parts = useMemo(() => {
    const tokens: Array<
      | { type: 'text'; value: string }
      | { type: 'math'; value: string; display: boolean }
    > = [];
    const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(value))) {
      if (match.index > cursor) {
        tokens.push({ type: 'text', value: value.slice(cursor, match.index) });
      }
      tokens.push({
        type: 'math',
        value: match[1] ?? match[2],
        display: Boolean(match[1]),
      });
      cursor = pattern.lastIndex;
    }
    if (cursor < value.length) {
      tokens.push({ type: 'text', value: value.slice(cursor) });
    }
    return tokens;
  }, [value]);

  return (
    <>
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return <span key={index}>{part.value}</span>;
        }

        return (
          <span
            key={index}
            className={part.display ? styles.displayMath : styles.inlineMath}
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(part.value, {
                displayMode: part.display,
                throwOnError: false,
                trust: false,
                strict: 'warn',
              }),
            }}
          />
        );
      })}
    </>
  );
}

function QuestionImage({
  url,
  alt,
}: {
  url: string;
  alt: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!loadedRef.current) setFailed(true);
    }, 8000);
    return () => window.clearTimeout(timeout);
  }, []);

  if (failed) {
    return (
      <div className={styles.imageFallback} role="img" aria-label={alt ?? 'Ảnh lỗi'}>
        Không tải được ảnh: {alt || 'không có mô tả'}
      </div>
    );
  }

  return (
    // R2 hosts are registry-driven and cannot be enumerated in next/image config.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={styles.questionImage}
      src={url}
      alt={alt ?? ''}
      loading="lazy"
      onLoad={() => {
        loadedRef.current = true;
      }}
      onError={() => setFailed(true)}
    />
  );
}

export default function QuestionRenderer({
  question,
  selectedOptionId,
  trueFalseAnswers = {},
  textValue = '',
  showSolutions = false,
  onSelectOption,
  onTrueFalseChange,
  onTextChange,
  onTextBlur,
}: QuestionRendererProps) {
  return (
    <div className={styles.renderer}>
      <div className={styles.heading}>
        <strong>Câu {question.displayNo}.</strong>{' '}
        <MathText value={question.content} />
      </div>

      {question.maxPoints !== undefined ? (
        <p className={styles.meta}>{question.maxPoints} điểm</p>
      ) : null}

      {question.imageUrl ? (
        <QuestionImage
          key={question.imageUrl}
          url={question.imageUrl}
          alt={question.imageAltText}
        />
      ) : null}

      {question.type === 'multiple_choice' ? (
        <div className={styles.options}>
          {question.options.map((option) => (
            <label
              key={option.id}
              className={`${styles.option} ${
                showSolutions && option.correct ? styles.correctOption : ''
              }`}
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                value={option.id}
                checked={selectedOptionId === option.id}
                disabled={!onSelectOption}
                onChange={() => onSelectOption?.(option.id, option.label)}
              />
              <span className={styles.optionBody}>
                <span>
                  <strong>{option.label}.</strong>{' '}
                  <MathText value={option.content} />
                </span>
                {option.imageUrl ? (
                  <QuestionImage
                    key={option.imageUrl}
                    url={option.imageUrl}
                    alt={option.imageAltText}
                  />
                ) : null}
              </span>
            </label>
          ))}
        </div>
      ) : null}

      {question.type === 'true_false' ? (
        <div className={styles.trueFalseList}>
          {question.trueFalseItems.map((item) => (
            <div key={item.id} className={styles.trueFalseItem}>
              <span>
                {item.label ? <strong>{item.label}) </strong> : null}
                <MathText value={item.content} />
              </span>
              {showSolutions ? (
                <em>{item.correct ? 'Đúng' : 'Sai'}</em>
              ) : (
                <div className={styles.trueFalseControls}>
                  <label>
                    <input
                      type="radio"
                      name={`tf-${question.id}-${item.id}`}
                      checked={trueFalseAnswers[item.id] === 'true'}
                      onChange={() => onTrueFalseChange?.(item.id, 'true')}
                    />
                    Đúng
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`tf-${question.id}-${item.id}`}
                      checked={trueFalseAnswers[item.id] === 'false'}
                      onChange={() => onTrueFalseChange?.(item.id, 'false')}
                    />
                    Sai
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {question.type === 'short_answer' ? (
        <input
          className={styles.textAnswer}
          value={textValue}
          disabled={!onTextChange}
          onChange={(event) => onTextChange?.(event.target.value)}
          onBlur={onTextBlur}
          placeholder="Nhập câu trả lời ngắn"
        />
      ) : null}

      {question.type === 'essay' ? (
        <textarea
          className={styles.textAnswer}
          value={textValue}
          disabled={!onTextChange}
          onChange={(event) => onTextChange?.(event.target.value)}
          onBlur={onTextBlur}
          placeholder="Nhập bài làm"
          rows={8}
        />
      ) : null}
    </div>
  );
}
