import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on the server' }, { status: 500 })
  }
  const anthropic = new Anthropic()

  try {
    const { examId, topic, notes } = await req.json()

    if (!examId || !topic || !notes) {
      return NextResponse.json({ error: 'examId, topic, and notes are required' }, { status: 400 })
    }

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: exam, error: examError } = await supabase
      .from('course_exams')
      .select('id, user_id')
      .eq('id', examId)
      .single()

    if (examError || !exam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    }

    const notesPrompt = `You are an ELITE note-taker creating EXAM-READY study notes for the topic "${topic}". Your notes should be so thorough that a student could ace the exam using only these notes.

STUDY MATERIALS FOR THIS TOPIC:
${notes}

Return ONLY valid JSON with this structure:
{
  "title": "Study Notes: ${topic}",
  "summary": "Comprehensive 2-3 sentence overview of this topic",
  "sections": [
    {
      "title": "Section name",
      "content": [
        "Detailed multi-sentence explanation with examples and WHY/HOW",
        "Another comprehensive point with specific examples from the materials"
      ]
    }
  ],
  "definitions": [
    {
      "term": "Key term",
      "definition": "Complete definition with context, examples, and why it matters for the exam"
    }
  ],
  "keyTakeaways": [
    "Comprehensive takeaway with reasoning and examples"
  ],
  "practiceTips": [
    "Specific study strategy for this topic",
    "Common mistakes to avoid"
  ],
  "formulas": [
    {
      "formula": "Formula notation",
      "description": "What it calculates and when to use it",
      "example": "Worked example with numbers"
    }
  ]
}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 6000,
      system: 'You create comprehensive, exam-ready study notes. Return only valid JSON.',
      messages: [
        { role: 'user', content: notesPrompt },
        { role: 'assistant', content: '{' },
      ],
    })

    const rawText = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const generatedNotes = JSON.parse('{' + rawText)

    return NextResponse.json({ success: true, notes: generatedNotes })
  } catch (error: any) {
    console.error('Error generating notes:', error)
    return NextResponse.json({ error: 'Server error', details: error?.message }, { status: 500 })
  }
}
