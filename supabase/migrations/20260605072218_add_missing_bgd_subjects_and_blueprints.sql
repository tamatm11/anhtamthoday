
-- ============================================================
-- THÊM 2 MÔN THI CÒN THIẾU THEO CẤU TRÚC BGD 2025
-- Địa lý & GDKT&PL (Giáo dục Kinh tế và Pháp luật)
-- ============================================================

INSERT INTO public.subjects (code, name, exam_group, default_duration_minutes, is_compulsory, is_active)
VALUES
    ('GEOGRAPHY',  'Địa lý',                       'social_science', 50, false, true),
    ('CIVICS',     'Giáo dục Kinh tế và Pháp luật', 'social_science', 50, false, true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- BLUEPRINT: Địa lý — 50 phút
-- Cấu trúc BGD 2025: 24 MC + 4 TF (giống Lịch sử)
-- 24 × 0.25 = 6đ + 4 × 1đ = 4đ = 10đ
-- ============================================================

WITH bp AS (
    INSERT INTO public.exam_blueprints
        (code, subject_code, exam_year, program_version, name, form_label,
         duration_minutes, total_score, status, locked)
    VALUES
        ('GEOGRAPHY_2025', 'GEOGRAPHY', 2025, 'GDPT_2018',
         'Cấu trúc đề thi Địa lý THPT 2025', 'objective', 50, 10.00, 'published', true)
    ON CONFLICT (code) DO NOTHING
    RETURNING id
),
s1 AS (
    INSERT INTO public.exam_blueprint_sections
        (blueprint_id, section_code, seq, title, question_type,
         displayed_question_count, required_question_count,
         items_per_question, max_points_per_question, grading_mode, instructions)
    SELECT id, 'I', 1,
           'Phần I – Trắc nghiệm nhiều lựa chọn', 'multiple_choice',
           24, 24, 1, 0.25, 'auto',
           'Mỗi câu hỏi thí sinh chọn một đáp án đúng (A, B, C hoặc D).'
    FROM bp
    ON CONFLICT DO NOTHING
    RETURNING id, displayed_question_count
),
s2 AS (
    INSERT INTO public.exam_blueprint_sections
        (blueprint_id, section_code, seq, title, question_type,
         displayed_question_count, required_question_count,
         items_per_question, max_points_per_question, grading_mode, instructions)
    SELECT id, 'II', 2,
           'Phần II – Trắc nghiệm đúng/sai', 'true_false',
           4, 4, 4, 1.00, 'auto',
           'Mỗi câu có 4 ý; thí sinh xác định đúng (Đ) hoặc sai (S) cho mỗi ý.'
    FROM bp
    ON CONFLICT DO NOTHING
    RETURNING id
)
INSERT INTO public.exam_blueprint_section_score_steps (section_id, correct_item_count, points)
SELECT s2.id, v.cnt, v.pts
FROM s2, (VALUES (0,0.00),(1,0.10),(2,0.25),(3,0.50),(4,1.00)) AS v(cnt,pts)
ON CONFLICT DO NOTHING;

-- ============================================================
-- BLUEPRINT: GDKT&PL — 50 phút
-- Cấu trúc BGD 2025: 24 MC + 4 TF (giống Lịch sử, Địa lý)
-- ============================================================

WITH bp AS (
    INSERT INTO public.exam_blueprints
        (code, subject_code, exam_year, program_version, name, form_label,
         duration_minutes, total_score, status, locked)
    VALUES
        ('CIVICS_2025', 'CIVICS', 2025, 'GDPT_2018',
         'Cấu trúc đề thi GDKT&PL THPT 2025', 'objective', 50, 10.00, 'published', true)
    ON CONFLICT (code) DO NOTHING
    RETURNING id
),
s1 AS (
    INSERT INTO public.exam_blueprint_sections
        (blueprint_id, section_code, seq, title, question_type,
         displayed_question_count, required_question_count,
         items_per_question, max_points_per_question, grading_mode, instructions)
    SELECT id, 'I', 1,
           'Phần I – Trắc nghiệm nhiều lựa chọn', 'multiple_choice',
           24, 24, 1, 0.25, 'auto',
           'Mỗi câu hỏi thí sinh chọn một đáp án đúng (A, B, C hoặc D).'
    FROM bp
    ON CONFLICT DO NOTHING
    RETURNING id
),
s2 AS (
    INSERT INTO public.exam_blueprint_sections
        (blueprint_id, section_code, seq, title, question_type,
         displayed_question_count, required_question_count,
         items_per_question, max_points_per_question, grading_mode, instructions)
    SELECT id, 'II', 2,
           'Phần II – Trắc nghiệm đúng/sai', 'true_false',
           4, 4, 4, 1.00, 'auto',
           'Mỗi câu có 4 ý; thí sinh xác định đúng (Đ) hoặc sai (S) cho mỗi ý.'
    FROM bp
    ON CONFLICT DO NOTHING
    RETURNING id
)
INSERT INTO public.exam_blueprint_section_score_steps (section_id, correct_item_count, points)
SELECT s2.id, v.cnt, v.pts
FROM s2, (VALUES (0,0.00),(1,0.10),(2,0.25),(3,0.50),(4,1.00)) AS v(cnt,pts)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Section score rules mặc định (required cho mỗi section mới)
-- ============================================================
INSERT INTO public.exam_blueprint_section_rules (section_id)
SELECT bs.id
FROM public.exam_blueprint_sections bs
JOIN public.exam_blueprints eb ON eb.id = bs.blueprint_id
WHERE eb.code IN ('GEOGRAPHY_2025', 'CIVICS_2025')
ON CONFLICT DO NOTHING;
;
