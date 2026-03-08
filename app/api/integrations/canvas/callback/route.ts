import { NextResponse } from 'next/server'
import { CanvasIntent, getAppBaseUrl } from '@/lib/integrations/canvas'

type CanvasTokenResponse = {
  access_token: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
}

type CanvasProfile = {
  id?: number
  name?: string
  short_name?: string
  sortable_name?: string
  primary_email?: string
  avatar_url?: string
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url)
  const appBaseUrl = getAppBaseUrl(requestUrl)
  const code = requestUrl.searchParams.get('code')
  const state = requestUrl.searchParams.get('state')
  const error = requestUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/integrations/canvas?error=${encodeURIComponent(error)}`, appBaseUrl))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/integrations/canvas?error=missing_code_or_state', appBaseUrl))
  }

  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as {
      nonce?: string
      intent?: CanvasIntent
      canvasBaseUrl?: string
      createdAt?: number
    }

    const cookieNonce = req.headers
      .get('cookie')
      ?.split(';')
      .map((p) => p.trim())
      .find((p) => p.startsWith('canvas_oauth_nonce='))
      ?.split('=')[1]

    if (!decoded.nonce || !cookieNonce || decoded.nonce !== cookieNonce) {
      return NextResponse.redirect(new URL('/integrations/canvas?error=invalid_state', appBaseUrl))
    }

    if (!decoded.canvasBaseUrl) {
      return NextResponse.redirect(new URL('/integrations/canvas?error=missing_canvas_url', appBaseUrl))
    }

    const clientId = process.env.CANVAS_CLIENT_ID
    const clientSecret = process.env.CANVAS_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(new URL('/integrations/canvas?error=missing_canvas_credentials', appBaseUrl))
    }

    const redirectUri = `${appBaseUrl}/api/integrations/canvas/callback`
    const tokenUrl = `${decoded.canvasBaseUrl}/login/oauth2/token`
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    })

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    })

    if (!tokenRes.ok) {
      const tokenErr = await tokenRes.text()
      return NextResponse.redirect(
        new URL(`/integrations/canvas?error=${encodeURIComponent(`token_exchange_failed: ${tokenErr}`)}`, appBaseUrl)
      )
    }

    const tokenData = (await tokenRes.json()) as CanvasTokenResponse
    if (!tokenData.access_token) {
      return NextResponse.redirect(new URL('/integrations/canvas?error=missing_access_token', appBaseUrl))
    }

    const profileRes = await fetch(`${decoded.canvasBaseUrl}/api/v1/users/self/profile`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    const profile: CanvasProfile | null = profileRes.ok
      ? ((await profileRes.json()) as CanvasProfile)
      : null

    const destinationIntent = decoded.intent || 'connect'
    const destination = new URL('/integrations/canvas', appBaseUrl)
    destination.searchParams.set('connected', '1')
    destination.searchParams.set('intent', destinationIntent)

    const response = NextResponse.redirect(destination)

    // Short-lived session cookie for prototype exploration.
    response.cookies.set(
      'canvas_oauth_session',
      Buffer.from(
        JSON.stringify({
          canvasBaseUrl: decoded.canvasBaseUrl,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
          intent: destinationIntent,
          profile,
        })
      ).toString('base64url'),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60,
      }
    )

    response.cookies.set('canvas_oauth_nonce', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })

    return response
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.redirect(new URL(`/integrations/canvas?error=${encodeURIComponent(message)}`, appBaseUrl))
  }
}
