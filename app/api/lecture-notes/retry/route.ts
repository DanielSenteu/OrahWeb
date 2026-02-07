import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Worker Edge Function URL - calls worker directly with noteId
const WORKER_URL = process.env.NEXT_PUBLIC_EDGE_FUNCTION_LECTURE_NOTES_WORKER || 
                   'https://ffudidfxurrjcjredfjg.supabase.co/functions/v1/lecture_notes_worker'

export async function POST(request: NextRequest) {
  console.log('🔄 Retry API called')
  
  // Get auth token from request first
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!authHeader) {
    console.error('❌ Missing authorization header')
    return NextResponse.json({ error: 'Missing authorization header' }, { status: 401 })
  }

  // Initialize Supabase with user's auth token to bypass RLS
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: authHeader },
      },
    }
  )
  
  try {
    const body = await request.json()
    const { noteId, userId } = body
    console.log('📋 Retry request:', { noteId, userId })

    if (!noteId || !userId) {
      return NextResponse.json({ error: 'Missing noteId or userId' }, { status: 400 })
    }

    if (!WORKER_URL) {
      return NextResponse.json(
        { error: 'Missing worker URL. Please set NEXT_PUBLIC_EDGE_FUNCTION_LECTURE_NOTES_WORKER' },
        { status: 500 }
      )
    }

    // Fetch the note to check if it has transcript or audio
    // Using authenticated client so RLS allows access
    const { data: note, error: fetchError } = await supabase
      .from('lecture_notes')
      .select('original_content, audio_url, retry_count')
      .eq('id', noteId)
      .eq('user_id', userId)
      .single()

    if (fetchError || !note) {
      console.error('❌ Note not found:', fetchError)
      return NextResponse.json({ error: 'Note not found', details: fetchError?.message }, { status: 404 })
    }

    // Check if we have transcript or audio to process
    console.log('📋 Note data:', { 
      hasTranscript: !!note.original_content, 
      hasAudio: !!note.audio_url,
      transcriptLength: note.original_content?.length || 0 
    })
    
    let audioUrl = note.audio_url
    
    // If no audio_url in note, check if audio file exists in Storage
    // Old failed lectures might have audio in Storage but not linked in the note
    if (!audioUrl) {
      console.log('🔍 No audio_url in note, checking Storage for audio file...')
      const expectedPath = `${userId}/${noteId}.webm`
      
      // Check if file exists in Storage
      const { data: fileList, error: listError } = await supabase.storage
        .from('lecture-recordings')
        .list(userId, {
          search: `${noteId}.webm`
        })
      
      if (!listError && fileList && fileList.length > 0) {
        // Found the file! Use the full path
        audioUrl = `${userId}/${noteId}.webm`
        console.log('✅ Found audio file in Storage:', audioUrl)
        
        // Update the note with the audio_url for future reference
        await supabase
          .from('lecture_notes')
          .update({ audio_url: audioUrl })
          .eq('id', noteId)
          .eq('user_id', userId)
      } else {
        // Also check for partial file
        const { data: partialList } = await supabase.storage
          .from('lecture-recordings')
          .list(userId, {
            search: `${noteId}_partial.webm`
          })
        
        if (partialList && partialList.length > 0) {
          audioUrl = `${userId}/${noteId}_partial.webm`
          console.log('✅ Found partial audio file in Storage:', audioUrl)
          
          // Update the note with the audio_url
          await supabase
            .from('lecture_notes')
            .update({ audio_url: audioUrl })
            .eq('id', noteId)
            .eq('user_id', userId)
        } else {
          console.log('⚠️ No audio file found in Storage for note:', noteId)
        }
      }
    }
    
    // Final check: need either transcript or audio
    if (!note.original_content && !audioUrl) {
      console.error('❌ No transcript or audio found for note:', noteId)
      return NextResponse.json({ 
        error: 'No transcript or audio found for this note',
        details: 'This note has no transcript or audio file. Please record or type a new lecture.'
      }, { status: 400 })
    }

    const retryCount = (note.retry_count || 0) + 1

    // Check for existing stuck job and create new one if needed
    const { data: existingJobs } = await supabase
      .from('lecture_processing_jobs')
      .select('id, status')
      .eq('note_id', noteId)
      .eq('user_id', userId)
      .in('status', ['pending', 'transcribing', 'generating_notes'])
      .order('created_at', { ascending: false })
      .limit(1)

    let jobId: string | null = null

    if (existingJobs && existingJobs.length > 0 && existingJobs[0].status === 'pending') {
      // Use existing pending job
      jobId = existingJobs[0].id
      console.log(`🔄 Using existing pending job: ${jobId}`)
    } else {
      // Create new job
      // Note: audio_url is stored in lecture_notes table, worker will fetch it from there
      const { data: newJob, error: jobError } = await supabase
        .from('lecture_processing_jobs')
        .insert({
          user_id: userId,
          note_id: noteId,
          status: 'pending',
          progress: 0,
        })
        .select('id')
        .single()

      if (jobError || !newJob) {
        console.error('❌ Error creating job:', jobError)
        return NextResponse.json(
          { error: 'Failed to create processing job', details: jobError?.message },
          { status: 500 }
        )
      }

      jobId = newJob.id
      console.log(`✅ Created new job: ${jobId}`)
    }

    // Update note status
    await supabase
      .from('lecture_notes')
      .update({
        processing_status: 'processing',
        retry_count: retryCount,
        error_message: null,
      })
      .eq('id', noteId)

    console.log(`🔄 Retrying note generation (attempt ${retryCount}) for note: ${noteId}, job: ${jobId}`)

    // Call worker directly with jobId (authHeader already retrieved above)
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({ jobId }),
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

    // Return jobId for frontend polling
    return NextResponse.json({ jobId, noteId, status: 'processing' })
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
