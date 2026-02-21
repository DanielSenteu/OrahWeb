import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

// OpenAI is kept only for Whisper speech-to-text (Claude has no audio transcription)
// All text generation uses Claude

export async function POST(request: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  let transcript = ''
  let noteId: string | null = null

  try {
    const { audio, userId, saveOnlyTranscript } = await request.json()

    if (!audio) return NextResponse.json({ error: 'Missing audio data' }, { status: 400 })
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    console.log('🎙️ Transcribing audio using Whisper...')
    const audioBuffer = Buffer.from(audio, 'base64')
    const audioFile = new File([audioBuffer], 'recording.webm', { type: 'audio/webm' })

    const transcription = await openai.audio.transcriptions.create(
      { file: audioFile, model: 'whisper-1', language: 'en' },
      { timeout: 600000 }
    )

    transcript = transcription.text
    console.log('✅ Transcription complete:', transcript.length, 'characters')

    const { data: savedNote, error: saveError } = await supabase
      .from('lecture_notes')
      .insert({
        user_id: userId,
        title: 'Lecture Recording (Processing...)',
        summary: 'Transcript saved. Generating notes...',
        sections: [],
        key_takeaways: [],
        definitions: [],
        source_type: 'recorded',
        original_content: transcript,
        processing_status: saveOnlyTranscript ? 'pending' : 'processing',
      })
      .select()
      .single()

    if (!saveError) noteId = savedNote?.id || null

    if (saveOnlyTranscript) {
      return NextResponse.json({ transcript, noteId, message: 'Transcript saved. You can retry note generation later.' })
    }

    console.log('📝 Generating notes with Claude...')

    const systemPrompt = `You are an ELITE note-taker creating EXAM-READY study notes. Return ONLY valid JSON.

Capture EVERYTHING: examples with exact data, homework/assignments, admin details (office hours, deadlines), professor tips, decision frameworks.

JSON structure:
{
  "title": "Lecture title",
  "summary": "Comprehensive 2-3 sentence overview",
  "sections": [
    {
      "title": "Section name",
      "content": ["Multi-sentence bullet with examples and WHY/HOW explanations"]
    }
  ],
  "definitions": [{"term": "Term", "definition": "Complete definition with context and examples"}],
  "keyTakeaways": ["Comprehensive takeaway with reasoning"]
}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Create exam-ready notes from this lecture transcript:\n\n${transcript}` },
        { role: 'assistant', content: '{' },
      ],
    })

    const rawText = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const notes = JSON.parse('{' + rawText)

    if (noteId) {
      await supabase
        .from('lecture_notes')
        .update({
          title: notes.title,
          summary: notes.summary,
          sections: notes.sections,
          key_takeaways: notes.keyTakeaways,
          definitions: notes.definitions,
          processing_status: 'completed',
          error_message: null,
        })
        .eq('id', noteId)
    }

    return NextResponse.json({ notes, transcript, noteId })
  } catch (error: any) {
    console.error('❌ Audio processing error:', error)

    if (noteId) {
      try {
        await supabase
          .from('lecture_notes')
          .update({ processing_status: 'failed', error_message: error.message || 'Failed to process audio' })
          .eq('id', noteId)
      } catch { /* ignore update errors */ }
    }

    if (transcript) {
      return NextResponse.json(
        { error: 'Failed to generate notes', details: error.message, transcript, noteId, canRetry: true },
        { status: 500 }
      )
    }

    return NextResponse.json({ error: 'Failed to process audio', details: error.message }, { status: 500 })
  }
}
