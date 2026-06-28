import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }

  return value;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const redirectTo = request.nextUrl.clone();
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');

  redirectTo.pathname = getSafeNextPath(searchParams.get('next'));
  redirectTo.searchParams.delete('code');
  redirectTo.searchParams.delete('next');
  redirectTo.searchParams.delete('token_hash');
  redirectTo.searchParams.delete('type');

  if (!hasSupabaseEnv()) {
    redirectTo.pathname = '/';
    redirectTo.searchParams.set('auth_error', 'missing_supabase_env');
    return NextResponse.redirect(redirectTo);
  }

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(redirectTo);
    }
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) {
      return NextResponse.redirect(redirectTo);
    }
  }

  redirectTo.pathname = '/';
  redirectTo.searchParams.set('auth_error', 'confirm_failed');
  return NextResponse.redirect(redirectTo);
}
