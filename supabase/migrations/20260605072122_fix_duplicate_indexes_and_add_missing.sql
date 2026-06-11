
-- ============================================================
-- 1. XÓA DUPLICATE INDEXES THUẦN (không phải constraint)
-- ============================================================

-- questions: search_vector GIN trùng
DROP INDEX IF EXISTS public.idx_questions_fts;

-- knowledge_fields: parent_id btree trùng
DROP INDEX IF EXISTS public.idx_kf_parent_id;

-- exam_room_questions: question_id btree trùng
DROP INDEX IF EXISTS public.exam_room_questions_question_idx;

-- questions: knowledge_field_id btree trùng
DROP INDEX IF EXISTS public.questions_knowledge_field_idx;

-- ============================================================
-- 2. XÓA DUPLICATE UNIQUE CONSTRAINTS (dùng ALTER TABLE)
-- ============================================================
-- Mỗi bảng đang có 2 UNIQUE constraints trên cùng cột → chỉ cần 1

ALTER TABLE public.knowledge_fields
    DROP CONSTRAINT IF EXISTS unique_subject_code_slug;

ALTER TABLE public.exam_blueprint_sections
    DROP CONSTRAINT IF EXISTS unique_blueprint_id_section_code;

ALTER TABLE public.exam_blueprint_sections
    DROP CONSTRAINT IF EXISTS unique_blueprint_id_seq;

ALTER TABLE public.exam_room_papers
    DROP CONSTRAINT IF EXISTS unique_exam_room_id_paper_code;

-- ============================================================
-- 3. THÊM PARTIAL INDEXES CHO SOFT-DELETE (deleted_at IS NULL)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_questions_active
    ON public.questions (subject_code, status, type, difficulty)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_exam_rooms_active
    ON public.exam_rooms (subject_code, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_exam_keys_active
    ON public.exam_keys (assigned_to, status)
    WHERE deleted_at IS NULL;

-- ============================================================
-- 4. THÊM CÁC INDEX CÒN THIẾU
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_payments_student_id
    ON public.payments (student_id);

CREATE INDEX IF NOT EXISTS idx_payments_exam_key_id
    ON public.payments (exam_key_id);

CREATE INDEX IF NOT EXISTS idx_payments_status
    ON public.payments (status)
    WHERE status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exam_sessions_due_at
    ON public.exam_sessions (due_at)
    WHERE due_at IS NOT NULL AND status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_exam_sessions_in_progress
    ON public.exam_sessions (student_id, exam_room_id)
    WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_question_tags_tag_id
    ON public.question_tags (tag_id)
    WHERE tag_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_question_audit_log_question_time
    ON public.question_audit_log (question_id, changed_at DESC);
;
