import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  // Initialize clients inside the handler to avoid build-time evaluation
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || '',
  })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  let transcript = ''
  let noteId: string | null = null
  
  try {
    const { audio, userId, saveOnlyTranscript } = await request.json()

    if (!audio) {
      return NextResponse.json({ error: 'Missing audio data' }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    console.log('🎙️ Transcribing audio using Whisper...')

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audio, 'base64')
    const fileSizeMB = audioBuffer.length / (1024 * 1024)
    console.log(`📊 Audio file size: ${fileSizeMB.toFixed(2)} MB`)

    // Create a File object for OpenAI
    const audioFile = new File([audioBuffer], 'recording.webm', { type: 'audio/webm' })

    // Transcribe using Whisper with increased timeout for long recordings
    const transcription = await openai.audio.transcriptions.create(
      {
        file: audioFile,
        model: 'whisper-1',
        language: 'en',
      },
      {
        timeout: 600000, // 10 minutes timeout for long recordings
      }
    )

    transcript = transcription.text
    console.log('✅ Transcription complete:', transcript.length, 'characters')

    // ALWAYS save transcript to database first, even if note generation fails
    console.log('💾 Saving transcript to database...')
    
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

    if (saveError) {
      console.error('❌ Error saving transcript:', saveError)
      // Continue anyway - we'll return transcript even if DB save fails
    } else {
      noteId = savedNote?.id || null
      console.log('✅ Transcript saved to database with ID:', noteId)
    }

    // If only saving transcript (retry scenario), return early
    if (saveOnlyTranscript) {
      return NextResponse.json({ 
        transcript, 
        noteId,
        message: 'Transcript saved. You can retry note generation later.' 
      })
    }

    // Generate organized notes from transcript
    console.log('📝 Generating organized notes...')

    const completion = await openai.chat.completions.create(
      {
        model: 'gpt-4o-mini-2024-07-18',
        messages: [
          {
            role: 'system',
            content: `You are an ELITE note-taker creating EXAM-READY study notes. Your notes should be so thorough that a student could learn the entire lecture from your notes alone.

CRITICAL DEPTH REQUIREMENTS:
1. **Examples are MANDATORY**: Every concept must include specific examples from the lecture
2. **Explain WHY and HOW**, not just WHAT
3. **Multi-sentence bullets**: Each bullet = 1-3 sentences with complete info
4. **Include ALL details**: Numbers, formulas, step-by-step processes
5. **Study-ready**: Detailed enough to ace the exam using only these notes

Example of GOOD bullet points:
- "Recursion is when a function calls itself. Example: factorial(5) = 5 × factorial(4). The base case stops the recursion (factorial(1) = 1), preventing infinite loops."
- "Binary search has O(log n) time complexity because it eliminates half the search space each iteration. If you have 1000 items, it only needs ~10 comparisons instead of 1000."

Return ONLY valid JSON:
{
  "title": "Lecture title",
  "summary": "Comprehensive 2-3 sentence overview",
  "sections": [
    {
      "title": "Section name",
      "content": [
        "Detailed multi-sentence bullet with examples and explanations",
        "Another comprehensive bullet with WHY and HOW, not just WHAT"
      ]
    }
  ],
  "definitions": [
    {"term": "Term", "definition": "Complete definition with context, examples, and why it matters"}
  ],
  "keyTakeaways": ["Comprehensive takeaway with reasoning and examples"]
}

ADDITIONAL CAPTURE REQUIREMENTS:
6. **Exact examples with real data**: Capture EXACT strings, numbers, arrays used in examples
7. **Homework/assignments**: Note any practice problems or homework mentioned
8. **Administrative info**: Office hours, due dates, next lecture topics
9. **Professor's tips**: Study advice, common mistakes, exam hints
10. **Decision frameworks**: "When to use X" or "How to identify Y problems"

Make these notes so comprehensive that students can ace exams AND complete homework using only these notes.`,
          },
          {
            role: 'user',
            content: `Create organized notes from this lecture transcript:\n\n${transcript}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 4000, // Increased for longer lectures
        response_format: { type: 'json_object' },
      },
      {
        timeout: 120000, // 2 minutes timeout for note generation
      }
    )

    const notesContent = completion.choices[0]?.message?.content

    if (!notesContent) {
      throw new Error('Failed to generate notes')
    }

    const notes = JSON.parse(notesContent)
    console.log('✅ Notes generated successfully')

    // Update the saved note with the generated notes
    if (noteId) {
      const { error: updateError } = await supabase
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

      if (updateError) {
        console.error('⚠️ Error updating notes:', updateError)
        // Continue - notes are still returned to user
      } else {
        console.log('✅ Notes saved to database')
      }
    }

    return NextResponse.json({ notes, transcript, noteId })
  } catch (error: any) {
    console.error('❌ Audio processing error:', error)
    
    // Update database with error status if we have a noteId
    if (noteId) {
      try {
        await supabase
          .from('lecture_notes')
          .update({
            processing_status: 'failed',
            error_message: error.message || 'Failed to process audio',
          })
          .eq('id', noteId)
      } catch (err: any) {
        console.error('Error updating failed status:', err)
      }
    }

    // If we have a transcript, return it so user can retry
    if (transcript) {
      return NextResponse.json(
        { 
          error: 'Failed to generate notes', 
          details: error.message,
          transcript, // Return transcript so it can be saved/retried
          noteId,
          canRetry: true,
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to process audio', details: error.message },
      { status: 500 }
    )
  }
}

