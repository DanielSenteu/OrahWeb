'use client'

import './quiz-results.css'

interface QuizResultsProps {
  score: number
  totalQuestions: number
  correctAnswers: number
  incorrectAnswers: number
  onRetake: () => void
}

export default function QuizResults({
  score,
  totalQuestions,
  correctAnswers,
  incorrectAnswers,
  onRetake,
}: QuizResultsProps) {
  const getScoreColor = () => {
    if (score >= 80) return '#22c55e' // Green
    if (score >= 60) return '#f59e0b' // Orange
    return '#ef4444' // Red
  }

  const getScoreMessage = () => {
    if (score >= 90) return "Outstanding! You've mastered this topic!"
    if (score >= 80) return "Great job! You have a strong understanding."
    if (score >= 70) return "Good work! A bit more practice will help."
    if (score >= 60) return "Not bad! Review the material and try again."
    return "Keep studying! Review your notes and try the quiz again."
  }

  return (
    <div className="quiz-results-container">
      <div className="quiz-results-card">
        <div className="results-header">
          <h2 className="results-title">Quiz Complete!</h2>
        </div>

        <div className="results-score">
          <div 
            className="score-circle"
            style={{ 
              background: `conic-gradient(${getScoreColor()} ${score * 3.6}deg, var(--bg-elevated) 0deg)`
            }}
          >
            <div className="score-inner">
              <div className="score-value">{score}%</div>
              <div className="score-label">Score</div>
            </div>
          </div>
        </div>

        <div className="results-message">
          <p>{getScoreMessage()}</p>
        </div>

        <div className="results-breakdown">
          <div className="breakdown-item correct">
            <div className="breakdown-icon">✓</div>
            <div className="breakdown-info">
              <div className="breakdown-label">Correct</div>
              <div className="breakdown-value">{correctAnswers} / {totalQuestions}</div>
            </div>
          </div>
          <div className="breakdown-item incorrect">
            <div className="breakdown-icon">✗</div>
            <div className="breakdown-info">
              <div className="breakdown-label">Incorrect</div>
              <div className="breakdown-value">{incorrectAnswers} / {totalQuestions}</div>
            </div>
          </div>
        </div>

        <div className="results-actions">
          <button className="btn-retake" onClick={onRetake}>
            Retake Quiz
          </button>
        </div>
      </div>
    </div>
  )
}
