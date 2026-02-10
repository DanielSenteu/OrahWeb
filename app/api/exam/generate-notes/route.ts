import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

export async function POST(req: Request) {
  try {
    const { examId, topic, notes } = await req.json()
    
    if (!examId || !topic || !notes) {
      return NextResponse.json({ 
        error: 'examId, topic, and notes are required' 
      }, { status: 400 })
    }

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    // Initialize Supabase with auth
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Verify exam exists
    const { data: exam, error: examError } = await supabase
      .from('course_exams')
      .select('id, user_id')
      .eq('id', examId)
      .single()

    if (examError || !exam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    }

    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    })

    // Generate comprehensive study notes for this topic
    const notesPrompt = `You are an ELITE note-taker creating EXAM-READY study notes for the topic "${topic}". Your notes should be so thorough that a student could ace the exam using only these notes.

CRITICAL DEPTH REQUIREMENTS:
1. **Examples are MANDATORY**: Every concept must include specific examples from the study materials
2. **Explain WHY and HOW**, not just WHAT
3. **Multi-sentence explanations**: Each point = 2-4 sentences with complete information
4. **Include ALL details**: Numbers, formulas, step-by-step processes, definitions
5. **Study-ready**: Detailed enough to answer exam questions confidently

STUDY MATERIALS FOR THIS TOPIC:
${notes}

Return ONLY valid JSON with this structure:
{
  "title": "Study Notes: ${topic}",
  "summary": "Comprehensive 2-3 sentence overview of this topic",
  "sections": [
    {
      "title": "Section name (e.g., 'Core Concepts', 'Key Formulas', 'Problem-Solving Strategies')",
      "content": [
        "Detailed multi-sentence explanation with examples and WHY/HOW",
        "Another comprehensive point with specific examples from the materials",
        "Step-by-step process or framework if applicable"
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
    "Comprehensive takeaway with reasoning and examples",
    "Another critical point students must remember"
  ],
  "practiceTips": [
    "Specific study strategy for this topic",
    "Common mistakes to avoid",
    "How to approach exam questions on this topic"
  ],
  "formulas": [
    {
      "formula": "Formula notation",
      "description": "What it calculates and when to use it",
      "example": "Worked example with numbers"
    }
  ]
}

ADDITIONAL REQUIREMENTS:
- Reference specific examples from the study materials
- Include step-by-step problem-solving approaches
- Note any connections to other topics
- Highlight exam-critical information
- Provide practice strategies

Make these notes so comprehensive that students can confidently answer any exam question on this topic.`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-2024-11-20',
      messages: [
        {
          role: 'system',
          content: 'You create comprehensive, exam-ready study notes. Always return valid JSON only.',
        },
        {
          role: 'user',
          content: notesPrompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4000,
    })

    const responseContent = completion.choices[0]?.message?.content || '{}'
    
    try {
      const generatedNotes = JSON.parse(responseContent)
      return NextResponse.json({ 
        success: true,
        notes: generatedNotes
      })
    } catch (e) {
      console.error('Failed to parse notes JSON:', e)
      return NextResponse.json({ 
        error: 'Failed to generate notes',
        details: 'Invalid response format'
      }, { status: 500 })
    }
  } catch (error: any) {
    console.error('Error generating notes:', error)
    return NextResponse.json({ 
      error: 'Server error', 
      details: error?.message 
    }, { status: 500 })
  }
}
