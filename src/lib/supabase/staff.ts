import 'server-only';

import { redirect } from 'next/navigation';
import { createClient } from './server';

export async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    !['admin', 'teacher'].includes(String(profile.role))
  ) {
    redirect('/subjects');
  }

  return { supabase, user };
}
