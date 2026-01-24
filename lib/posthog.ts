'use client'

import posthog from 'posthog-js'
import { useEffect } from 'react'
import type { ReactNode } from 'react'

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
        loaded: (posthog) => {
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ PostHog initialized')
          }
          // Send a test event to verify PostHog is working
          posthog.capture('posthog_initialized', {
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV,
          })
        },
      })
    }
  }, [])

  return children as ReactNode
}

// Export posthog instance for manual event tracking
export { posthog }
