import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session so it stays alive across browser restarts.
  // Keep nothing between createServerClient and getUser().
  await supabase.auth.getUser()

  // Prevent caching of app pages to ensure fresh UI
  const p = request.nextUrl.pathname
  if (
    p.startsWith('/dashboard') ||
    p.startsWith('/goals') ||
    p.startsWith('/schedule') ||
    p.startsWith('/lecture-notes') ||
    p.startsWith('/assistant') ||
    p.startsWith('/academic-hub') ||
    p.startsWith('/semester-tracking') ||
    p.startsWith('/assignment-helper') ||
    p.startsWith('/exam-prep') ||
    p.startsWith('/profile')
  ) {
    supabaseResponse.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    supabaseResponse.headers.set('Pragma', 'no-cache')
    supabaseResponse.headers.set('Expires', '0')
  }

  return supabaseResponse
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
    '/profile/:path*',
    '/profile',
  ],
}
