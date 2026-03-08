'use client'

import { FormEvent, useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { CANVAS_ENDPOINT_REFERENCE, CanvasIntent } from '@/lib/integrations/canvas'
import './canvas.css'

type SessionPayload = {
  connected: boolean
  canvasBaseUrl?: string
  intent?: CanvasIntent
  profile?: {
    id?: number
    name?: string
    primary_email?: string
    avatar_url?: string
  } | null
  expiresAt?: number | null
}

type CanvasPreviewPayload = {
  profile?: unknown
  courses?: unknown
  enrollments?: unknown
  folders?: unknown
  assignments?: unknown
  quizzes?: unknown
  files?: unknown
  sampledCourseId?: number | null
}

export default function CanvasIntegrationPage() {
  const initialIntent: CanvasIntent =
    typeof window !== 'undefined'
      ? ((new URLSearchParams(window.location.search).get('intent') as CanvasIntent) || 'connect')
      : 'connect'
  const [canvasBaseUrl, setCanvasBaseUrl] = useState('')
  const [intent, setIntent] = useState<CanvasIntent>(initialIntent)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [session, setSession] = useState<SessionPayload | null>(null)
  const [preview, setPreview] = useState<CanvasPreviewPayload | null>(null)

  const loadSession = useCallback(async () => {
    const res = await fetch('/api/integrations/canvas/session', { cache: 'no-store' })
    if (!res.ok) return
    const data = (await res.json()) as SessionPayload
    setSession(data)
    if (data.canvasBaseUrl) {
      setCanvasBaseUrl(data.canvasBaseUrl)
    }
  }, [])

  const loadPreview = useCallback(async () => {
    const res = await fetch('/api/integrations/canvas/me', { cache: 'no-store' })
    if (!res.ok) {
      return
    }
    const data = (await res.json()) as CanvasPreviewPayload
    setPreview(data)
  }, [])

  const intentLabel = useMemo(() => {
    if (intent === 'login') return 'Login'
    if (intent === 'signup') return 'Signup'
    return 'Connect'
  }, [intent])

  const handleConnect = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/integrations/canvas/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvasBaseUrl, intent }),
      })

      const data = (await res.json()) as { authUrl?: string; error?: string }
      if (!res.ok || !data.authUrl) {
        setError(data.error || 'Could not start Canvas OAuth flow.')
        setLoading(false)
        return
      }

      window.location.href = data.authUrl
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
      setLoading(false)
    }
  }

  const disconnect = async () => {
    await fetch('/api/integrations/canvas/session', { method: 'DELETE' })
    setSession({ connected: false })
    setPreview(null)
  }

  return (
    <main className="canvas-page">
      <div className="canvas-card">
        <div className="canvas-header">
          <h1>Canvas Integration (Beta)</h1>
          <p>Connect Canvas with broad read permissions for courses, assignments, quizzes, files, and grade-related enrollment data.</p>
        </div>

        <form className="canvas-form" onSubmit={handleConnect}>
          <label htmlFor="canvas-url">Canvas Base URL</label>
          <input
            id="canvas-url"
            className="canvas-input"
            placeholder="https://your-school.instructure.com"
            value={canvasBaseUrl}
            onChange={(e) => setCanvasBaseUrl(e.target.value)}
            required
            disabled={loading}
          />

          <label htmlFor="canvas-intent">Flow intent</label>
          <select
            id="canvas-intent"
            className="canvas-select"
            value={intent}
            onChange={(e) => setIntent(e.target.value as CanvasIntent)}
            disabled={loading}
          >
            <option value="login">Login</option>
            <option value="signup">Signup</option>
            <option value="connect">Connect</option>
          </select>

          <button className="canvas-btn" type="submit" disabled={loading}>
            {loading ? 'Redirecting...' : `${intentLabel} with Canvas`}
          </button>

          {error && <p className="canvas-error">{error}</p>}
        </form>

        <section className="canvas-status">
          <h2>Connection Status</h2>
          <p>{session?.connected ? 'Connected' : 'Not connected'}</p>
          <div className="canvas-actions">
            <button type="button" className="canvas-btn-secondary" onClick={loadSession}>
              Check Connection
            </button>
            {session?.connected && (
              <>
                <button type="button" className="canvas-btn-secondary" onClick={loadPreview}>
                  Refresh Data Preview
                </button>
                <button type="button" className="canvas-btn-secondary" onClick={disconnect}>
                  Disconnect
                </button>
              </>
            )}
          </div>
        </section>

        <section className="canvas-endpoints">
          <h2>Requested Canvas API Access</h2>
          <ul>
            {CANVAS_ENDPOINT_REFERENCE.map((endpoint) => (
              <li key={endpoint.path}>
                <code>{endpoint.method}</code>
                <code>{endpoint.path}</code>
                <span>{endpoint.purpose}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="canvas-preview">
          <h2>Live Data Preview</h2>
          <pre>{JSON.stringify(preview, null, 2)}</pre>
        </section>

        <div className="canvas-links">
          <Link href="/login">Back to Login</Link>
          <Link href="/signup">Back to Signup</Link>
        </div>
      </div>
    </main>
  )
}
