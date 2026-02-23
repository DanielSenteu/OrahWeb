import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic()

type ToolName =
  | 'get_assignments'
  | 'get_exams'
  | 'get_lecture_notes'
  | 'get_all_recordings'
  | 'search_transcripts'
  | 'navigate_to'
  | 'switch_tab'
  | 'mark_as_cheatsheet'
  | 'format_as_math'

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_assignments',
    description:
      "Fetch all assignments for this course. Use when the student asks about assignments, due dates, upcoming work, or their assignment workload.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_exams',
    description:
      'Fetch all exams and tests for this course. Use when asked about exams, midterms, finals, tests, or upcoming assessments.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_lecture_notes',
    description:
      'Search through recorded lecture notes for a specific topic or keyword. Use when asked about lecture content, what was covered in class, or specific concepts.',
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
    name: 'get_all_recordings',
    description:
      'Fetch all recorded lectures for this course including their notes and content. Use when asked about recordings, all lectures, or when gathering comprehensive course material for cheatsheets and study guides.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'search_transcripts',
    description:
      'Deep search across all lecture transcripts and generated notes for a specific topic. Use for finding specific concepts, formulas, or topics across all lectures — especially useful for building cheatsheets and study guides.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Topic, concept, formula, or keyword to search for across all lecture content',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'navigate_to',
    description:
      'Send the user to a specific page in the app. Use when the user wants to create an assignment plan, start exam prep, record a lecture, upload a syllabus, or create a semester plan.',
    input_schema: {
      type: 'object' as const,
      properties: {
        page: {
          type: 'string',
          enum: ['assignment_helper', 'exam_prep', 'lecture_notes', 'semester_plan', 'syllabus'],
          description:
            'assignment_helper: create a step-by-step plan for an assignment. exam_prep: create a study plan for an exam. lecture_notes: record or view a lecture. semester_plan: build a full semester schedule. syllabus: upload or view the syllabus.',
        },
      },
      required: ['page'],
    },
  },
  {
    name: 'switch_tab',
    description:
      'Switch the course dashboard to show a different tab. Use when the user asks to see assignments, exams, lectures, or the overview.',
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
  {
    name: 'mark_as_cheatsheet',
    description:
      'Call this tool when you are about to create a cheatsheet, formula sheet, study guide, or reference document. This enables the student to download your response as a styled PDF. Always call this BEFORE writing the cheatsheet content.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: {
          type: 'string',
          description: 'Title for the cheatsheet (e.g. "Calculus Midterm Cheatsheet")',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'format_as_math',
    description:
      'Call this tool when solving or presenting math problems, equations, or calculations. This enables enhanced math formatting so equations are displayed clearly.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractRelevantExcerpt(text: string | null, query: string): string {
  if (!text) return ''
  const lower = text.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) return text.slice(0, 500)
  const start = Math.max(0, idx - 150)
  const end = Math.min(text.length, idx + 500)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

// ── Route ────────────────────────────────────────────────────────────────────

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

    // ── Course inventory (lightweight, always loaded) ────────────────────────
    const [lectureCountRes, assignmentCountRes, examCountRes] = await Promise.all([
      supabase
        .from('course_lectures')
        .select('id, processing_status', { count: 'exact', head: false })
        .eq('course_id', courseId)
        .eq('user_id', user.id),
      supabase
        .from('course_assignments')
        .select('id', { count: 'exact', head: false })
        .eq('course_id', courseId)
        .eq('user_id', user.id),
      supabase
        .from('course_exams')
        .select('id', { count: 'exact', head: false })
        .eq('course_id', courseId)
        .eq('user_id', user.id),
    ])

    const lectureRows = lectureCountRes.data ?? []
    const recordingsWithNotes = lectureRows.filter((l) => l.processing_status === 'completed').length
    const totalLectures = lectureRows.length
    const totalAssignments = assignmentCountRes.data?.length ?? 0
    const totalExams = examCountRes.data?.length ?? 0

    // ── Tool execution ──────────────────────────────────────────────────────
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
          notes_excerpt: extractRelevantExcerpt(l.generated_notes, q),
        }))
      }

      if (name === 'get_all_recordings') {
        const { data } = await supabase
          .from('course_lectures')
          .select('id, title, lecture_date, week_number, generated_notes, audio_url, processing_status')
          .eq('course_id', courseId)
          .eq('user_id', user.id)
          .order('lecture_date', { ascending: true })

        return (data ?? []).map((l) => ({
          id: l.id,
          title: l.title,
          date: l.lecture_date,
          week: l.week_number,
          has_recording: !!l.audio_url,
          has_notes: l.processing_status === 'completed',
          notes_summary: l.generated_notes ? l.generated_notes.slice(0, 1200) : null,
        }))
      }

      if (name === 'search_transcripts') {
        const { data } = await supabase
          .from('course_lectures')
          .select('id, title, lecture_date, generated_notes, week_number')
          .eq('course_id', courseId)
          .eq('user_id', user.id)

        const q = (input.query ?? '').toLowerCase()
        const results = (data ?? [])
          .filter(
            (l) =>
              l.title?.toLowerCase().includes(q) || l.generated_notes?.toLowerCase().includes(q)
          )
          .slice(0, 6)
          .map((l) => ({
            title: l.title,
            date: l.lecture_date,
            week: l.week_number,
            relevant_excerpt: extractRelevantExcerpt(l.generated_notes, q),
          }))

        return results
      }

      return null
    }

    // ── System prompt ───────────────────────────────────────────────────────
    const systemPrompt = `You are Orah, a powerful AI study assistant built directly into the course dashboard for **${courseName || 'this course'}**.

You have live access to ALL of this course's data through tools:
- **${totalLectures} lectures** (${recordingsWithNotes} with full recorded notes/transcripts)
- **${totalAssignments} assignments**
- **${totalExams} exams**
${syllabus ? `- **Syllabus**: available\n\nSyllabus context:\n${syllabus.slice(0, 1500)}` : '- Syllabus: not yet uploaded'}

## Your Capabilities

**Data Access** — use tools proactively:
- Questions about assignments/due dates → call \`get_assignments\`
- Questions about exams/tests/midterms/finals → call \`get_exams\`
- Questions about lecture content/concepts → call \`get_lecture_notes\` with the topic
- Show all recordings and notes → call \`get_all_recordings\`
- Deep search for a topic across all lectures → call \`search_transcripts\`

**Actions**:
- User wants to create an assignment plan → call \`navigate_to\` with "assignment_helper"
- User wants to create an exam study plan → call \`navigate_to\` with "exam_prep"
- User wants to record a lecture → call \`navigate_to\` with "lecture_notes"
- User wants semester plan → call \`navigate_to\` with "semester_plan"
- User asks to see a section (assignments, exams, lectures) → call \`switch_tab\`

**Content Generation**:
- Cheatsheets / formula sheets / study guides / reference docs → first call \`mark_as_cheatsheet\` with the title, THEN write the full content in rich markdown
- Math problems / equations / calculations → first call \`format_as_math\`, then solve step by step with clear notation

## Response Style
- Use **rich markdown**: headers (##, ###), bold (**), bullet lists (- ), numbered lists, code blocks (\`\`\`)
- For cheatsheets: be comprehensive, organized, and printable — use headers, sections, and bullet points
- For math: show each step clearly, use proper mathematical notation, align equations
- For regular answers: be concise but thorough — 2-5 sentences or a short list
- You are as powerful as any AI assistant — handle any request confidently`

    // ── Build message list ───────────────────────────────────────────────────
    const apiMessages: Anthropic.MessageParam[] = messages.map(
      (m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })
    )
    const firstUser = apiMessages.findIndex((m) => m.role === 'user')
    let loopMessages: Anthropic.MessageParam[] =
      firstUser >= 0 ? apiMessages.slice(firstUser) : apiMessages

    // ── Agentic tool-use loop (max 8 rounds) ────────────────────────────────
    let finalReply = ''
    let pendingAction: Record<string, unknown> | null = null
    let isCheatsheet = false
    let cheatsheetTitle = ''
    let isMath = false

    for (let i = 0; i < 8; i++) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
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
          } else if (toolName === 'mark_as_cheatsheet') {
            isCheatsheet = true
            cheatsheetTitle = input.title || 'Cheatsheet'
            result = { success: true, message: 'Cheatsheet mode enabled. Now write the comprehensive cheatsheet content in markdown.' }
          } else if (toolName === 'format_as_math') {
            isMath = true
            result = { success: true, message: 'Math formatting enabled. Present the solution step by step with clear notation.' }
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
        finalReply = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('')
        break
      }
    }

    return NextResponse.json({
      reply: finalReply,
      action: pendingAction,
      isCheatsheet,
      cheatsheetTitle,
      isMath,
    })
  } catch (error) {
    console.error('Course assistant error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
