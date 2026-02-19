import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

/* ──────────────────────────────────────────
   Course-specific AI chat with tool calls.

   Tools the model can call:
   • get_course_info      – course name, semester, professor
   • get_lectures         – list of lectures + notes status
   • get_assignments      – assignments with due dates & status
   • get_exams            – exams with dates & topics
   • get_lecture_notes    – full generated notes for one lecture
   ────────────────────────────────────────── */

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_course_info',
      description: 'Get basic information about this course: name, professor, semester.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_lectures',
      description: 'Retrieve the list of lectures for this course, including title, date, week number, and whether notes are ready.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_assignments',
      description: 'Retrieve all assignments for this course, including name, due date, status, and whether a plan exists.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_exams',
      description: 'Retrieve all exams for this course, including name, date, topics, and whether a study plan exists.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_lecture_notes',
      description: 'Retrieve the full AI-generated notes for a specific lecture by its ID.',
      parameters: {
        type: 'object',
        properties: {
          lecture_id: {
            type: 'string',
            description: 'The ID of the lecture whose notes you want to retrieve.',
          },
        },
        required: ['lecture_id'],
      },
    },
  },
]

/* ─── Execute tool call ─── */
async function executeTool(
  name: string,
  args: Record<string, string>,
  courseId: string,
  userId: string,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  switch (name) {
    case 'get_course_info': {
      const { data } = await supabase
        .from('courses')
        .select('course_name, professor_name, semester, year')
        .eq('id', courseId)
        .eq('user_id', userId)
        .single()
      if (!data) return 'No course information found.'
      return JSON.stringify(data)
    }

    case 'get_lectures': {
      const { data } = await supabase
        .from('course_lectures')
        .select('id, title, lecture_date, week_number, processing_status, generated_notes')
        .eq('course_id', courseId)
        .eq('user_id', userId)
        .order('lecture_date', { ascending: true })
      if (!data || data.length === 0) {
        return 'NO_DATA: No lectures have been added yet for this course. The student has not recorded any lectures or uploaded any transcripts.'
      }
      return JSON.stringify(
        data.map(l => ({
          id: l.id,
          title: l.title,
          date: l.lecture_date,
          week: l.week_number,
          notes_ready: l.processing_status === 'completed' && !!l.generated_notes,
        }))
      )
    }

    case 'get_assignments': {
      const { data } = await supabase
        .from('course_assignments')
        .select('id, assignment_name, due_date, status, description, step_by_step_plan')
        .eq('course_id', courseId)
        .eq('user_id', userId)
        .order('due_date', { ascending: true })
      if (!data || data.length === 0) {
        return 'NO_DATA: No assignments have been added yet for this course.'
      }
      return JSON.stringify(
        data.map(a => ({
          id: a.id,
          name: a.assignment_name,
          due_date: a.due_date,
          status: a.status || 'not started',
          has_plan: !!a.step_by_step_plan,
        }))
      )
    }

    case 'get_exams': {
      const { data } = await supabase
        .from('course_exams')
        .select('id, exam_name, exam_date, status, topics')
        .eq('course_id', courseId)
        .eq('user_id', userId)
        .order('exam_date', { ascending: true })
      if (!data || data.length === 0) {
        return 'NO_DATA: No exams have been added yet for this course.'
      }
      return JSON.stringify(data)
    }

    case 'get_lecture_notes': {
      const lectureId = args.lecture_id
      if (!lectureId) return 'Error: lecture_id is required.'
      const { data } = await supabase
        .from('course_lectures')
        .select('title, generated_notes, processing_status')
        .eq('id', lectureId)
        .eq('course_id', courseId)
        .eq('user_id', userId)
        .single()
      if (!data) return 'Lecture not found.'
      if (!data.generated_notes) {
        return data.processing_status === 'processing'
          ? 'Notes are still being processed for this lecture.'
          : 'NO_DATA: No notes have been generated for this lecture yet. The student has not recorded this lecture or the recording has not been processed.'
      }
      return `Title: ${data.title}\n\nNotes:\n${data.generated_notes}`
    }

    default:
      return 'Unknown tool.'
  }
}

/* ─── Route handler ─── */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: courseId } = await params

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Missing OPENAI_API_KEY' }, { status: 500 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { messages } = await req.json()
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages' }, { status: 400 })
    }

    // Fetch course name for system prompt
    const { data: course } = await supabase
      .from('courses')
      .select('course_name')
      .eq('id', courseId)
      .eq('user_id', user.id)
      .single()

    const courseName = course?.course_name || 'this course'
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

    const systemPrompt = `You are Orah, a helpful academic AI assistant for the course "${courseName}".
Today's date is ${today}.

You have access to tools that let you fetch real data about this course:
- Lectures (and their notes if generated)
- Assignments (with due dates)
- Exams (with dates and topics)

IMPORTANT BEHAVIOUR:
- Always use the relevant tool(s) before answering data-related questions.
- If a tool returns data starting with "NO_DATA:", that section is empty.
  In that case, tell the student clearly that no data exists yet, and suggest
  what they should do: e.g. "There are no lectures recorded yet. Head to the
  Lectures tab and record your first lecture or upload a transcript so I can
  help you with notes and quizzes."
- Be helpful, warm, and concise. Give direct answers, not waffle.
- When showing lists, use a clean format with bullet points or numbered lists.
- If the student asks to be quizzed, create 3-5 quiz questions from the lecture notes.
- Keep responses focused and useful for a student.`

    // Build message list for OpenAI
    const oaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ]

    // Agentic loop – allow up to 5 tool call rounds
    let rounds = 0
    while (rounds < 5) {
      rounds++
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: oaiMessages,
        tools: TOOLS,
        tool_choice: 'auto',
        max_tokens: 1500,
      })

      const msg = response.choices[0].message

      // If no tool calls, we're done
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return NextResponse.json({ message: msg.content || '' })
      }

      // Push assistant message with tool calls
      oaiMessages.push(msg)

      // Execute each tool call and push results
      for (const tc of msg.tool_calls) {
        const args = JSON.parse(tc.function.arguments || '{}')
        const result = await executeTool(tc.function.name, args, courseId, user.id, supabase)
        oaiMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        })
      }
    }

    return NextResponse.json({ message: 'I had trouble processing your request. Please try again.' })
  } catch (err: unknown) {
    console.error('Course chat error:', err)
    const msg = err instanceof Error ? err.message : 'An error occurred'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
