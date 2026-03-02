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
  | 'get_schedule'
  | 'get_all_courses'
  | 'create_task'
  | 'get_course_inventory'

const TOOLS: Anthropic.Tool[] = [
  // ── Data access ──────────────────────────────────────────────────────────
  {
    name: 'get_assignments',
    description:
      'Fetch all assignments for this course including due dates and status. Use when asked about assignments, deadlines, workload, or upcoming work.',
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
      'Search through recorded lecture notes for a specific topic. Use when asked about lecture content, concepts covered in class, or specific topics.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The topic, concept, or keyword to search for in lecture notes' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_all_recordings',
    description:
      'Fetch all recorded lectures for this course including their notes. Use when asked about recordings, all lectures, or when gathering content for a cheatsheet or study guide.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'search_transcripts',
    description:
      'Deep search across all lecture transcripts and notes for a specific topic. Use for finding specific concepts, formulas, or topics across all lectures — especially useful for cheatsheets and study guides.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Topic, concept, formula, or keyword to search across all lecture content' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_schedule',
    description:
      "Fetch the student's upcoming study tasks and schedule across ALL their courses for the next N days. Use when asked about schedule, what to study this week, time management, or academic workload.",
    input_schema: {
      type: 'object' as const,
      properties: {
        days_ahead: { type: 'number', description: 'Number of days to look ahead (default 7, max 30)' },
      },
      required: [],
    },
  },
  {
    name: 'get_all_courses',
    description:
      "Fetch all courses the student is enrolled in. Use for cross-course planning, study load assessment, or when discussing overall academic workload.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'create_task',
    description:
      "Add a study task to the student's semester plan for this course. Use when the student asks Orah to schedule something, add a task, set up a study session, or create a reminder to study a topic.",
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Task title (short, actionable)' },
        notes: { type: 'string', description: 'Task description or study notes' },
        estimated_minutes: { type: 'number', description: 'Estimated time in minutes (default 30)' },
        scheduled_date: { type: 'string', description: 'Date to schedule task in YYYY-MM-DD format (default: today)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'get_course_inventory',
    description:
      "Get a complete inventory of what has been uploaded or recorded for this course — syllabus, lectures (recorded vs not), assignments, exams, and what is MISSING. Use when the student asks what's uploaded, what's missing, what they need to add, or to audit course completeness.",
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  // ── Navigation ───────────────────────────────────────────────────────────
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
        },
      },
      required: ['page'],
    },
  },
  {
    name: 'switch_tab',
    description:
      'Switch the course dashboard to a different tab. Use when the user asks to see assignments, exams, lectures, or the overview.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tab: { type: 'string', enum: ['overview', 'lectures', 'assignments', 'exams'] },
      },
      required: ['tab'],
    },
  },
  // ── Content signals ──────────────────────────────────────────────────────
  {
    name: 'mark_as_cheatsheet',
    description:
      'Call BEFORE creating a cheatsheet, formula sheet, study guide, or reference document. This enables the student to download the response as a formatted PDF.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Title for the cheatsheet' },
      },
      required: ['title'],
    },
  },
  {
    name: 'format_as_math',
    description:
      'Call BEFORE solving or presenting math problems, equations, or calculations. This enables enhanced math formatting in the response.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractRelevantExcerpt(text: string | null, query: string): string {
  if (!text) return ''
  const lower = text.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) return text.slice(0, 500)
  const start = Math.max(0, idx - 150)
  const end = Math.min(text.length, idx + 500)
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
}

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Route ─────────────────────────────────────────────────────────────────────

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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // ── Lightweight inventory for system prompt context ──────────────────────
    const [lectureRes, assignmentRes, examRes] = await Promise.all([
      supabase.from('course_lectures').select('id, processing_status').eq('course_id', courseId).eq('user_id', user.id),
      supabase.from('course_assignments').select('id').eq('course_id', courseId).eq('user_id', user.id),
      supabase.from('course_exams').select('id').eq('course_id', courseId).eq('user_id', user.id),
    ])

    const lectureRows = lectureRes.data ?? []
    const recordingsWithNotes = lectureRows.filter(l => l.processing_status === 'completed').length
    const totalLectures = lectureRows.length
    const totalAssignments = assignmentRes.data?.length ?? 0
    const totalExams = examRes.data?.length ?? 0

    // ── Tool execution ────────────────────────────────────────────────────────
    let pendingAction: Record<string, unknown> | null = null
    let isCheatsheet = false
    let cheatsheetTitle = ''
    let isMath = false
    let taskCreated: { title: string; date: string } | null = null

    const executeTool = async (name: ToolName, input: Record<string, string | number>) => {
      // ── Assignments ──────────────────────────────────────────────────────
      if (name === 'get_assignments') {
        const { data } = await supabase
          .from('course_assignments')
          .select('id, assignment_name, due_date, status, description')
          .eq('course_id', courseId).eq('user_id', user.id)
          .order('due_date', { ascending: true })
        return data ?? []
      }

      // ── Exams ────────────────────────────────────────────────────────────
      if (name === 'get_exams') {
        const { data } = await supabase
          .from('course_exams')
          .select('id, exam_name, exam_date, status, topics')
          .eq('course_id', courseId).eq('user_id', user.id)
          .order('exam_date', { ascending: true })
        return data ?? []
      }

      // ── Lecture notes search ─────────────────────────────────────────────
      if (name === 'get_lecture_notes') {
        const { data } = await supabase
          .from('course_lectures')
          .select('id, title, lecture_date, generated_notes, week_number')
          .eq('course_id', courseId).eq('user_id', user.id)
          .eq('processing_status', 'completed')
        const q = String(input.query ?? '').toLowerCase()
        return (data ?? [])
          .filter(l => l.title?.toLowerCase().includes(q) || l.generated_notes?.toLowerCase().includes(q))
          .slice(0, 3)
          .map(l => ({ id: l.id, title: l.title, date: l.lecture_date, notes_excerpt: extractRelevantExcerpt(l.generated_notes, q) }))
      }

      // ── All recordings ───────────────────────────────────────────────────
      if (name === 'get_all_recordings') {
        const { data } = await supabase
          .from('course_lectures')
          .select('id, title, lecture_date, week_number, generated_notes, audio_url, processing_status')
          .eq('course_id', courseId).eq('user_id', user.id)
          .order('lecture_date', { ascending: true })
        return (data ?? []).map(l => ({
          id: l.id, title: l.title, date: l.lecture_date, week: l.week_number,
          has_recording: !!l.audio_url, has_notes: l.processing_status === 'completed',
          notes_summary: l.generated_notes ? l.generated_notes.slice(0, 1200) : null,
        }))
      }

      // ── Deep transcript search ───────────────────────────────────────────
      if (name === 'search_transcripts') {
        const { data } = await supabase
          .from('course_lectures')
          .select('id, title, lecture_date, generated_notes, week_number')
          .eq('course_id', courseId).eq('user_id', user.id)
        const q = String(input.query ?? '').toLowerCase()
        return (data ?? [])
          .filter(l => l.title?.toLowerCase().includes(q) || l.generated_notes?.toLowerCase().includes(q))
          .slice(0, 6)
          .map(l => ({ title: l.title, date: l.lecture_date, week: l.week_number, relevant_excerpt: extractRelevantExcerpt(l.generated_notes, q) }))
      }

      // ── Schedule ─────────────────────────────────────────────────────────
      if (name === 'get_schedule') {
        const daysAhead = Math.min(Number(input.days_ahead ?? 7), 30)
        const today = new Date(); today.setHours(0, 0, 0, 0)

        const { data: plans } = await supabase
          .from('course_semester_plans')
          .select('id, course_id, plan_data, courses(course_name, color)')
          .eq('user_id', user.id)

        const upcoming: Record<string, any[]> = {}
        for (let i = 0; i < daysAhead; i++) {
          const d = new Date(today); d.setDate(d.getDate() + i)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          const dayTasks: any[] = []
          for (const plan of plans ?? []) {
            const tasks = (plan.plan_data?.tasks ?? []).filter((t: any) => t.scheduled_date_key === key)
            tasks.forEach((t: any) => dayTasks.push({
              course: (plan.courses as any)?.course_name ?? 'Unknown',
              title: t.title, estimated_minutes: t.estimated_minutes ?? 0, status: t.status ?? 'pending',
            }))
          }
          if (dayTasks.length > 0) upcoming[key] = dayTasks
        }
        return upcoming
      }

      // ── All courses ──────────────────────────────────────────────────────
      if (name === 'get_all_courses') {
        const { data } = await supabase
          .from('courses')
          .select('id, course_name, professor_name, semester, year, color')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
        return data ?? []
      }

      // ── Create task ──────────────────────────────────────────────────────
      if (name === 'create_task') {
        const { data: plan } = await supabase
          .from('course_semester_plans')
          .select('id, plan_data')
          .eq('course_id', courseId).eq('user_id', user.id)
          .single()

        if (!plan) {
          return { success: false, message: 'No semester plan found for this course. Ask the student to create one first at the Semester Plan page.' }
        }

        const dateKey = String(input.scheduled_date ?? todayKey())
        const newTask = {
          id: `orah-${Date.now()}`,
          title: String(input.title),
          notes: String(input.notes ?? ''),
          estimated_minutes: Number(input.estimated_minutes ?? 30),
          scheduled_date_key: dateKey,
          status: 'notStarted',
          is_completed: false,
          day_number: (plan.plan_data?.tasks?.length ?? 0) + 1,
          created_at: new Date().toISOString(),
        }

        const updatedTasks = [...(plan.plan_data?.tasks ?? []), newTask]
        await supabase
          .from('course_semester_plans')
          .update({ plan_data: { ...plan.plan_data, tasks: updatedTasks } })
          .eq('id', plan.id)

        taskCreated = { title: newTask.title, date: dateKey }
        return { success: true, task: newTask }
      }

      // ── Course inventory ─────────────────────────────────────────────────
      if (name === 'get_course_inventory') {
        const [lecturesR, assignmentsR, examsR, courseR, planR] = await Promise.all([
          supabase.from('course_lectures').select('id, title, lecture_date, audio_url, processing_status').eq('course_id', courseId).eq('user_id', user.id).order('lecture_date', { ascending: true }),
          supabase.from('course_assignments').select('id, assignment_name, due_date, status').eq('course_id', courseId).eq('user_id', user.id),
          supabase.from('course_exams').select('id, exam_name, exam_date, status').eq('course_id', courseId).eq('user_id', user.id),
          supabase.from('courses').select('syllabus_text, course_name').eq('id', courseId).single(),
          supabase.from('course_semester_plans').select('id').eq('course_id', courseId).eq('user_id', user.id).single(),
        ])

        const lectures = lecturesR.data ?? []
        const recorded = lectures.filter(l => !!l.audio_url)
        const withNotes = lectures.filter(l => l.processing_status === 'completed')
        const unrecorded = lectures.filter(l => !l.audio_url)

        const missing: string[] = []
        if (!courseR.data?.syllabus_text) missing.push('Syllabus not uploaded → go to Syllabus page')
        if (!planR.data) missing.push('No semester plan created → go to Semester Plan page')
        if (unrecorded.length > 0) missing.push(`${unrecorded.length} lecture(s) not recorded → go to Lecture Notes page`)
        if (lectures.length === 0) missing.push('No lectures added yet → upload syllabus to auto-populate or go to Lecture Notes')

        return {
          syllabus: { uploaded: !!courseR.data?.syllabus_text },
          semester_plan: { created: !!planR.data },
          lectures: {
            total: lectures.length, recorded: recorded.length, with_notes: withNotes.length,
            unrecorded_titles: unrecorded.map(l => l.title || 'Untitled'),
          },
          assignments: {
            total: assignmentsR.data?.length ?? 0,
            list: (assignmentsR.data ?? []).map(a => ({ name: a.assignment_name, due: a.due_date, status: a.status })),
          },
          exams: {
            total: examsR.data?.length ?? 0,
            list: (examsR.data ?? []).map(e => ({ name: e.exam_name, date: e.exam_date, status: e.status })),
          },
          missing_items: missing,
          completeness_score: `${Math.round((
            (courseR.data?.syllabus_text ? 25 : 0) +
            (planR.data ? 20 : 0) +
            (recorded.length > 0 ? Math.min(30, recorded.length * 5) : 0) +
            ((assignmentsR.data?.length ?? 0) > 0 ? 15 : 0) +
            ((examsR.data?.length ?? 0) > 0 ? 10 : 0)
          ))}%`,
        }
      }

      return null
    }

    // ── System prompt ─────────────────────────────────────────────────────────
    const systemPrompt = `You are **Orah**, a powerful AI study assistant embedded in the course dashboard for **${courseName || 'this course'}**.

You have live access to ALL of this course's data:
- **${totalLectures} lectures** (${recordingsWithNotes} with notes/transcripts)
- **${totalAssignments} assignments** | **${totalExams} exams**
${syllabus ? `- **Syllabus**: uploaded\n\nSyllabus context:\n${syllabus.slice(0, 1500)}` : '- **Syllabus**: not yet uploaded'}

---

## Tools Available — Use Proactively

| Question Type | Tool |
|---|---|
| Assignments / due dates | get_assignments |
| Exams / midterms / finals | get_exams |
| Lecture content / concepts | get_lecture_notes |
| All recordings / notes | get_all_recordings |
| Search across all transcripts | search_transcripts |
| Schedule / what to study this week | get_schedule |
| All enrolled courses / workload | get_all_courses |
| What's uploaded / what's missing | get_course_inventory |
| Create assignment plan → | navigate_to: assignment_helper |
| Create exam study plan → | navigate_to: exam_prep |
| Record a lecture → | navigate_to: lecture_notes |
| Create semester plan → | navigate_to: semester_plan |
| Add a task to schedule | create_task |
| See a section of the dashboard | switch_tab |
| Creating cheatsheet/study guide | mark_as_cheatsheet (call FIRST, then write content) |
| Math problems / equations | format_as_math (call FIRST, then solve) |

---

## Content Capabilities — Use Freely

You can generate rich, formatted content. Always use appropriate formatting:

### Diagrams (auto-rendered in the UI)
Write diagrams inside \`\`\`mermaid code blocks. Examples:
- Flowcharts: \`graph TD; A-->B; B-->C\`
- Mind maps: \`mindmap; root((Topic)); Branch1; Branch2\`
- Timelines: \`timeline; section Week 1; Task A : 2024-01-01\`
- Sequence diagrams: \`sequenceDiagram; A->>B: message\`
- Pie charts: \`pie; "A" : 30; "B" : 70\`
- Gantt charts for study plans

### SVG Graphics (auto-rendered)
Write SVG in \`\`\`svg blocks for custom visual diagrams, concept maps, geometric figures.

### HTML Previews (auto-rendered with live preview)
Write HTML in \`\`\`html blocks for rich documents, flashcard sets, formatted tables, interactive previews.

### Markdown
- **Bold**, *italic*, \`code\`, headers (##, ###)
- Tables: | col1 | col2 | (always include header row + separator row)
- Numbered lists, bullet lists

### Interactive Quizzes
Format quiz questions with checkboxes to create interactive quiz cards:
\`\`\`
**Q:** Question text?
- [ ] Wrong option
- [x] Correct option
- [ ] Wrong option
\`\`\`
The UI renders these as clickable cards with reveal buttons.

---

## Response Rules
- **Be powerful**: match the quality of Claude/ChatGPT — comprehensive, formatted, well-structured
- **Use diagrams** when explaining processes, relationships, timelines, or comparisons
- **Use tables** for structured data, comparisons, schedules
- **Use quizzes** when someone asks to be tested or wants practice questions
- **For cheatsheets**: use \`mark_as_cheatsheet\` then write comprehensive, printable markdown with clear sections
- **For math**: use \`format_as_math\` then show each step clearly with proper notation
- **Never truncate** — give complete, full responses`

    // ── Build message list ────────────────────────────────────────────────────
    const apiMessages: Anthropic.MessageParam[] = messages.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
    const firstUser = apiMessages.findIndex(m => m.role === 'user')
    let loopMessages: Anthropic.MessageParam[] = firstUser >= 0 ? apiMessages.slice(firstUser) : apiMessages

    // ── Agentic tool-use loop (max 10 rounds) ────────────────────────────────
    let finalReply = ''

    for (let i = 0; i < 10; i++) {
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
          .map(b => b.text)
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
          const input = block.input as Record<string, string | number>
          let result: unknown

          if (toolName === 'navigate_to') {
            pendingAction = { type: 'navigate', page: input.page }
            result = { success: true }
          } else if (toolName === 'switch_tab') {
            pendingAction = { type: 'switch_tab', tab: input.tab }
            result = { success: true }
          } else if (toolName === 'mark_as_cheatsheet') {
            isCheatsheet = true
            cheatsheetTitle = String(input.title || 'Cheatsheet')
            result = { success: true, message: 'Cheatsheet mode enabled. Write comprehensive markdown content.' }
          } else if (toolName === 'format_as_math') {
            isMath = true
            result = { success: true, message: 'Math mode enabled. Present step-by-step solution with clear notation.' }
          } else {
            result = await executeTool(toolName, input)
          }

          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
        }

        loopMessages = [...loopMessages, { role: 'user', content: toolResults }]
      } else {
        finalReply = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('')
        break
      }
    }

    return NextResponse.json({ reply: finalReply, action: pendingAction, isCheatsheet, cheatsheetTitle, isMath, taskCreated })
  } catch (error) {
    console.error('Course assistant error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
