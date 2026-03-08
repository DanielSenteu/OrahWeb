import { NextResponse } from 'next/server'
import {
  CANVAS_REQUIRED_SCOPES,
  CanvasIntent,
  getAppBaseUrl,
  normalizeCanvasBaseUrl,
} from '@/lib/integrations/canvas'

type StartBody = {
  canvasBaseUrl?: string
  intent?: CanvasIntent
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as StartBody
    const requestUrl = new URL(req.url)
    const appBaseUrl = getAppBaseUrl(requestUrl)

    const canvasBaseUrl = normalizeCanvasBaseUrl(body.canvasBaseUrl || '')
    if (!canvasBaseUrl) {
      return NextResponse.json({ error: 'A valid Canvas URL is required.' }, { status: 400 })
    }

    const clientId = process.env.CANVAS_CLIENT_ID
    if (!clientId) {
      return NextResponse.json({ error: 'Missing CANVAS_CLIENT_ID environment variable.' }, { status: 500 })
    }

    const redirectUri = `${appBaseUrl}/api/integrations/canvas/callback`
    const intent: CanvasIntent = body.intent || 'connect'
    const nonce = crypto.randomUUID()
    const statePayload = {
      nonce,
      intent,
      canvasBaseUrl,
      createdAt: Date.now(),
    }
    const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url')

    const authUrl = new URL(`${canvasBaseUrl}/login/oauth2/auth`)
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('scope', CANVAS_REQUIRED_SCOPES.join(' '))
    authUrl.searchParams.set('state', state)

    const response = NextResponse.json({
      authUrl: authUrl.toString(),
      requestedScopes: CANVAS_REQUIRED_SCOPES,
      redirectUri,
    })

    response.cookies.set('canvas_oauth_nonce', nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60,
    })

    return response
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
