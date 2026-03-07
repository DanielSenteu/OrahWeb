import { NextResponse } from 'next/server'
import OpenAI from 'openai'

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

const formatYmd = (date: Date) => {
  const yyyy = date.getFullYear()
  const mm = `${date.getMonth() + 1}`.padStart(2, '0')
  const dd = `${date.getDate()}`.padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const parseDueDate = (text: string): string | null => {
  if (!text) return null
  const lower = text.toLowerCase().trim()
  const now = new Date()

  if (lower.includes('today')) return formatYmd(now)

  if (lower.includes('tomorrow')) {
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    return formatYmd(d)
  }

  const inDaysMatch = lower.match(/in\s+(\d{1,3})\s+days?/)
  if (inDaysMatch) {
    const d = new Date(now)
    d.setDate(d.getDate() + parseInt(inDaysMatch[1], 10))
    return formatYmd(d)
  }

  if (lower.includes('next week')) {
    const d = new Date(now)
    d.setDate(d.getDate() + 7)
    return formatYmd(d)
  }

  const numeric = text.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/) 
  if (numeric) {
    const month = parseInt(numeric[1], 10)
    const day = parseInt(numeric[2], 10)
    const yearRaw = numeric[3] ? parseInt(numeric[3], 10) : now.getFullYear()
    const fullYear = yearRaw < 100 ? 2000 + yearRaw : yearRaw
    return `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) {
    return formatYmd(parsed)
  }

  return null
}

const parseHoursPerDay = (text: string): number | null => {
  if (!text) return null
  const match =
    text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)(?:\s*\/\s*day)?/i) ||
    text.match(/^(\d+(?:\.\d+)?)$/)

  if (!match) return null

  const value = parseFloat(match[1])
  if (!Number.isFinite(value) || value <= 0) return null

  return Math.min(value, 12)
}

export async function POST(req: Request) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })

  try {
    const {
      messages,
      assignmentContent,
      dueDate,
      hoursPerDay,
    }: {
      messages: ChatMessage[]
      assignmentContent: string
      dueDate?: string | null
      hoursPerDay?: number | null
    } = await req.json()

    if (!Array.isArray(messages) || !assignmentContent) {
      return NextResponse.json({ error: 'messages and assignmentContent are required' }, { status: 400 })
    }

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || ''
    const inferredDueDate = dueDate || parseDueDate(lastUserMessage)
    const inferredHoursPerDay =
      typeof hoursPerDay === 'number' && Number.isFinite(hoursPerDay) && hoursPerDay > 0
        ? hoursPerDay
        : parseHoursPerDay(lastUserMessage)

    const readyForPlan = Boolean(inferredDueDate && inferredHoursPerDay)

    const assignmentExcerpt = assignmentContent.replace(/\s+/g, ' ').trim().slice(0, 5000)

    const systemPrompt = `You are Orah, an academic assignment coach.

ASSIGNMENT TRANSCRIPT:
${assignmentExcerpt}

CURRENT STATE:
- Due date captured: ${inferredDueDate ?? 'NO'}
- Hours/day captured: ${inferredHoursPerDay ?? 'NO'}

Rules:
- Keep responses concise (2-5 sentences).
- Be practical and specific to the assignment transcript.
- Do NOT generate or describe day-by-day plans in chat.
- Do NOT list task breakdowns in chat.
- If due date is missing, ask for it clearly.
- If hours/day is missing, ask for a realistic hours/day estimate.
- If both are present, briefly confirm and say you'll create a specific day-by-day plan now.
- Do not output JSON or markdown.`

    let reply = ''

    if (!process.env.OPENAI_API_KEY) {
      if (!inferredDueDate) {
        reply = 'I reviewed your assignment. What exact due date are you targeting (for example, 03/18/2026 or in 7 days)?'
      } else if (!inferredHoursPerDay) {
        reply = 'Great, I have your timeline. How many hours per day can you realistically dedicate to this assignment?'
      } else {
        reply = 'Perfect. I have everything I need and I am creating your assignment plan now.'
      }
    } else {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini-2024-07-18',
        temperature: 0.4,
        max_tokens: 220,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        ],
      })

      reply = completion.choices[0]?.message?.content?.trim() || ''
      if (!reply) {
        reply = readyForPlan
          ? 'Perfect. I have everything I need and I am creating your assignment plan now.'
          : !inferredDueDate
            ? 'I reviewed your assignment. What due date are you aiming for?'
            : 'Great. How many hours per day can you dedicate to this assignment?'
      }
    }

    return NextResponse.json({
      reply,
      extractedDueDate: inferredDueDate,
      extractedHoursPerDay: inferredHoursPerDay,
      readyForPlan,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('assignment-assistant error:', error)
    return NextResponse.json(
      { error: 'Failed to process assignment assistant request', details: message },
      { status: 500 }
    )
  }
}
