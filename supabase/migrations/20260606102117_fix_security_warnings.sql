-- Security fixes based on Supabase advisor findings
-- 
-- 1. Convert get_my_profile from SECURITY DEFINER to SECURITY INVOKER
--    This function only reads from profiles where id = auth.uid().
--    The profiles table has proper RLS policies, so SECURITY DEFINER
--    is unnecessary and was flagged as a security warning.
--
-- 2. Move ltree extension out of public schema to extensions schema
--    Extensions in public schema are exposed through the Data API,
--    which is a security concern.
--    Note: pg_jsonschema does not support SET SCHEMA.

-- Fix 1: Convert get_my_profile to SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.get_my_profile()
 RETURNS TABLE(id uuid, email text, role text, full_name text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO ''
AS $function$
  SELECT p.id, p.email::text, p.role::text, p.full_name, p.avatar_url
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid());
$function$;

-- Fix 2: Move ltree extension to extensions schema
ALTER EXTENSION ltree SET SCHEMA extensions;
