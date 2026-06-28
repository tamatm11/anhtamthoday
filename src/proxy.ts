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
    const hasAuthCookie = request.cookies.getAll().some(
      (cookie) => cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')
    );

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
