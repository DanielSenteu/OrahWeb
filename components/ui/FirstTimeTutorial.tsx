'use client'

import { useState, useEffect } from 'react'

const TUTORIAL_KEY = 'orah_tutorial_v1_done'

const steps = [
  {
    id: 'welcome',
    title: 'Welcome to Orah',
    body: 'Your AI-powered academic assistant. Let\'s show you around in 60 seconds.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
    cta: 'Let\'s go →',
  },
  {
    id: 'dashboard',
    title: 'Your Dashboard',
    body: 'See today\'s tasks, your active goal progress, and quick access to all features. It\'s your home base.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
    cta: 'Next →',
  },
  {
    id: 'goals',
    title: 'Set Goals, Get Plans',
    body: 'Tell Orah your goal in a quick chat. It builds a personalized day-by-day plan and puts it all on your calendar automatically.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    ),
    cta: 'Next →',
  },
  {
    id: 'schedule',
    title: 'Unified Calendar',
    body: 'Your Schedule shows ALL your plans in one place — exams, assignments, courses. Everything color-coded so you always know what\'s next.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
    cta: 'Next →',
  },
  {
    id: 'courses',
    title: 'Courses & Syllabus',
    body: 'Add your courses, upload your syllabus, and Orah extracts all deadlines, exams, and assignments automatically.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
    cta: 'Next →',
  },
  {
    id: 'ai',
    title: 'Orah AI Assistant',
    body: 'Chat with Orah anytime — ask study questions, get explanations, plan your week, or just think out loud. Powered by Claude.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    cta: 'Next →',
  },
  {
    id: 'nav',
    title: 'Navigate Anywhere',
    body: 'Use the pill nav at the top (desktop) or bottom tabs (mobile). Hit the ≡ menu for Lecture Notes, Exam Prep, and more tools.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="15" y2="18" />
      </svg>
    ),
    cta: 'Get started →',
  },
]

export default function FirstTimeTutorial() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const done = localStorage.getItem(TUTORIAL_KEY)
    if (!done) {
      // Small delay so page loads first
      const t = setTimeout(() => setVisible(true), 1200)
      return () => clearTimeout(t)
    }
  }, [])

  const close = () => {
    setClosing(true)
    setTimeout(() => {
      setVisible(false)
      setClosing(false)
      localStorage.setItem(TUTORIAL_KEY, '1')
    }, 280)
  }

  const next = () => {
    if (step < steps.length - 1) {
      setStep(s => s + 1)
    } else {
      close()
    }
  }

  if (!visible) return null

  const current = steps[step]

  return (
    <div className={`tutorial-overlay ${closing ? 'tutorial-overlay--out' : ''}`}>
      <div className={`tutorial-card ${closing ? 'tutorial-card--out' : ''}`}>
        {/* Progress dots */}
        <div className="tutorial-dots">
          {steps.map((_, i) => (
            <button
              key={i}
              className={`tutorial-dot ${i === step ? 'tutorial-dot--active' : ''} ${i < step ? 'tutorial-dot--done' : ''}`}
              onClick={() => setStep(i)}
              aria-label={`Step ${i + 1}`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="tutorial-icon">{current.icon}</div>

        {/* Content */}
        <div className="tutorial-content">
          <h2 className="tutorial-title">{current.title}</h2>
          <p className="tutorial-body">{current.body}</p>
        </div>

        {/* Actions */}
        <div className="tutorial-actions">
          <button className="tutorial-skip" onClick={close}>
            Skip tour
          </button>
          <button className="tutorial-next" onClick={next}>
            {current.cta}
          </button>
        </div>

        {/* Close button */}
        <button className="tutorial-close" onClick={close} aria-label="Close tutorial">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
