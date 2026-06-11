-- Fix remaining Supabase Advisor WARN items that can be handled safely.
--
-- 1. Pin trigger-function search_path to avoid search_path injection.
-- 2. Trigger functions do not need to be callable through exposed API roles.

alter function public.validate_correct_option_count()
  set search_path = public, pg_catalog;
alter function public.sync_tf_aggregate()
  set search_path = public, pg_catalog;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.trg_populate_session_questions() from public, anon, authenticated;
revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;
