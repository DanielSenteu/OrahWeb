'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navigation from '@/components/layout/Navigation'
import './academic-hub.css'

export default function AcademicHubPage() {
  const router = useRouter()

  const selectGoal = (route: string) => {
    // Add slight delay for animation
    setTimeout(() => {
      router.push(route)
    }, 150)
  }

  return (
    <>
      {/* Background */}
      <div className="noise-bg"></div>

      {/* Navigation */}
      <Navigation />

      {/* Main Container */}
      <div className="container">
        {/* Header */}
        <div className="header">
          <h1 className="welcome-title">
            Welcome to <span className="brand">ORAH</span>
          </h1>
          <p className="welcome-subtitle">Your AI-powered academic success platform</p>
        </div>

        {/* Goals Grid */}
        <div className="goals-grid">
          {/* Semester Tracking */}
          <div 
            className="goal-card blue" 
            onClick={() => selectGoal('/semester-tracking')}
          >
            <div className="goal-header">
              <div className="goal-icon blue">📚</div>
              <div className="goal-content">
                <h2 className="goal-title">Semester Tracking</h2>
                <p className="goal-description">
                  Upload your syllabus and get a complete semester plan with deadlines, study sessions, and daily tasks.
                </p>
              </div>
            </div>
            <button className="goal-cta">
              <span>Get Started</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </div>

          {/* Assignment Helper */}
          <div 
            className="goal-card pink" 
            onClick={() => selectGoal('/assignment-helper')}
          >
            <div className="goal-header">
              <div className="goal-icon pink">📝</div>
              <div className="goal-content">
                <h2 className="goal-title">Assignment Helper</h2>
                <p className="goal-description">
                  Break down any assignment into manageable phases. Get a step-by-step plan from research to final submission.
                </p>
              </div>
            </div>
            <button className="goal-cta">
              <span>Get Started</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </div>

          {/* Exam Prep */}
          <div 
            className="goal-card orange" 
            onClick={() => selectGoal('/exam-prep')}
          >
            <div className="goal-header">
              <div className="goal-icon orange">🎯</div>
              <div className="goal-content">
                <h2 className="goal-title">Exam Prep</h2>
                <p className="goal-description">
                  Create an optimized study schedule with spaced repetition. Be fully prepared for your exams.
                </p>
              </div>
            </div>
            <button className="goal-cta">
              <span>Get Started</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </div>

          {/* Lecture Notes */}
          <div 
            className="goal-card green" 
            onClick={() => selectGoal('/lecture-notes')}
          >
            <div className="goal-header">
              <div className="goal-icon green">🎓</div>
              <div className="goal-content">
                <h2 className="goal-title">Lecture Notes</h2>
                <p className="goal-description">
                  Transform lecture transcripts into structured, organized notes. Perfect for review and studying.
                </p>
              </div>
            </div>
            <button className="goal-cta">
              <span>Get Started</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Dashboard Link */}
        <div className="dashboard-link">
          <Link href="/dashboard" className="btn-dashboard">
            <span>Go to Dashboard</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </Link>
        </div>
      </div>
    </>
  )
}
