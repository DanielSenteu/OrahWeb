import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const { 
      examId, 
      topic, 
      questionsAnswered 
    } = await req.json()
    
    if (!examId || !topic || !questionsAnswered || !Array.isArray(questionsAnswered)) {
      return NextResponse.json({ 
        error: 'examId, topic, and questionsAnswered array are required' 
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

    // Calculate score
    const totalQuestions = questionsAnswered.length
    const correctAnswers = questionsAnswered.filter((q: any) => q.is_correct).length
    const incorrectAnswers = totalQuestions - correctAnswers
    const scorePercentage = Math.round((correctAnswers / totalQuestions) * 100)

    // Save quiz attempt
    const { data: attempt, error: insertError } = await supabase
      .from('exam_quiz_attempts')
      .insert({
        exam_id: examId,
        user_id: exam.user_id,
        topic: topic,
        questions_answered: questionsAnswered,
        score_percentage: scorePercentage,
        total_questions: totalQuestions,
        correct_answers: correctAnswers,
        incorrect_answers: incorrectAnswers,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error saving quiz attempt:', insertError)
      return NextResponse.json({ 
        error: 'Failed to save attempt', 
        details: insertError 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true,
      attemptId: attempt.id,
      score: scorePercentage,
      correctAnswers,
      incorrectAnswers,
      totalQuestions,
    })
  } catch (error: any) {
    console.error('Error saving quiz attempt:', error)
    return NextResponse.json({ 
      error: 'Server error', 
      details: error?.message 
    }, { status: 500 })
  }
}
