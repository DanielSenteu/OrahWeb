import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Prevent caching of pages to ensure fresh UI
  if (request.nextUrl.pathname.startsWith('/dashboard') ||
      request.nextUrl.pathname.startsWith('/goals') ||
      request.nextUrl.pathname.startsWith('/schedule') ||
      request.nextUrl.pathname.startsWith('/lecture-notes') ||
      request.nextUrl.pathname.startsWith('/assistant') ||
      request.nextUrl.pathname.startsWith('/academic-hub') ||
      request.nextUrl.pathname.startsWith('/semester-tracking') ||
      request.nextUrl.pathname.startsWith('/assignment-helper') ||
      request.nextUrl.pathname.startsWith('/exam-prep')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
  }

  return response
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/goals/:path*',
    '/schedule/:path*',
    '/lecture-notes/:path*',
    '/assistant/:path*',
    '/academic-hub/:path*',
    '/semester-tracking/:path*',
    '/assignment-helper/:path*',
    '/exam-prep/:path*',
  ],
}
