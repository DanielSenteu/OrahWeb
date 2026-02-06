import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(request: NextRequest) {
  // Initialize OpenAI inside handler to avoid build-time evaluation
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || '',
  })
  try {
    const { transcript, courseName } = await request.json()

    if (!transcript) {
      return NextResponse.json(
        { error: 'Transcript is required' },
        { status: 400 }
      )
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-2024-11-20',
      messages: [
        {
          role: 'system',
          content: `You are an ELITE note-taker creating EXAM-READY study notes from lectures. Your notes should be so thorough that a student could learn the entire lecture from your notes alone.

Structure your response as JSON with this format:
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
}

CRITICAL DEPTH REQUIREMENTS:
1. **Examples are MANDATORY**: Every concept should include the specific example from the lecture
   - Bad: "Recursion is a programming technique"
   - Good: "Recursion is when a function calls itself. Example: factorial(5) = 5 × factorial(4), which keeps calling until factorial(1) = 1"

2. **Explain WHY and HOW**, not just WHAT:
   - Bad: "Binary search is faster"
   - Good: "Binary search is faster because it eliminates half the search space each time, giving O(log n) complexity instead of O(n)"

3. **Include ALL details mentioned**:
   - Numbers, formulas, step-by-step processes
   - "First do X, then Y, finally Z"
   - "The formula is: [exact formula from lecture]"

4. **Multi-sentence bullets when needed**:
   - Don't just list topics - explain them fully
   - Each bullet should be 1-3 sentences with complete information
   - Include cause-and-effect relationships

5. **Study-ready format**:
   - Notes should be detailed enough to study from without the original lecture
   - Include context for why things matter
   - Add connections between concepts

ADDITIONAL CAPTURE REQUIREMENTS:
6. **Exact examples with real data**: If lecture says "ABCDGH and AEDFHR", include those EXACT strings
7. **Homework assignments**: Capture any homework/practice problems mentioned (e.g., "Homework: Coin Change problem")
8. **Administrative details**: Office hours, next lecture topics, deadlines
9. **Professor's tips**: Any study advice, common mistakes, or exam hints mentioned
10. **Decision frameworks**: "When to use technique X" or "How to identify problem type Y"

Make these notes so comprehensive that the student can:
- Ace the exam using ONLY these notes
- Complete homework using the examples provided
- Know what to review next based on professor's guidance`,
        },
        {
          role: 'user',
          content: `Course: ${courseName || 'Lecture'}\n\nTranscript:\n${transcript}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No response from OpenAI')
    }

    const notes = JSON.parse(content)

    return NextResponse.json({ notes })
  } catch (error) {
    console.error('Lecture notes error:', error)
    return NextResponse.json(
      { error: 'Failed to generate notes' },
      { status: 500 }
    )
  }
}



