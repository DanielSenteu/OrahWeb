import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

export async function POST(req: Request) {
  try {
    const { examId, topic, notes } = await req.json()
    
    if (!examId || !topic || !notes) {
      return NextResponse.json({ 
        error: 'examId, topic, and notes are required' 
      }, { status: 400 })
    }

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    // Initialize Supabase with auth
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Verify exam exists
    const { data: exam, error: examError } = await supabase
      .from('course_exams')
      .select('id, user_id')
      .eq('id', examId)
      .single()

    if (examError || !exam) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    }

    // Check if questions already exist for this topic
    const { data: existingQuestions } = await supabase
      .from('exam_quiz_questions')
      .select('*')
      .eq('exam_id', examId)
      .eq('topic', topic)
      .eq('user_id', exam.user_id)

    if (existingQuestions && existingQuestions.length >= 10) {
      // Return existing questions
      return NextResponse.json({ 
        questions: existingQuestions.slice(0, 10).map(q => ({
          id: q.id,
          question_text: q.question_text,
          options: q.options,
          correct_answer_id: q.correct_answer_id,
          explanation: q.explanation,
          incorrect_explanation: q.incorrect_explanation,
        }))
      })
    }

    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    })

    // Generate 10 quiz questions
    const prompt = `Generate 10 multiple-choice quiz questions about the topic "${topic}" based on these study notes:

${notes}

Requirements:
- Each question should have exactly 4 answer options (A, B, C, D)
- Only one answer should be correct
- Questions should test understanding, not just memorization
- Include explanations for why the correct answer is right
- Include explanations for why wrong answers are wrong
- Questions should be of varying difficulty (some easy, some medium, some hard)

Return a JSON array with this exact structure:
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

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-2024-11-20',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at creating educational quiz questions. Always return valid JSON arrays only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    })

    const responseContent = completion.choices[0]?.message?.content || '{}'
    let questionsData: any[] = []

    try {
      const parsed = JSON.parse(responseContent)
      // Handle both {questions: [...]} and [...] formats
      questionsData = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.questions_array || [])
    } catch (e) {
      // Try to extract array from text
      const arrayMatch = responseContent.match(/\[[\s\S]*\]/)
      if (arrayMatch) {
        questionsData = JSON.parse(arrayMatch[0])
      }
    }

    if (!Array.isArray(questionsData) || questionsData.length === 0) {
      return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 })
    }

    // Limit to 10 questions
    const questionsToSave = questionsData.slice(0, 10)

    // Save questions to database
    const questionsToInsert = questionsToSave.map((q, index) => ({
      exam_id: examId,
      user_id: exam.user_id,
      topic: topic,
      question_text: q.question_text,
      options: q.options,
      correct_answer_id: q.correct_answer_id,
      explanation: q.explanation || 'This is the correct answer.',
      incorrect_explanation: q.incorrect_explanation || q.explanation || 'This is incorrect.',
      difficulty: index < 3 ? 'easy' : index < 7 ? 'medium' : 'hard',
    }))

    const { data: insertedQuestions, error: insertError } = await supabase
      .from('exam_quiz_questions')
      .insert(questionsToInsert)
      .select()

    if (insertError) {
      console.error('Error saving questions:', insertError)
      // Still return questions even if save fails, with temp IDs
      return NextResponse.json({ 
        questions: questionsToSave.map((q, i) => ({
          id: `temp-${Date.now()}-${i}`,
          question_text: q.question_text,
          options: q.options,
          correct_answer_id: q.correct_answer_id,
          explanation: q.explanation || 'This is the correct answer.',
          incorrect_explanation: q.incorrect_explanation || q.explanation || 'This is incorrect.',
        }))
      })
    }

    // Return saved questions with their real IDs
    return NextResponse.json({ 
      questions: (insertedQuestions || []).map((q: any) => ({
        id: q.id,
        question_text: q.question_text,
        options: q.options,
        correct_answer_id: q.correct_answer_id,
        explanation: q.explanation || 'This is the correct answer.',
        incorrect_explanation: q.incorrect_explanation || q.explanation || 'This is incorrect.',
      }))
    })
  } catch (error: any) {
    console.error('Error generating quiz:', error)
    return NextResponse.json({ 
      error: 'Server error', 
      details: error?.message 
    }, { status: 500 })
  }
}
