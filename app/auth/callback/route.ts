import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')
  const next = requestUrl.searchParams.get('next') || '/dashboard'

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

      // Success - redirect to dashboard (or onboarding for new users)
      // Check if user is new by checking if they have any goals
      const { data: goals } = await supabase
        .from('user_goals')
        .select('id')
        .eq('user_id', data.session.user.id)
        .limit(1)

      // If no goals, might be a new user - but let dashboard handle the redirect
      // Dashboard will redirect to goals if no active goal
      return NextResponse.redirect(new URL(next, requestUrl.origin))
    } catch (err: any) {
      console.error('Auth callback exception:', err)
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(err.message || 'auth-failed')}`, requestUrl.origin))
    }
  }

  // No code provided - redirect to login
  return NextResponse.redirect(new URL('/login?error=no-code', requestUrl.origin))
}
