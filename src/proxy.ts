import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

/**
 * Protected routes that require authentication.
 * Users not logged in will be redirected to the login page.
 */
const PROTECTED_ROUTES = ['/subjects', '/exam', '/result', '/profile', '/room-key'];

/**
 * Staff-only routes that require admin/teacher role.
 * Authorization is enforced at the page level via requireStaff(),
 * but we still redirect unauthenticated users here.
 */
const STAFF_ROUTES = ['/admin'];

/**
 * Detects a Supabase session cookie set by @supabase/ssr.
 *
 * Large session cookies are split into chunks named `sb-<ref>-auth-token.0`,
 * `.1`, ... (see createChunks in @supabase/ssr). Google sign-ins carry richer
 * user_metadata (name, avatar, ...) so their session cookie exceeds the
 * 3180-byte chunk threshold and gets chunked, while smaller email/password
 * sessions stay unchunked. Matching only the exact `-auth-token` suffix misses
 * the chunked variant, which made Google logins bounce back to `/` in a
 * redirect loop. We match both the base name and its `.N` chunks, but not the
 * transient `-auth-token-code-verifier` cookie used only during the handshake.
 */
export function isSupabaseAuthCookie(name: string) {
  return name.startsWith('sb-') && /-auth-token(\.\d+)?$/.test(name);
}

export async function proxy(request: NextRequest) {
  // First, refresh the Supabase session (handles cookie refresh)
  const response = await updateSession(request);

  const { pathname } = request.nextUrl;

  // Check if the route requires authentication
  const isProtected = [...PROTECTED_ROUTES, ...STAFF_ROUTES].some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );

  if (isProtected) {
    // Check for Supabase auth cookies to determine if user is logged in.
    // The actual auth verification happens server-side via getUser(),
    // but we can do a quick cookie check here to avoid unnecessary redirects.
    const hasAuthCookie = request.cookies
      .getAll()
      .some((cookie) => isSupabaseAuthCookie(cookie.name));

    if (!hasAuthCookie) {
      const loginUrl = new URL('/', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
