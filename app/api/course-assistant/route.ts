import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic()

type ToolName = 'get_assignments' | 'get_exams' | 'get_lecture_notes' | 'navigate_to' | 'switch_tab'

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_assignments',
    description:
      'Fetch all assignments for this course from the database. Use this when the student asks about assignments, due dates, what\'s coming up, or their workload.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_exams',
    description:
      'Fetch all exams and tests for this course. Use this when asked about exams, midterms, finals, or upcoming tests.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_lecture_notes',
    description:
      'Search through recorded lecture notes for a specific topic or keyword. Use this when asked about lecture content, what was covered in class, or specific concepts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'The topic, concept, or keyword to search for in lecture notes',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'navigate_to',
    description:
      'Send the user to a specific page in the app. Use this when the user wants to create an assignment plan, start exam prep, record a lecture, upload a syllabus, or create a semester plan.',
    input_schema: {
      type: 'object' as const,
      properties: {
        page: {
          type: 'string',
          enum: ['assignment_helper', 'exam_prep', 'lecture_notes', 'semester_plan', 'syllabus'],
          description:
            'assignment_helper: create step-by-step plan for an assignment. exam_prep: create a study plan for an exam. lecture_notes: record or view a lecture. semester_plan: build a full semester schedule. syllabus: upload or view the syllabus.',
        },
      },
      required: ['page'],
    },
  },
  {
    name: 'switch_tab',
    description:
      'Switch the course dashboard to show a different tab (overview, lectures, assignments, or exams). Use this when the user asks to "show" or "see" a specific section.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tab: {
          type: 'string',
          enum: ['overview', 'lectures', 'assignments', 'exams'],
        },
      },
      required: ['tab'],
    },
  },
]

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Missing ANTHROPIC_API_KEY' }, { status: 500 })
  }

  try {
    const { messages, courseId, courseName, syllabus } = await req.json()

    if (!messages || !Array.isArray(messages) || !courseId) {
      return NextResponse.json({ error: 'messages and courseId are required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Tool execution ──────────────────────────────────────────────
    const executeTool = async (name: ToolName, input: Record<string, string>) => {
      if (name === 'get_assignments') {
        const { data } = await supabase
          .from('course_assignments')
          .select('id, assignment_name, due_date, status, description')
          .eq('course_id', courseId)
          .eq('user_id', user.id)
          .order('due_date', { ascending: true })
        return data ?? []
      }

      if (name === 'get_exams') {
        const { data } = await supabase
          .from('course_exams')
          .select('id, exam_name, exam_date, status, topics')
          .eq('course_id', courseId)
          .eq('user_id', user.id)
          .order('exam_date', { ascending: true })
        return data ?? []
      }

      if (name === 'get_lecture_notes') {
        const { data } = await supabase
          .from('course_lectures')
          .select('id, title, lecture_date, generated_notes, week_number')
          .eq('course_id', courseId)
          .eq('user_id', user.id)
          .eq('processing_status', 'completed')

        const q = (input.query ?? '').toLowerCase()
        const relevant = (data ?? [])
          .filter(
            (l) =>
              l.title?.toLowerCase().includes(q) || l.generated_notes?.toLowerCase().includes(q)
          )
          .slice(0, 3)

        return relevant.map((l) => ({
          id: l.id,
          title: l.title,
          date: l.lecture_date,
          notes_excerpt: (l.generated_notes ?? '').slice(0, 600),
        }))
      }

      return null
    }

    // ── System prompt ───────────────────────────────────────────────
    const systemPrompt = `You are Orah, an AI assistant built into the course dashboard for "${courseName || 'this course'}". You have live access to this course's real data through tools.

Be concise and action-oriented (2-4 sentences max per reply). Use tools proactively:
- Asked about assignments/due dates → call get_assignments
- Asked about exams/tests/midterms/finals → call get_exams
- Asked about lecture content or concepts → call get_lecture_notes
- User wants to create an assignment plan → call navigate_to with page "assignment_helper"
- User wants to create an exam study plan → call navigate_to with page "exam_prep"
- User wants to record a lecture → call navigate_to with page "lecture_notes"
- User wants a semester plan or schedule → call navigate_to with page "semester_plan"
- User wants to see assignments/exams/lectures section → call switch_tab
${syllabus ? `\nCourse syllabus context:\n${syllabus.slice(0, 1200)}` : ''}

When you use navigate_to or switch_tab, briefly explain what you're doing in your text reply.`

    // ── Build message list (Anthropic requires first msg = user) ────
    const apiMessages: Anthropic.MessageParam[] = messages
      .map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
    const firstUser = apiMessages.findIndex((m) => m.role === 'user')
    let loopMessages: Anthropic.MessageParam[] =
      firstUser >= 0 ? apiMessages.slice(firstUser) : apiMessages

    // ── Agentic tool-use loop (max 5 rounds) ────────────────────────
    let finalReply = ''
    let pendingAction: Record<string, unknown> | null = null

    for (let i = 0; i < 5; i++) {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS,
        messages: loopMessages,
      })

      if (response.stop_reason === 'end_turn') {
        finalReply = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('')
        break
      }

      if (response.stop_reason === 'tool_use') {
        const assistantContent = response.content
        loopMessages = [...loopMessages, { role: 'assistant', content: assistantContent }]

        const toolResults: Anthropic.ToolResultBlockParam[] = []

        for (const block of assistantContent) {
          if (block.type !== 'tool_use') continue

          const toolName = block.name as ToolName
          const input = block.input as Record<string, string>
          let result: unknown

          if (toolName === 'navigate_to') {
            pendingAction = { type: 'navigate', page: input.page }
            result = { success: true }
          } else if (toolName === 'switch_tab') {
            pendingAction = { type: 'switch_tab', tab: input.tab }
            result = { success: true }
          } else {
            result = await executeTool(toolName, input)
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          })
        }

        loopMessages = [...loopMessages, { role: 'user', content: toolResults }]
      } else {
        // Unexpected stop reason – extract any text and bail
        finalReply = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('')
        break
      }
    }

    return NextResponse.json({ reply: finalReply, action: pendingAction })
  } catch (error) {
    console.error('Course assistant error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
