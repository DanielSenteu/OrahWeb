'use client'

import { useState } from 'react'
import './quiz-card.css'

interface QuizQuestion {
  id: string
  question_text: string
  options: Array<{ id: string; text: string }>
  correct_answer_id: string
  explanation: string
  incorrect_explanation?: string
}

interface QuizCardProps {
  question: QuizQuestion
  questionNumber: number
  totalQuestions: number
  onAnswer: (isCorrect: boolean, selectedAnswerId?: string) => void
  onNext: () => void
}

export default function QuizCard({
  question,
  questionNumber,
  totalQuestions,
  onAnswer,
  onNext,
}: QuizCardProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [isFlipped, setIsFlipped] = useState(false)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)

  const handleSelectAnswer = (answerId: string) => {
    if (selectedAnswer) return // Already answered
    
    setSelectedAnswer(answerId)
    const correct = answerId === question.correct_answer_id
    setIsCorrect(correct)
    setIsFlipped(true)
    // Pass the selected answer ID to parent
    onAnswer(correct, answerId)
  }

  const handleNext = () => {
    setSelectedAnswer(null)
    setIsFlipped(false)
    setIsCorrect(null)
    onNext()
  }

  return (
    <div className="quiz-container">
      <div className="quiz-progress">
        Question {questionNumber} of {totalQuestions}
      </div>

      <div className={`quiz-card ${isFlipped ? 'flipped' : ''}`}>
        {/* Front of card - Question */}
        <div className="quiz-card-front">
          <div className="quiz-question">
            <h2 className="quiz-question-text">{question.question_text}</h2>
          </div>
          
          <div className="quiz-options">
            {question.options.map((option) => (
              <button
                key={option.id}
                className={`quiz-option ${selectedAnswer === option.id ? 'selected' : ''}`}
                onClick={() => handleSelectAnswer(option.id)}
                disabled={!!selectedAnswer}
              >
                <span className="option-label">{option.id}</span>
                <span className="option-text">{option.text}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Back of card - Answer & Explanation */}
        <div className="quiz-card-back">
          <div className={`quiz-result ${isCorrect ? 'correct' : 'incorrect'}`}>
            <div className="result-icon">
              {isCorrect ? '✓' : '✗'}
            </div>
            <div className="result-message">
              {isCorrect ? (
                <>
                  <h3>Great job! That's correct!</h3>
                  <p className="result-explanation">{question.explanation}</p>
                </>
              ) : (
                <>
                  <h3>Not quite right</h3>
                  <p className="result-explanation">
                    {question.incorrect_explanation || question.explanation}
                  </p>
                  <p className="correct-answer-hint">
                    The correct answer is: <strong>{question.options.find(o => o.id === question.correct_answer_id)?.text}</strong>
                  </p>
                </>
              )}
            </div>
          </div>

          <button className="quiz-next-btn" onClick={handleNext}>
            {questionNumber < totalQuestions ? 'Next Question' : 'View Results'}
          </button>
        </div>
      </div>
    </div>
  )
}
