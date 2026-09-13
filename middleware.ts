import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function isValidLocalOrigin(originHeader: string, hostHeader: string | null): boolean {
  try {
    const originUrl = new URL(originHeader);
    const host = hostHeader || '';
    if (originUrl.host !== host) {
      return false;
    }
    const hostname = originUrl.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const protectedRoutes = ['/api/chat', '/api/devices', '/api/transfer', '/api/upload', '/api/file', '/api/setting', '/api/discovery/qr'];
  
  const isProtected = protectedRoutes.some(route => 
    request.nextUrl.pathname.startsWith(route)
  );

  if (isProtected) {
    const sessionToken = request.headers.get('x-session-token');

    if (!sessionToken) {
      // W01: Trust only server-derived local client identity (set by custom server after verifying TCP peer)
      const isLocalClient = request.headers.get('x-is-local-client') === 'true';
      if (!isLocalClient) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: Session token required' },
          { status: 401 }
        );
      }

      // W01: Protect local browser mutations with exact-origin checks
      const host = request.headers.get('host');
      const origin = request.headers.get('origin');
      const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method);

      if (origin) {
        if (!isValidLocalOrigin(origin, host)) {
          return NextResponse.json(
            { success: false, error: 'Forbidden: Invalid origin' },
            { status: 403 }
          );
        }
      } else if (isMutation) {
        const referer = request.headers.get('referer');
        let validReferer = false;
        if (referer) {
          try {
            validReferer = isValidLocalOrigin(new URL(referer).origin, host);
          } catch {
            validReferer = false;
          }
        }
        if (!validReferer) {
          return NextResponse.json(
            { success: false, error: 'Forbidden: Valid origin or referer required for local mutations' },
            { status: 403 }
          );
        }
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