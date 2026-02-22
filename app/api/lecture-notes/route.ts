import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on the server' }, { status: 500 })
  }
  const anthropic = new Anthropic()

  try {
    const { transcript, courseName } = await request.json()

    if (!transcript) {
      return NextResponse.json({ error: 'Transcript is required' }, { status: 400 })
    }

    const systemPrompt = `You are an ELITE note-taker creating EXAM-READY study notes from lectures. Your notes should be so thorough that a student could learn the entire lecture from your notes alone.

CRITICAL DEPTH REQUIREMENTS:
1. **Examples are MANDATORY**: Every concept should include the specific example from the lecture
2. **Explain WHY and HOW**, not just WHAT
3. **Multi-sentence bullets when needed**: Each bullet = 1-3 sentences with complete information
4. **Include ALL details**: Numbers, formulas, step-by-step processes
5. **Study-ready format**: Notes detailed enough to study from without the original lecture

ADDITIONAL CAPTURE REQUIREMENTS:
6. **Exact examples with real data**: Capture EXACT strings and numbers used in examples
7. **Homework assignments**: Capture any homework/practice problems mentioned
8. **Administrative details**: Office hours, next lecture topics, deadlines
9. **Professor's tips**: Any study advice, common mistakes, or exam hints mentioned
10. **Decision frameworks**: "When to use technique X" or "How to identify problem type Y"

Return ONLY valid JSON with this structure:
{
  "title": "Lecture title",
  "summary": "2-3 sentence comprehensive overview",
  "sections": [
    {
      "title": "Section name",
      "content": [
        "Detailed bullet with full explanation and context",
        "Include HOW and WHY, not just WHAT",
        "Add specific examples: 'For instance, when X happens, Y results because Z'",
        "Include numbers, formulas, or specific data mentioned"
      ]
    }
  ],
  "definitions": [
    {"term": "Term", "definition": "Complete definition with context and why it matters"}
  ],
  "keyTakeaways": ["Comprehensive takeaway with reasoning", "Another detailed takeaway"]
}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Course: ${courseName || 'Lecture'}\n\nTranscript:\n${transcript}`,
        },
        { role: 'assistant', content: '{' },
      ],
    })

    const rawText = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const content = '{' + rawText

    const notes = JSON.parse(content)
    return NextResponse.json({ notes })
  } catch (error) {
    console.error('Lecture notes error:', error)
    return NextResponse.json({ error: 'Failed to generate notes' }, { status: 500 })
  }
}
