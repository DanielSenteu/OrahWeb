import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Edge function URL for lecture notes audio processing
const EDGE_URL = process.env.NEXT_PUBLIC_EDGE_FUNCTION_LECTURE_NOTES_AUDIO || 
                 'https://ffudidfxurrjcjredfjg.supabase.co/functions/v1/smooth-task'

export async function POST(request: NextRequest) {
  // Initialize Supabase inside handler to avoid build-time evaluation
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  try {
    const { noteId, userId } = await request.json()

    if (!noteId || !userId) {
      return NextResponse.json({ error: 'Missing noteId or userId' }, { status: 400 })
    }

    if (!EDGE_URL) {
      return NextResponse.json(
        { error: 'Missing edge function URL. Please set NEXT_PUBLIC_EDGE_FUNCTION_LECTURE_NOTES_AUDIO' },
        { status: 500 }
      )
    }

    // Fetch the saved transcript
    const { data: note, error: fetchError } = await supabase
      .from('lecture_notes')
      .select('original_content, retry_count')
      .eq('id', noteId)
      .eq('user_id', userId)
      .single()

    if (fetchError || !note) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    if (!note.original_content) {
      return NextResponse.json({ error: 'No transcript found for this note' }, { status: 400 })
    }

    const retryCount = (note.retry_count || 0) + 1

    // Update status to processing
    await supabase
      .from('lecture_notes')
      .update({
        processing_status: 'processing',
        retry_count: retryCount,
        error_message: null,
      })
      .eq('id', noteId)

    console.log(`🔄 Retrying note generation (attempt ${retryCount}) for note: ${noteId}`)

    // Get auth token from request
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 })
    }

    // Call edge function with noteId (no audio needed - uses existing transcript)
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({
        userId,
        noteId, // Edge function will fetch transcript from this noteId
        saveOnlyTranscript: false,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      // Update status to failed
      try {
        await supabase
          .from('lecture_notes')
          .update({
            processing_status: 'failed',
            error_message: data?.details || data?.error || 'Failed to generate notes',
          })
          .eq('id', noteId)
      } catch (err: any) {
        console.error('Error updating failed status:', err)
      }

      return NextResponse.json(
        { error: 'Failed to generate notes', details: data?.details || data?.error },
        { status: res.status }
      )
    }

    return NextResponse.json({ notes: data.notes, noteId })
  } catch (error: any) {
    console.error('❌ Retry error:', error)

    // Try to update status to failed
    try {
      const body = await request.json().catch(() => ({}))
      const noteId = (body as any)?.noteId
      if (noteId) {
        await supabase
          .from('lecture_notes')
          .update({
            processing_status: 'failed',
            error_message: error.message || 'Failed to generate notes',
          })
          .eq('id', noteId)
      }
    } catch (dbError: any) {
      console.error('Error updating failed status:', dbError)
    }

    return NextResponse.json(
      { error: 'Failed to generate notes', details: error.message },
      { status: 500 }
    )
  }
}
