import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5-20250929'

// Tool definitions
const TOOLS = [
  {
    name: 'list_upcoming_deadlines',
    description: 'Returns all upcoming assignments and exams for this course, sorted by due date. Use this when the student asks about what\'s coming up, what\'s due soon, or wants an overview of their deadlines.',
    input_schema: {
      type: 'object',
      properties: {
        days_ahead: {
          type: 'number',
          description: 'How many days ahead to look. Defaults to 30.',
        },
      },
      required: [],
    },
  },
  {
    name: 'list_assignments',
    description: 'Returns all assignments for this course with their status, due dates, and descriptions.',
    input_schema: {
      type: 'object',
      properties: {
        status_filter: {
          type: 'string',
          enum: ['all', 'pending', 'completed'],
          description: 'Filter by status. Defaults to all.',
        },
      },
      required: [],
    },
  },
  {
    name: 'list_exams',
    description: 'Returns all exams for this course with their dates, topics, and study plan status.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_lecture_notes',
    description: 'Returns the generated notes and transcript for a specific lecture, or lists available lectures if no lecture is specified.',
    input_schema: {
      type: 'object',
      properties: {
        lecture_title: {
          type: 'string',
          description: 'Optional: the title or partial name of a specific lecture to look up.',
        },
      },
      required: [],
    },
  },
]

async function callClaude(
  messages: any[],
  systemPrompt: string,
  apiKey: string
): Promise<any> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${err}`)
  }

  return res.json()
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing ANTHROPIC_API_KEY' },
        { status: 500 }
      )
    }

    const authHeader =
      request.headers.get('authorization') ||
      request.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Missing authorization header' },
        { status: 401 }
      )
    }

    const { messages, courseId } = await request.json()
    if (!courseId || !messages?.length) {
      return NextResponse.json(
        { error: 'Missing courseId or messages' },
        { status: 400 }
      )
    }

    // Load course data using the user's auth token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Load course details
    const { data: course } = await supabase
      .from('courses')
      .select('course_name, professor_name, semester, year')
      .eq('id', courseId)
      .eq('user_id', user.id)
      .single()

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    const systemPrompt = `You are an AI study assistant for ${course.course_name}${
      course.professor_name ? ` taught by ${course.professor_name}` : ''
    }${
      course.semester && course.year ? ` (${course.semester} ${course.year})` : ''
    }.

You help the student manage their coursework, understand their deadlines, review lecture notes, and prepare for exams. You have access to tools to look up their real assignment and exam data.

Guidelines:
- Be concise, warm, and academically focused
- Always use the tools to get accurate data rather than making things up
- When listing deadlines or assignments, format them clearly
- If asked to help with exam prep or assignments, be practical and specific
- Respond in plain text (no markdown headers, keep bullet points minimal)`

    // Convert frontend messages to Anthropic format
    const anthropicMessages = messages.map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // Agentic loop — tool use execution
    const toolsUsed: string[] = []
    let currentMessages = [...anthropicMessages]
    const MAX_ITERATIONS = 5

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const claudeResponse = await callClaude(currentMessages, systemPrompt, apiKey)

      if (claudeResponse.stop_reason === 'end_turn' || !claudeResponse.content?.some((b: any) => b.type === 'tool_use')) {
        // Final text response
        const textBlock = claudeResponse.content?.find((b: any) => b.type === 'text')
        return NextResponse.json({
          response: textBlock?.text || 'I\'m not sure how to help with that.',
          toolsUsed,
        })
      }

      // Process tool calls
      const toolUseBlocks = claudeResponse.content.filter((b: any) => b.type === 'tool_use')
      const toolResults: any[] = []

      for (const toolBlock of toolUseBlocks) {
        toolsUsed.push(toolBlock.name)
        let result: any

        try {
          result = await executeTool(toolBlock.name, toolBlock.input, supabase, courseId, user.id)
        } catch (err: any) {
          result = { error: err.message || 'Tool execution failed' }
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: JSON.stringify(result),
        })
      }

      // Append assistant response + tool results to messages
      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: claudeResponse.content },
        { role: 'user', content: toolResults },
      ]
    }

    // Fallback if loop exhausted
    return NextResponse.json({
      response: 'I processed your request but reached the tool limit. Please try a more specific question.',
      toolsUsed,
    })
  } catch (error: any) {
    console.error('Course chat error:', error)
    return NextResponse.json(
      { error: 'Server error', details: error?.message },
      { status: 500 }
    )
  }
}

async function executeTool(
  name: string,
  input: any,
  supabase: any,
  courseId: string,
  userId: string
): Promise<any> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  if (name === 'list_upcoming_deadlines') {
    const daysAhead = input.days_ahead || 30
    const futureDate = new Date(today)
    futureDate.setDate(futureDate.getDate() + daysAhead)
    const futureDateStr = futureDate.toISOString().split('T')[0]

    const [{ data: assignments }, { data: exams }] = await Promise.all([
      supabase.from('course_assignments')
        .select('assignment_name, due_date, status')
        .eq('course_id', courseId).eq('user_id', userId)
        .neq('status', 'completed')
        .gte('due_date', todayStr).lte('due_date', futureDateStr)
        .order('due_date', { ascending: true }),
      supabase.from('course_exams')
        .select('exam_name, exam_date, status')
        .eq('course_id', courseId).eq('user_id', userId)
        .neq('status', 'completed')
        .gte('exam_date', todayStr).lte('exam_date', futureDateStr)
        .order('exam_date', { ascending: true }),
    ])

    const items = [
      ...(assignments || []).map((a: any) => ({
        type: 'assignment',
        name: a.assignment_name,
        date: a.due_date,
        status: a.status,
        daysUntil: Math.ceil((new Date(a.due_date).getTime() - today.getTime()) / 86400000),
      })),
      ...(exams || []).map((e: any) => ({
        type: 'exam',
        name: e.exam_name,
        date: e.exam_date,
        status: e.status,
        daysUntil: Math.ceil((new Date(e.exam_date).getTime() - today.getTime()) / 86400000),
      })),
    ].sort((a, b) => a.daysUntil - b.daysUntil)

    return { deadlines: items, count: items.length }
  }

  if (name === 'list_assignments') {
    let query = supabase.from('course_assignments')
      .select('assignment_name, due_date, status, description')
      .eq('course_id', courseId).eq('user_id', userId)
      .order('due_date', { ascending: true })

    if (input.status_filter === 'pending') query = query.neq('status', 'completed')
    if (input.status_filter === 'completed') query = query.eq('status', 'completed')

    const { data } = await query
    return {
      assignments: (data || []).map((a: any) => ({
        name: a.assignment_name,
        dueDate: a.due_date,
        status: a.status || 'not_started',
        description: a.description,
        daysUntil: a.due_date
          ? Math.ceil((new Date(a.due_date).getTime() - today.getTime()) / 86400000)
          : null,
      })),
      count: data?.length || 0,
    }
  }

  if (name === 'list_exams') {
    const { data } = await supabase.from('course_exams')
      .select('exam_name, exam_date, status, topics')
      .eq('course_id', courseId).eq('user_id', userId)
      .order('exam_date', { ascending: true })

    return {
      exams: (data || []).map((e: any) => ({
        name: e.exam_name,
        date: e.exam_date,
        status: e.status || 'not_started',
        topics: e.topics || [],
        daysUntil: e.exam_date
          ? Math.ceil((new Date(e.exam_date).getTime() - today.getTime()) / 86400000)
          : null,
      })),
      count: data?.length || 0,
    }
  }

  if (name === 'get_lecture_notes') {
    let query = supabase.from('course_lectures')
      .select('title, lecture_date, week_number, generated_notes, processing_status')
      .eq('course_id', courseId).eq('user_id', userId)
      .order('lecture_date', { ascending: false })

    if (input.lecture_title) {
      query = query.ilike('title', `%${input.lecture_title}%`)
    }

    const { data } = await query.limit(5)

    if (!data?.length) {
      return { lectures: [], message: 'No lectures found for this course.' }
    }

    return {
      lectures: data.map((l: any) => ({
        title: l.title || `Lecture (Week ${l.week_number || '?'})`,
        date: l.lecture_date,
        status: l.processing_status,
        notes: l.generated_notes
          ? l.generated_notes.slice(0, 800) + (l.generated_notes.length > 800 ? '…' : '')
          : null,
      })),
    }
  }

  throw new Error(`Unknown tool: ${name}`)
}
