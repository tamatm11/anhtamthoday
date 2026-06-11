
-- ================================================================
-- Migration: Enable RLS + policies for 3 tables
-- Tables: question_tf_score_steps, payments, question_audit_log
-- Pattern: nhất quán với toàn bộ schema hiện tại
-- ================================================================


-- ================================================================
-- 1. question_tf_score_steps
--    Lưu thang điểm TF: số ý đúng → số điểm
--    Không phải đáp án → học sinh được đọc trong khi thi
-- ================================================================
ALTER TABLE public.question_tf_score_steps ENABLE ROW LEVEL SECURITY;

-- Học sinh đọc được khi đang thi câu hỏi đó (giống question_options)
CREATE POLICY "Score steps visible with question"
  ON public.question_tf_score_steps
  FOR SELECT
  TO authenticated
  USING (private.can_read_question(question_id));

-- Chỉ staff (teacher + admin) quản lý thang điểm
CREATE POLICY "Staff manages tf score steps"
  ON public.question_tf_score_steps
  FOR ALL
  TO authenticated
  USING (private.is_staff())
  WITH CHECK (private.is_staff());


-- ================================================================
-- 2. payments
--    Dữ liệu tài chính — nhạy cảm nhất trong 3 bảng
-- ================================================================
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Học sinh chỉ thấy giao dịch của chính mình; staff thấy tất cả
CREATE POLICY "Payments visible to owner or staff"
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (
    (student_id = (SELECT auth.uid()))
    OR private.is_staff()
  );

-- Chỉ staff tạo bản ghi thanh toán
CREATE POLICY "Staff inserts payments"
  ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK (private.is_staff());

-- Chỉ staff cập nhật trạng thái thanh toán
CREATE POLICY "Staff updates payments"
  ON public.payments
  FOR UPDATE
  TO authenticated
  USING (private.is_staff())
  WITH CHECK (private.is_staff());

-- Chỉ admin được xóa giao dịch (không được phép với teacher)
CREATE POLICY "Admin deletes payments"
  ON public.payments
  FOR DELETE
  TO authenticated
  USING (private.is_admin());


-- ================================================================
-- 3. question_audit_log
--    Nhật ký thay đổi câu hỏi — immutable về mặt logic
-- ================================================================
ALTER TABLE public.question_audit_log ENABLE ROW LEVEL SECURITY;

-- Chỉ staff (teacher + admin) đọc được audit log
CREATE POLICY "Staff reads audit log"
  ON public.question_audit_log
  FOR SELECT
  TO authenticated
  USING (private.is_staff());

-- Staff ghi log khi sửa câu hỏi (cũng được ghi bởi trigger)
CREATE POLICY "Staff inserts audit log"
  ON public.question_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (private.is_staff());

-- Audit log là immutable: không ai UPDATE được
-- (không tạo UPDATE policy → mọi UPDATE đều bị block)

-- Chỉ admin purge log cũ (ví dụ: xóa log > 1 năm)
CREATE POLICY "Admin deletes audit log"
  ON public.question_audit_log
  FOR DELETE
  TO authenticated
  USING (private.is_admin());
;
