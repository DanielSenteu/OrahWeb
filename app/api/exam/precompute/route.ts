import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const MAX_TOPICS_TO_PRECOMPUTE = 10

function normalizeTopic(rawTopic: string): string {
  return decodeURIComponent(rawTopic || '').trim().replace(/\s+/g, ' ')
}

function extractTopicFromTitle(title: string): string {
  const patterns = [
    /Study:\s*(.+)/i,
    /Study\s+(.+)/i,
    /^(.+?)\s*-\s*Core\s+Concepts/i,
    /^(.+?)\s*-\s*Practice/i,
    /^(.+?)\s*:\s*Core/i,
  ]

  for (const pattern of patterns) {
    const match = title.match(pattern)
    if (match?.[1]) return normalizeTopic(match[1])
  }

  return normalizeTopic(title.replace(/^Study\s*/i, '').trim()) || 'General'
}

function isUsefulTopic(topic: string): boolean {
  if (!topic) return false
  const lower = topic.toLowerCase()
  if (lower.includes('exam day')) return false
  if (lower.includes('light review')) return false
  if (lower.includes('final review')) return false
  return true
}

function getBaseUrl(req: Request): string {
  try {
    const host = req.headers.get('host')
    if (host) {
      const proto = req.headers.get('x-forwarded-proto') || 'https'
      return `${proto}://${host}`
    }
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}`
    }
  } catch {
    // fallback below
  }
  return 'http://localhost:3000'
}

export async function POST(req: Request) {
  try {
    const { examId, goalId } = await req.json()
    if (!examId) {
      return NextResponse.json({ error: 'examId is required' }, { status: 400 })
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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const examQuery = supabase
      .from('course_exams')
      .select('id, topics')
      .eq('id', examId)
      .eq('user_id', user.id)
      .maybeSingle()

    const tasksQuery = goalId
      ? supabase
          .from('task_items')
          .select('title')
          .eq('goal_id', goalId)
          .eq('user_id', user.id)
          .order('day_number', { ascending: true })
      : Promise.resolve({ data: [] as Array<{ title: string }> })

    const [{ data: exam }, { data: tasks }] = await Promise.all([
      examQuery,
      tasksQuery,
    ])

    if (!exam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    }

    const fromTasks = (tasks || [])
      .map((t: { title: string }) => extractTopicFromTitle(t.title || ''))
      .filter(isUsefulTopic)

    const fromExam = Array.isArray(exam.topics)
      ? exam.topics.map((t) => normalizeTopic(String(t))).filter(isUsefulTopic)
      : []

    const topics = Array.from(new Set([...fromTasks, ...fromExam])).slice(0, MAX_TOPICS_TO_PRECOMPUTE)

    if (topics.length === 0) {
      return NextResponse.json({ success: true, queued: 0, generated: 0, topics: [] })
    }

    const baseUrl = getBaseUrl(req)
    const internalHeaders = {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    }

    const results: Array<{ topic: string; notes: string; quiz: string }> = []

    // Process one topic at a time for stability and simpler provider load.
    for (const topic of topics) {
      let notesStatus = 'skipped'
      let quizStatus = 'skipped'

      try {
        await fetch(`${baseUrl}/api/exam/topic-notes`, {
          method: 'POST',
          headers: internalHeaders,
          body: JSON.stringify({ examId, topic, async: true }),
        })

        const processRes = await fetch(`${baseUrl}/api/exam/topic-notes/process`, {
          method: 'POST',
          headers: internalHeaders,
          body: JSON.stringify({ examId, topic }),
        })
        notesStatus = processRes.ok ? 'completed' : 'failed'
      } catch {
        notesStatus = 'failed'
      }

      try {
        const readNotesRes = await fetch(
          `${baseUrl}/api/exam/topic-notes?examId=${examId}&topic=${encodeURIComponent(topic)}`,
          { headers: { Authorization: authHeader } }
        )
        const readNotesJson = readNotesRes.ok ? await readNotesRes.json() : null
        const preparedNotes = readNotesJson?.preparedNotes || ''

        if (preparedNotes && preparedNotes.length > 50) {
          const quizRes = await fetch(`${baseUrl}/api/exam/generate-quiz`, {
            method: 'POST',
            headers: internalHeaders,
            body: JSON.stringify({ examId, topic, notes: preparedNotes }),
          })
          quizStatus = quizRes.ok ? 'completed' : 'failed'
        } else {
          quizStatus = 'no-notes'
        }
      } catch {
        quizStatus = 'failed'
      }

      results.push({ topic, notes: notesStatus, quiz: quizStatus })
    }

    return NextResponse.json({
      success: true,
      queued: topics.length,
      generated: results.filter((r) => r.notes === 'completed' || r.quiz === 'completed').length,
      topics,
      results,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Server error', details: message }, { status: 500 })
  }
}
