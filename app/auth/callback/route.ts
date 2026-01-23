import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')
  
  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, errorDescription)
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errorDescription || error)}`, requestUrl.origin))
  }

  if (code) {
    try {
      const supabase = await createClient()
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
      
      if (exchangeError) {
        console.error('Auth callback exchange error:', exchangeError)
        return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(exchangeError.message)}`, requestUrl.origin))
      }

      if (!data.session) {
        console.error('No session after code exchange')
        return NextResponse.redirect(new URL('/login?error=no-session', requestUrl.origin))
      }

      // Success - always redirect to dashboard
      // Dashboard will handle redirecting to goals if no active goal
      return NextResponse.redirect(new URL('/dashboard', requestUrl.origin))
    } catch (err: any) {
      console.error('Auth callback exception:', err)
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(err.message || 'auth-failed')}`, requestUrl.origin))
    }
  }

  // No code provided - redirect to login
  return NextResponse.redirect(new URL('/login?error=no-code', requestUrl.origin))
}
