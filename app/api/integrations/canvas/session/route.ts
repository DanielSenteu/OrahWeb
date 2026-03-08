import { NextResponse } from 'next/server'

type CanvasSession = {
  canvasBaseUrl: string
  accessToken: string
  refreshToken: string | null
  expiresAt: number | null
  intent: string
  profile: {
    id?: number
    name?: string
    primary_email?: string
    avatar_url?: string
  } | null
}

function getSessionFromCookie(req: Request): CanvasSession | null {
  const cookieHeader = req.headers.get('cookie')
  if (!cookieHeader) return null
  const raw = cookieHeader
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith('canvas_oauth_session='))
    ?.split('=')[1]

  if (!raw) return null

  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as CanvasSession
  } catch {
    return null
  }
}

export async function GET(req: Request) {
  const session = getSessionFromCookie(req)
  if (!session) {
    return NextResponse.json({ connected: false })
  }

  return NextResponse.json({
    connected: true,
    canvasBaseUrl: session.canvasBaseUrl,
    intent: session.intent,
    expiresAt: session.expiresAt,
    profile: session.profile,
  })
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.set('canvas_oauth_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}
