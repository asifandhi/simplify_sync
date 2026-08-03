import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const protectedRoutes = ['/api/chat', '/api/devices', '/api/transfer'];
  
  const isProtected = protectedRoutes.some(route => 
    request.nextUrl.pathname.startsWith(route)
  );

  if (isProtected) {
    const sessionToken = request.headers.get('x-session-token');

    if (!sessionToken) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: No session token provided' },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};