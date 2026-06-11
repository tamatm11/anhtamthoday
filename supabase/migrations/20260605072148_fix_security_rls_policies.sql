
-- ============================================================
-- 1. FIX r2_assets: restrict read thay vì cho all authenticated
--    Hiện tại qual=true → mọi user đều đọc được metadata tất cả assets
--    Sửa: chỉ uploader, staff, hoặc linked đến question đang thi
-- ============================================================
DROP POLICY IF EXISTS r2_assets_read_auth ON public.r2_assets;

CREATE POLICY r2_assets_read_restricted ON public.r2_assets
    FOR SELECT TO authenticated
    USING (
        private.is_staff()
        OR uploaded_by = (SELECT auth.uid())
        OR (
            linked_to_type IN ('question', 'question_option', 'question_group')
            AND EXISTS (
                SELECT 1
                FROM public.exam_session_questions esq
                JOIN public.exam_sessions es ON es.id = esq.session_id
                WHERE esq.question_id = r2_assets.linked_to_id
                  AND es.student_id = (SELECT auth.uid())
                  AND es.status = 'in_progress'
            )
        )
        OR linked_to_type IN ('subject', 'profile', 'other')
    );

-- ============================================================
-- 2. THÊM UPDATE policy cho r2_assets (hiện đang thiếu hoàn toàn)
-- ============================================================
CREATE POLICY r2_assets_update_staff ON public.r2_assets
    FOR UPDATE TO authenticated
    USING (private.is_staff())
    WITH CHECK (private.is_staff());

-- ============================================================
-- 3. FIX profiles: bỏ policy {public} thừa
--    "Không tự đổi role" dùng role {public} (bao gồm anon) nhưng
--    không có INSERT/SELECT anon → dead code, có thể gây nhầm lẫn
--    Logic đã được bao hàm trong "Profile updates are owner-limited or staff"
-- ============================================================
DROP POLICY IF EXISTS "Không tự đổi role" ON public.profiles;

-- Tạo lại rõ ràng hơn, chỉ cho authenticated, đảm bảo role không tự tăng
CREATE POLICY profiles_no_self_role_escalation ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = (SELECT auth.uid()))
    WITH CHECK (
        private.is_admin()
        OR role = (SELECT p.role FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
    );

-- ============================================================
-- 4. TĂNG CƯỜNG: session_answers INSERT check rõ ràng hơn
--    Đảm bảo student không thể submit answer cho session của người khác
--    bằng cách thêm explicit student_id check trong WITH CHECK
-- ============================================================

-- Hiện tại policy đã đúng nhưng thêm check rõ session.status
-- (không cần sửa vì private.can_write_session_question đã check đủ)

-- ============================================================
-- 5. NGĂN exam_sessions INSERT trùng attempt khi key đã exhausted
--    Thêm constraint để không thể có 2 session với cùng key + attempt
--    (đã có unique index exam_sessions_key_id_attempt_number_key ✓)
--    Chỉ cần đảm bảo INSERT policy check used_attempts < total_attempts
--    → Đã được handle ở policy hiện tại, không cần thêm
-- ============================================================

-- ============================================================
-- 6. FIX: question_group_assets đang cho ALL authenticated read
--    (qga_read_auth qual=true) — nên giới hạn như r2_assets
-- ============================================================
DROP POLICY IF EXISTS qga_read_auth ON public.question_group_assets;

CREATE POLICY qga_read_restricted ON public.question_group_assets
    FOR SELECT TO authenticated
    USING (
        private.is_staff()
        OR EXISTS (
            SELECT 1
            FROM public.questions q
            JOIN public.exam_session_questions esq ON esq.question_id = q.id
            JOIN public.exam_sessions es ON es.id = esq.session_id
            WHERE q.group_id = question_group_assets.group_id
              AND es.student_id = (SELECT auth.uid())
              AND es.status = 'in_progress'
        )
    );
;
