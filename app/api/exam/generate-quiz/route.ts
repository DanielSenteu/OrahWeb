import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const QUIZ_TABLES = ['exam_quiz_questions', 'exam_quiz_uestions'] as const
const QUIZ_MODEL_TIMEOUT_MS = 20000
const MAX_NOTES_CHARS_FOR_QUIZ = 26000

function normalizeTopic(rawTopic: string): string {
  return decodeURIComponent(rawTopic || '').trim().replace(/\s+/g, ' ')
}

function compressNotesForQuiz(notes: string): string {
  if (!notes) return ''
  if (notes.length <= MAX_NOTES_CHARS_FOR_QUIZ) return notes

  // Keep head + tail because summaries and key takeaways are often at ends.
  const headSize = Math.floor(MAX_NOTES_CHARS_FOR_QUIZ * 0.7)
  const tailSize = MAX_NOTES_CHARS_FOR_QUIZ - headSize
  return `${notes.slice(0, headSize)}\n\n[... content truncated for speed ...]\n\n${notes.slice(-tailSize)}`
}

async function getQuizTableName(supabase: any): Promise<string> {
  for (const table of QUIZ_TABLES) {
    const { error } = await supabase.from(table).select('id').limit(1)
    if (!error) return table
    if (!String(error.message || '').toLowerCase().includes('does not exist')) throw error
  }
  return QUIZ_TABLES[0]
}

async function fetchCachedQuestions(supabase: any, examId: string, topic: string, userId: string) {
  const table = await getQuizTableName(supabase)
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('exam_id', examId)
    .eq('topic', topic)
    .eq('user_id', userId)
    .limit(10)
  return { data: error ? null : data, error }
}

function buildFallbackQuizQuestions(topic: string, notes: string) {
  const lines = notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 30)
    .slice(0, 40)

  const fallbackLines = lines.length > 0
    ? lines
    : [
        `${topic} focuses on core concepts, definitions, and practical application.`,
        `Understanding ${topic} requires connecting key ideas and examples.`,
        `Practice and review improve retention for ${topic}.`,
      ]

  const pool = Array.from(new Set(fallbackLines))
  const questions = [] as Array<{
    question_text: string
    options: Array<{ id: string; text: string }>
    correct_answer_id: string
    explanation: string
    incorrect_explanation: string
  }>

  for (let i = 0; i < 10; i++) {
    const correct = pool[i % pool.length]
    const distractor1 = pool[(i + 1) % pool.length]
    const distractor2 = pool[(i + 2) % pool.length]
    const distractor3 = pool[(i + 3) % pool.length]

    questions.push({
      question_text: `Which statement is best supported by the study notes for "${topic}"?`,
      options: [
        { id: 'A', text: correct },
        { id: 'B', text: distractor1 },
        { id: 'C', text: distractor2 },
        { id: 'D', text: distractor3 },
      ],
      correct_answer_id: 'A',
      explanation: 'This option matches the extracted notes most directly.',
      incorrect_explanation: 'The selected option is less aligned with the extracted notes than the best-supported statement.',
    })
  }

  return questions
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const examId = searchParams.get('examId')
    const topic = searchParams.get('topic')
    if (!examId || !topic) {
      return NextResponse.json({ error: 'examId and topic required' }, { status: 400 })
    }
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: exam } = await supabase
      .from('course_exams')
      .select('id, user_id')
      .eq('id', examId)
      .single()
    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    const decodedTopic = normalizeTopic(topic)
    const { data: existing, error: fetchErr } = await fetchCachedQuestions(supabase, examId, decodedTopic, exam.user_id)
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

    if (existing && existing.length >= 10) {
      return NextResponse.json({
        questions: existing.slice(0, 10).map((q: any) => ({
          id: q.id,
          question_text: q.question_text,
          options: q.options,
          correct_answer_id: q.correct_answer_id,
          explanation: q.explanation,
          incorrect_explanation: q.incorrect_explanation,
        })),
        fromCache: true,
      })
    }
    return NextResponse.json({ error: 'No cached questions', questions: [] }, { status: 404 })
  } catch (e: any) {
    console.error('generate-quiz GET error:', e)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY
  const anthropic = hasAnthropic ? new Anthropic() : null

  try {
    const { examId, topic, notes } = await req.json()

    if (!examId || !topic || !notes) {
      return NextResponse.json({ error: 'examId, topic, and notes are required' }, { status: 400 })
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

    const { data: exam, error: examError } = await supabase
      .from('course_exams')
      .select('id, user_id')
      .eq('id', examId)
      .single()

    if (examError || !exam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    }

    const normalizedTopic = normalizeTopic(topic)
    const quizTable = await getQuizTableName(supabase)

    const { data: existingQuestions } = await supabase
      .from(quizTable)
      .select('*')
      .eq('exam_id', examId)
      .eq('topic', normalizedTopic)
      .eq('user_id', exam.user_id)
      .limit(10)

    if (existingQuestions && existingQuestions.length >= 10) {
      return NextResponse.json({
        questions: existingQuestions.slice(0, 10).map((q: any) => ({
          id: q.id,
          question_text: q.question_text,
          options: q.options,
          correct_answer_id: q.correct_answer_id,
          explanation: q.explanation,
          incorrect_explanation: q.incorrect_explanation,
        })),
      })
    }

    const notesForPrompt = compressNotesForQuiz(String(notes))

    const prompt = `Generate 10 high-quality multiple-choice quiz questions about the topic "${normalizedTopic}" based on these study notes:

  ${notesForPrompt}

REQUIREMENTS:
1. Test DEEP UNDERSTANDING, not just memorization
2. Each question must have exactly 4 options (A, B, C, D) with only ONE correct answer
3. Wrong answers should be plausible (common mistakes, misconceptions, or related concepts)
4. Include: 2-3 easy, 4-5 medium, 2-3 hard questions
5. Correct explanation: Why it's correct with reference to the materials
6. Incorrect explanation: Why wrong answers are wrong and what the correct answer is

Return a JSON array with this EXACT structure:
[
  {
    "question_text": "Question here?",
    "options": [
      {"id": "A", "text": "Option A"},
      {"id": "B", "text": "Option B"},
      {"id": "C", "text": "Option C"},
      {"id": "D", "text": "Option D"}
    ],
    "correct_answer_id": "A",
    "explanation": "Why the correct answer is right",
    "incorrect_explanation": "Why the wrong answers are wrong and what the correct answer is"
  }
]`

    let response: Awaited<ReturnType<Anthropic['messages']['create']>> | null = null
    let modelError: unknown = null
    if (anthropic) {
      for (let attempt = 0; attempt < 1; attempt++) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), QUIZ_MODEL_TIMEOUT_MS)
        try {
          response = await anthropic.messages.create(
            {
              model: 'claude-sonnet-4-6',
              max_tokens: 5000,
              system: 'You are an expert at creating educational quiz questions. Return ONLY a valid JSON array, no markdown or explanation.',
              messages: [{ role: 'user', content: prompt }],
            },
            { signal: controller.signal }
          )
          clearTimeout(timeout)
          break
        } catch (error) {
          clearTimeout(timeout)
          modelError = error
        }
      }
    }

    let questionsData: any[] = []
    if (response) {
      const rawText = response.content[0]?.type === 'text' ? response.content[0].text : ''
      const cleanedQuiz = rawText.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim()

      try {
        questionsData = JSON.parse(cleanedQuiz)
      } catch {
        const arrayMatch = cleanedQuiz.match(/\[[\s\S]*\]/)
        if (arrayMatch) questionsData = JSON.parse(arrayMatch[0])
      }
    }

    if (!Array.isArray(questionsData) || questionsData.length === 0) {
      if (modelError) {
        console.warn('Quiz model fallback activated:', modelError instanceof Error ? modelError.message : String(modelError))
      }
      questionsData = buildFallbackQuizQuestions(normalizedTopic, notesForPrompt)
    }

    const questionsToSave = questionsData.slice(0, 10)

    const questionsToInsert = questionsToSave.map((q: any, index: number) => ({
      exam_id: examId,
      user_id: exam.user_id,
      topic: normalizedTopic,
      question_text: q.question_text,
      options: q.options,
      correct_answer_id: q.correct_answer_id,
      explanation: q.explanation || 'This is the correct answer.',
      incorrect_explanation: q.incorrect_explanation || q.explanation || 'This is incorrect.',
      difficulty: index < 3 ? 'easy' : index < 7 ? 'medium' : 'hard',
    }))

    const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false },
        })
      : supabase

    const { data: insertedQuestions, error: insertError } = await supabaseAdmin
      .from(quizTable)
      .insert(questionsToInsert)
      .select()

    if (insertError) {
      console.error('Error saving quiz questions:', insertError)
      return NextResponse.json({
        questions: questionsToSave.map((q: any, i: number) => ({
          id: `temp-${Date.now()}-${i}`,
          question_text: q.question_text,
          options: q.options,
          correct_answer_id: q.correct_answer_id,
          explanation: q.explanation || 'This is the correct answer.',
          incorrect_explanation: q.incorrect_explanation || q.explanation || 'This is incorrect.',
        })),
      })
    }

    return NextResponse.json({
      questions: (insertedQuestions || []).map((q: any) => ({
        id: q.id,
        question_text: q.question_text,
        options: q.options,
        correct_answer_id: q.correct_answer_id,
        explanation: q.explanation || 'This is the correct answer.',
        incorrect_explanation: q.incorrect_explanation || q.explanation || 'This is incorrect.',
      })),
    })
  } catch (error: any) {
    console.error('Error generating quiz:', error)
    return NextResponse.json({ error: 'Server error', details: error?.message }, { status: 500 })
  }
}
