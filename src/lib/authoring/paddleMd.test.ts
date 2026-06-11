import { describe, expect, it } from 'vitest';
import { parsePaddleMarkdown } from './paddleMd';

// Minimal fixture reproducing the awkward shapes of the real PaddleOCR-VL
// export: dual exam/solution halves, per-part renumbering, a <div>-wrapped
// question header, dropped b)/d) statement labels, a "Suy ra ý a) Đúng" verdict
// and an "Đáp số:" short answer.
const MD = `ĐỀ TEST

PHẦN I. Câu trắc nghiệm nhiều phương án

Câu 1. Nội dung câu 1 là $x^2$.

<div style="text-align: center;"><img src="https://cdn.test/q1.jpg" alt="Image" /></div>

A. $1$. B. $2$. C. $3$. D. $4$.

PHẦN II. Câu trắc nghiệm đúng sai

Câu 2. Cho hàm số có đồ thị như hình:

a) Mệnh đề a đúng.

Mệnh đề b không có nhãn.

c) Mệnh đề c.

Mệnh đề d không có nhãn.

PHẦN III. Câu trắc nghiệm trả lời ngắn

<div style="text-align: center;"><div style="text-align: center;">Câu 1. Tính giá trị của $2+2$?</div></div>

# HƯỚNG DẪN GIẢI

PHẦN I. Câu trắc nghiệm nhiều phương án

Câu 1. Lời giải. Đáp án là $ \\underline{\\text{C.}} $ vì lý do.

PHÀN II. Câu trắc nghiệm đúng sai

Câu 1. Suy ra ý a) Đúng. b) Sai. Suy ra ý c) Đúng. d) Sai.

PHẦN III. Câu trắc nghiệm trả lời ngắn

Câu 1. Đáp số: 4.
`;

describe('parsePaddleMarkdown', () => {
  const parsed = parsePaddleMarkdown(MD, 'Đề test');

  it('keys questions by part + position regardless of source numbering', () => {
    expect(parsed.questions.map((q) => q.key)).toEqual(['I-1', 'II-1', 'III-1']);
  });

  it('maps parts to question types', () => {
    expect(parsed.questions[0].type).toBe('multiple_choice');
    expect(parsed.questions[1].type).toBe('true_false');
    expect(parsed.questions[2].type).toBe('short_answer');
  });

  it('parses multiple-choice options and the underlined answer', () => {
    const mc = parsed.questions[0];
    expect(mc.options.map((o) => o.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(mc.options[2].content).toBe('$3$');
    expect(mc.optionCorrect).toBe('C');
    expect(mc.images).toHaveLength(1);
    expect(mc.images[0].url).toBe('https://cdn.test/q1.jpg');
  });

  it('recovers four statements even when b)/d) labels were dropped', () => {
    const tf = parsed.questions[1];
    expect(tf.statements.map((s) => s.label)).toEqual(['a', 'b', 'c', 'd']);
    expect(tf.statements[1].content).toBe('Mệnh đề b không có nhãn.');
  });

  it('reads true/false verdicts from "Suy ra ý a) Đúng" prose', () => {
    const tf = parsed.questions[1];
    expect(tf.statements.map((s) => s.correct)).toEqual([true, false, true, false]);
  });

  it('detects a <div>-wrapped question header and its short answer', () => {
    const sa = parsed.questions[2];
    expect(sa.content).toContain('Tính giá trị');
    expect(sa.answer).toBe('4');
  });

  it('collects distinct image URLs', () => {
    expect(parsed.imageUrls).toEqual(['https://cdn.test/q1.jpg']);
  });
});
