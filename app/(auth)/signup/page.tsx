'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import './signup.css'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [gmailLoading, setGmailLoading] = useState(false)
  const [error, setError] = useState('')

  const handleEmailSignup = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Validate password length
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      if (data.user) {
        // Redirect to onboarding flow
        router.push('/onboarding/what-if-you-wait')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during signup')
      setLoading(false)
    }
  }

  const handleGoogleSignup = async () => {
    setError('')
    setGmailLoading(true)

    try {
      const supabase = createClient()
      // Always use production domain for OAuth to show orahai.app instead of Supabase URL
      // In production, use the custom domain. In development, use localhost
      const isProduction = window.location.hostname === 'orahai.app' || window.location.hostname === 'www.orahai.app'
      const redirectUrl = isProduction 
        ? 'https://orahai.app/auth/callback'
        : `${window.location.origin}/auth/callback`
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      })

      if (error) {
        setError(error.message)
        setGmailLoading(false)
      } else if (data?.url) {
        // OAuth redirect will happen automatically
        // Don't set loading to false - let the redirect happen
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred with Google signup')
      setGmailLoading(false)
    }
  }

  return (
    <>
      {/* Background effects */}
      <div className="noise-bg"></div>
      <div className="grid-overlay"></div>

      {/* Page wrapper for centering */}
      <div className="signup-page">
        {/* Signup container */}
        <div className="signup-container">
        {/* Logo */}
        <div className="logo">
          <Link href="/" className="logo-text">ORAH</Link>
          <p className="logo-subtitle">Create your account — start planning with ORAH.</p>
        </div>

        {/* Signup card */}
        <div className="signup-card">
          <div className="card-header">
            <h1 className="card-title">Sign up</h1>
            <p className="card-subtitle">Build your goals and daily plan with AI-guided scheduling.</p>
          </div>

          {/* Error message */}
          {error && (
            <div className="error-message">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Gmail Sign up */}
          <button 
            type="button" 
            className={`btn-gmail ${gmailLoading ? 'loading' : ''}`}
            onClick={handleGoogleSignup}
            disabled={gmailLoading}
          >
            <svg className="google-icon" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>{gmailLoading ? 'Connecting...' : 'Continue with Google'}</span>
          </button>

          <div className="divider">
            <span className="divider-text">or</span>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleEmailSignup}>
            <div className="form-group">
              <label htmlFor="email" className="form-label">Email</label>
              <input 
                type="email" 
                id="email" 
                className="form-input" 
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">Password</label>
              <div className="password-wrapper">
                <input 
                  type={showPassword ? 'text' : 'password'}
                  id="password" 
                  className="form-input" 
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={6}
                  disabled={loading}
                />
                <button 
                  type="button" 
                  className="password-toggle" 
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              <p className="password-hint">Must be at least 6 characters</p>
            </div>

            <button 
              type="submit" 
              className={`btn btn-primary ${loading ? 'loading' : ''}`}
              disabled={loading}
            >
              <span>{loading ? 'Creating account...' : 'Create account'}</span>
            </button>

            <p className="terms-text">
              By creating an account, you agree to our{' '}
              <Link href="/terms" className="terms-link">Terms of Service</Link>
              {' '}and{' '}
              <Link href="/privacy" className="terms-link">Privacy Policy</Link>
            </p>
          </form>

          {/* Login section */}
          <div className="login-section">
            <p className="login-text">
              Already have an account? <Link href="/login" className="login-link">Log in</Link>
            </p>
          </div>
        </div>
      </div>
      </div>
    </>
  )
}
