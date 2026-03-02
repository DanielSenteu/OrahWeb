'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/layout/Navigation'
import './profile.css'

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login')
        return
      }
      setEmail(user.email ?? null)
      setLoading(false)
    })
  }, [router, supabase])

  const handleLogout = async () => {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) return null

  return (
    <>
      <div className="noise-bg" />
      <div className="grid-overlay" />
      <Navigation />
      <main className="profile-page">
        <div className="profile-card">
          <h1 className="profile-heading">Account</h1>
          <p className="profile-sub">Manage your Orah account</p>

          <div className="profile-row">
            <span className="profile-row-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <span className="profile-row-text">{email}</span>
          </div>

          <div className="profile-divider" />

          <button className="btn-logout" onClick={handleLogout} disabled={signingOut}>
            {signingOut ? 'Signing out...' : 'Log out'}
          </button>

          <Link href="/" className="btn-home">
            Back to home
          </Link>
        </div>
      </main>
    </>
  )
}
