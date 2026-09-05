import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const protectedRoutes = ['/api/chat', '/api/devices', '/api/transfer', '/api/upload', '/api/file', '/api/setting'];
  
  const isProtected = protectedRoutes.some(route => 
    request.nextUrl.pathname.startsWith(route)
  );

  if (isProtected) {
    const sessionToken = request.headers.get('x-session-token');

    if (!sessionToken) {
      // Verify the request IP is strictly 127.0.0.1/::1 before allowing tokenless access.
      const ip = request.headers.get('x-forwarded-for');
      if (ip !== '127.0.0.1' && ip !== '::1') {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: Session token required' },
          { status: 401 }
        );
      }
      return NextResponse.next();
    }

    // Validate token against the database using our internal API
    // (We use a fetch call because middleware runs in Edge runtime and cannot access better-sqlite3 directly)
    try {
      const validateUrl = new URL('/api/auth/validate', request.url);
      const validateRes = await fetch(validateUrl.toString(), {
        headers: { 'x-session-token': sessionToken },
        cache: 'no-store'
      });

      if (!validateRes.ok) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: Invalid session token' },
          { status: 401 }
        );
      }
      
      // Optional: pass the device_id down to the API routes via headers
      const { device_id } = await validateRes.json();
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-device-id', device_id);
      
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    } catch (err) {
      console.error('[Middleware] Token validation failed:', err);
      return NextResponse.json(
        { success: false, error: 'Internal Server Error during token validation' },
        { status: 500 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};