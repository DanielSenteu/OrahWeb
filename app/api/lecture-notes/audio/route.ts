import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const { audio } = await request.json()

    if (!audio) {
      return NextResponse.json({ error: 'Missing audio data' }, { status: 400 })
    }

    console.log('🎙️ Transcribing audio using Whisper...')

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audio, 'base64')

    // Create a File object for OpenAI
    const audioFile = new File([audioBuffer], 'recording.webm', { type: 'audio/webm' })

    // Transcribe using Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en',
    })

    const transcript = transcription.text

    console.log('✅ Transcription complete:', transcript.length, 'characters')

    // Generate organized notes from transcript
    console.log('📝 Generating organized notes...')

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
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
      max_tokens: 3000,
      response_format: { type: 'json_object' },
    })

    const notesContent = completion.choices[0]?.message?.content

    if (!notesContent) {
      throw new Error('Failed to generate notes')
    }

    const notes = JSON.parse(notesContent)

    console.log('✅ Notes generated successfully')

    return NextResponse.json({ notes, transcript })
  } catch (error: any) {
    console.error('❌ Audio processing error:', error)
    return NextResponse.json(
      { error: 'Failed to process audio', details: error.message },
      { status: 500 }
    )
  }
}

