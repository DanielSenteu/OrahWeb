'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/layout/Navigation'
import QuizCard from '@/components/exam/QuizCard'
import QuizResults from '@/components/exam/QuizResults'
import './quiz-page.css'

interface QuizQuestion {
  id: string
  question_text: string
  options: Array<{ id: string; text: string }>
  correct_answer_id: string
  explanation: string
  incorrect_explanation?: string
}

export default function QuizPage() {
  const router = useRouter()
  const params = useParams()
  const examId = params.examId as string
  const topic = params.topic as string
  const supabase = createClient()

  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Array<{ question_id: string; selected_answer: string; is_correct: boolean }>>([])
  const [loading, setLoading] = useState(true)
  const [showResults, setShowResults] = useState(false)
  const [score, setScore] = useState(0)

  useEffect(() => {
    loadQuiz()
  }, [examId, topic])

  const loadQuiz = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Get session token first
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      // Decode topic from URL
      const decodedTopic = decodeURIComponent(topic)

      // Get exam documents for this topic
      const { data: documents } = await supabase
        .from('exam_documents')
        .select('document_name, extracted_text, topics')
        .eq('exam_id', examId)
        .eq('user_id', user.id)

      // Get relevant documents for this topic
      const relevantDocs = documents?.filter(d => 
        !d.topics || 
        d.topics.length === 0 || 
        d.topics.some((t: string) => 
          t.toLowerCase().includes(decodedTopic.toLowerCase()) ||
          decodedTopic.toLowerCase().includes(t.toLowerCase())
        )
      ) || documents || []

      // Prepare notes (chunk + summarize if needed)
      let notes = ''
      
      if (relevantDocs.length > 0) {
        try {
          // Prepare documents for API
          const docsForAPI = relevantDocs.map(d => ({
            name: d.document_name || 'Document',
            text: d.extracted_text || '',
          }))

          // Call prepare-topic-notes API to chunk and summarize if needed
          const prepareRes = await fetch('/api/exam/prepare-topic-notes', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              documents: docsForAPI,
              topic: decodedTopic,
            }),
          })

          if (prepareRes.ok) {
            const prepareData = await prepareRes.json()
            notes = prepareData.preparedNotes
            console.log(`📝 Quiz notes prepared: ${prepareData.wasSummarized ? 'Summarized' : 'Used as-is'} (${prepareData.originalTokens} → ${prepareData.finalTokens} tokens)`)
          } else {
            // Fallback: use documents as-is
            notes = relevantDocs
              .map(d => d.extracted_text)
              .filter(Boolean)
              .join('\n\n---\n\n')
          }
        } catch (error) {
          console.error('Error preparing quiz notes:', error)
          // Fallback: use documents as-is
          notes = relevantDocs
            .map(d => d.extracted_text)
            .filter(Boolean)
            .join('\n\n---\n\n')
        }
      }

      if (!notes) {
        alert('No notes found for this topic. Please upload study materials first.')
        router.back()
        return
      }

      // Generate or fetch quiz questions
      const res = await fetch('/api/exam/generate-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          examId,
          topic: decodedTopic,
          notes,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to generate quiz')
      }

      const data = await res.json()
      setQuestions(data.questions || [])
      setLoading(false)
    } catch (error) {
      console.error('Error loading quiz:', error)
      alert('Failed to load quiz. Please try again.')
      router.back()
    }
  }

  const handleAnswer = (isCorrect: boolean, selectedAnswerId?: string) => {
    const currentQuestion = questions[currentQuestionIndex]
    if (!currentQuestion) return

    setAnswers(prev => {
      // Check if we already have an answer for this question
      const existingIndex = prev.findIndex(a => a.question_id === currentQuestion.id)
      if (existingIndex >= 0) {
        // Update existing answer
        const updated = [...prev]
        updated[existingIndex] = {
          question_id: currentQuestion.id,
          selected_answer: selectedAnswerId || '',
          is_correct: isCorrect,
        }
        return updated
      }
      
      // Add new answer
      return [
        ...prev,
        {
          question_id: currentQuestion.id,
          selected_answer: selectedAnswerId || '',
          is_correct: isCorrect,
        }
      ]
    })
  }

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1)
    } else {
      // Quiz complete - calculate score and save
      finishQuiz()
    }
  }

  const finishQuiz = async () => {
    const correctAnswers = answers.filter(a => a.is_correct).length
    const totalQuestions = questions.length
    const scorePercentage = Math.round((correctAnswers / totalQuestions) * 100)
    setScore(scorePercentage)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Get all answers (including current question if answered)
      const allAnswers = answers.length === questions.length 
        ? answers 
        : [...answers, {
            question_id: questions[questions.length - 1]?.id || '',
            selected_answer: '',
            is_correct: false,
          }]

      // Save quiz attempt
      await fetch('/api/exam/save-attempt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          examId,
          topic: decodeURIComponent(topic),
          questionsAnswered: allAnswers.map((a, i) => ({
            question_id: questions[i]?.id || a.question_id,
            selected_answer: a.selected_answer,
            is_correct: a.is_correct,
          })),
        }),
      })
    } catch (error) {
      console.error('Error saving quiz attempt:', error)
    }

    setShowResults(true)
  }

  const handleRetake = () => {
    setCurrentQuestionIndex(0)
    setAnswers([])
    setShowResults(false)
    setScore(0)
  }

  if (loading) {
    return (
      <>
        <Navigation />
        <div className="quiz-loading">
          <div className="spinner" style={{ width: '40px', height: '40px' }}></div>
          <p>Generating quiz questions...</p>
        </div>
      </>
    )
  }

  if (questions.length === 0) {
    return (
      <>
        <Navigation />
        <div className="quiz-error">
          <h2>No questions available</h2>
          <button onClick={() => router.back()} className="btn-back">
            Go Back
          </button>
        </div>
      </>
    )
  }

  if (showResults) {
    const correctAnswers = answers.filter(a => a.is_correct).length
    const incorrectAnswers = answers.length - correctAnswers

    return (
      <>
        <Navigation />
        <QuizResults
          score={score}
          totalQuestions={questions.length}
          correctAnswers={correctAnswers}
          incorrectAnswers={incorrectAnswers}
          onRetake={handleRetake}
        />
      </>
    )
  }

  const currentQuestion = questions[currentQuestionIndex]

  return (
    <>
      <Navigation />
      <div className="quiz-page-container">
        <QuizCard
          question={currentQuestion}
          questionNumber={currentQuestionIndex + 1}
          totalQuestions={questions.length}
          onAnswer={(isCorrect, selectedId) => handleAnswer(isCorrect, selectedId)}
          onNext={handleNext}
        />
      </div>
    </>
  )
}
