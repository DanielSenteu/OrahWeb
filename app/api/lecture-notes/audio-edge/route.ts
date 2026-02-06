import { NextRequest, NextResponse } from 'next/server'

// Edge function URL for lecture notes audio processing
const EDGE_URL = process.env.NEXT_PUBLIC_EDGE_FUNCTION_LECTURE_NOTES_AUDIO || 
                 'https://ffudidfxurrjcjredfjg.supabase.co/functions/v1/smooth-task'

export async function POST(request: NextRequest) {
  if (!EDGE_URL) {
    return NextResponse.json(
      { error: 'Missing edge function URL. Please set NEXT_PUBLIC_EDGE_FUNCTION_LECTURE_NOTES_AUDIO' },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()
    const { audioUrl, audio, userId, saveOnlyTranscript, noteId } = body

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required field: userId' },
        { status: 400 }
      )
    }

    // audioUrl (Storage path) is preferred for new recordings
    // audio (base64) is fallback for backwards compatibility
    // noteId is for retries
    if (!audioUrl && !audio && !noteId) {
      return NextResponse.json(
        { error: 'Missing required field: audioUrl, audio, or noteId' },
        { status: 400 }
      )
    }

    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Missing authorization header' },
        { status: 401 }
      )
    }

    // Call the Supabase Edge Function
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({
        audioUrl, // Storage path (preferred)
        audio, // base64 fallback (for backwards compatibility)
        userId,
        saveOnlyTranscript,
        noteId,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error || 'Edge function error', details: data },
        { status: res.status }
      )
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Audio edge route error:', error)
    return NextResponse.json(
      { error: 'Server error', details: error?.message },
      { status: 500 }
    )
  }
}
