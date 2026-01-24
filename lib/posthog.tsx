'use client'

import posthog from 'posthog-js'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Only initialize on client side
    if (typeof window === 'undefined') return

    const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
    const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST

    if (posthogKey && posthogHost && !posthog.__loaded) {
      posthog.init(posthogKey, {
        api_host: posthogHost,
        person_profiles: 'identified_only',
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: true, // Capture clicks, form submissions, etc.
        session_recording: {
          maskAllInputs: true, // Privacy: mask all input fields
          maskTextSelector: '*', // Mask all text
        },
        loaded: (posthog) => {
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ PostHog initialized')
          }
          // Send a test event to verify PostHog is working
          posthog.capture('posthog_initialized', {
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV,
          })

          // Identify user if already logged in
          identifyUser()
        },
      })
    }

    // Function to identify user when they log in
    const identifyUser = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (user && posthog.__loaded) {
          posthog.identify(user.id, {
            email: user.email,
            created_at: user.created_at,
          })
        }
      } catch (error) {
        // Silently fail - user might not be logged in
      }
    }

    // Listen for auth state changes
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (posthog.__loaded) {
        if (event === 'SIGNED_IN' && session?.user) {
          posthog.identify(session.user.id, {
            email: session.user.email,
            created_at: session.user.created_at,
          })
          posthog.capture('user_logged_in', {
            method: session.user.app_metadata?.provider || 'email',
          })
        } else if (event === 'SIGNED_OUT') {
          posthog.reset() // Reset user identity on logout
        }
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return <>{children}</>
}

// Export posthog instance for manual event tracking
export { posthog }
