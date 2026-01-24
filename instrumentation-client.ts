// instrumentation-client.ts
// This file is used by Next.js 15.3+ for client-side instrumentation
// PostHog is also initialized via PostHogProvider in app/layout.tsx

import posthog from 'posthog-js'

if (typeof window !== 'undefined') {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST

  if (posthogKey && posthogHost) {
    posthog.init(posthogKey, {
      api_host: posthogHost,
    })
  }
}
