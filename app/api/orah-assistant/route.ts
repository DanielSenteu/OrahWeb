import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: Request) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })

  try {
    const {
      messages,
      academicType,
      syllabusContent,
      assignmentContent,
      examContent,
      dueDate,
      examDate,
      currentLevel,
    } = await req.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages' }, { status: 400 })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Missing ANTHROPIC_API_KEY' }, { status: 500 })
    }

    const academicPrompts: Record<string, string> = {
      semester: `You are Orah, an expert academic planning assistant. You're helping a student create a semester-long study plan.

The student has uploaded their syllabus:
${syllabusContent || '(Syllabus information not provided)'}

Your task: Ask ONLY for missing information needed to create the plan. Keep it to 2-3 short questions max:
1. If you don't know their preferred study times, ask: "What times of day do you work best?"
2. If you don't know hours per day available, ask: "How many hours per day can you dedicate to studying?"
3. If any important dates/deadlines are unclear in the syllabus, ask for clarification

Once you have: study times, hours per day, and all deadlines are clear, respond with ONLY: END_CONVERSATION

Keep responses 1-2 sentences. One question at a time. Be brief and focused.`,

      assignment: `You are Orah, an expert academic coach helping with assignment completion.

Assignment details:
${assignmentContent || '(Assignment not provided)'}
Due date: ${dueDate || 'Not specified'}

Your task: Ask ONLY for missing information. Keep it to 1-2 quick questions:
1. If you don't know hours per day they can work, ask: "How many hours per day can you work on this?"
2. If any assignment details are unclear, ask for clarification

Once you have hours per day, respond with ONLY: END_CONVERSATION

Keep it brief. One question at a time.`,

      exam: `You are Orah, an expert study coach helping with exam preparation.

Exam topics:
${examContent || '(Topics not provided)'}
Exam date: ${examDate || 'Not specified'}
Current level: ${currentLevel || 'Not specified'}

Your task: Ask ONLY for missing information. Keep it to 2-3 quick questions:
1. If you don't know when they study best, ask: "What times of day do you study best?"
2. If you don't know hours per day, ask: "How many hours per day can you dedicate to studying?"
3. If any topics are unclear, ask for clarification

Once you have: study times, hours per day, and topics are clear, respond with ONLY: END_CONVERSATION

Keep responses 1-2 sentences. One question at a time.`,
    }

    const systemPrompt =
      academicType && academicPrompts[academicType]
        ? academicPrompts[academicType]
        : `You are Orah, a supportive goal achievement coach. Run a discovery chat to learn the goal, why it matters, how they work best, obstacles, timelines, time/day availability, and domain specifics. Keep it friendly and light: one short question at a time (1-3 sentences). Stay concise; avoid digging too deep too fast.

Phases (flow naturally, don't announce them):
1) The Dream: acknowledge goal/domain; ask a simple future-vision question; lightly ask what's at stake if they don't do it.
2) Reality: past attempts or worries; confidence 1-10; who supports them.
3) Method: best time of day; learning style; motivation type; planning style preference.
4) Specifics (by domain: academic/business/health/creative/personal/other): deadlines, hard parts, time per day, resources/tools, target date.
5) Commitment: summarize briefly (why, obstacles, method, specifics) and ask if they're ready for a personalized plan. When they confirm, reply ONLY with END_CONVERSATION (exact token, all caps, no other text).

Rules:
- One question at a time; no lists.
- Don't generate plans or tasks.
- Mirror their language; keep it warm but brief.
- If answers are vague, ask one gentle follow-up.
Remember: when ready to hand off, send END_CONVERSATION as the entire reply.`

    // Anthropic requires messages to start with 'user'. Strip any leading assistant messages
    // (e.g. the initial greeting that lives only in the UI state).
    const apiMessages = messages
      .map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
    const firstUserIdx = apiMessages.findIndex((m) => m.role === 'user')
    const trimmedMessages = firstUserIdx >= 0 ? apiMessages.slice(firstUserIdx) : apiMessages

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: systemPrompt,
      messages: trimmedMessages,
    })

    const reply = response.content[0]?.type === 'text' ? response.content[0].text : 'Sorry, I had trouble replying.'
    return NextResponse.json({ reply })
  } catch (error) {
    console.error('Orah assistant error', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
