'use client'

import { useEffect, useLayoutEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import './goals.css'

interface Goal {
  id: string
  summary: string
  current_summary: string | null
  total_days: number
  daily_minutes_budget: number
  domain: string | null
  created_at: string
}

interface GoalsByType {
  courses: Goal[]
  assignments: Goal[]
  exams: Goal[]
}

export default function GoalsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [goalsByType, setGoalsByType] = useState<GoalsByType>({
    courses: [],
    assignments: [],
    exams: []
  })
  const [activeGoalId, setActiveGoalId] = useState<string | null>(null)
  const supabase = createClient()

  // Force scroll to top BEFORE paint
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [])

  useEffect(() => {
    loadGoals()
  }, [])

  const loadGoals = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/login')
        return
      }

      // Get all goals
      const { data: goalsData } = await supabase
        .from('user_goals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      // Categorize goals by type based on summary prefix
      const categorized: GoalsByType = {
        courses: [],
        assignments: [],
        exams: []
      }

      goalsData?.forEach(goal => {
        const summary = (goal.current_summary || goal.summary).toLowerCase()
        if (summary.startsWith('semester:')) {
          categorized.courses.push(goal)
        } else if (summary.startsWith('assignment:')) {
          categorized.assignments.push(goal)
        } else if (summary.startsWith('exam:') || summary.startsWith('midterm:')) {
          categorized.exams.push(goal)
        } else {
          // Default to courses if no prefix
          categorized.courses.push(goal)
        }
      })

      setGoalsByType(categorized)

      // Get active goal
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('active_goal_id')
        .eq('user_id', user.id)
        .single()

      setActiveGoalId(prefs?.active_goal_id || null)
      setLoading(false)
    } catch (error) {
      console.error('Goals load error:', error)
      setLoading(false)
    }
  }

  const workOnGoal = async (goalId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: user.id,
            active_goal_id: goalId,
          },
          { onConflict: 'user_id' }
        )

      // Redirect to dashboard
      router.push('/dashboard')
    } catch (error) {
      console.error('Set active goal error:', error)
    }
  }

  const cleanGoalTitle = (summary: string) => {
    // Remove the prefix (Semester:, Assignment:, Exam:, Midterm:)
    return summary.replace(/^(Semester|Assignment|Exam|Midterm):\s*/i, '')
  }

  const renderGoalCard = (goal: Goal, index: number) => {
    const isActive = goal.id === activeGoalId
    const createdAt = new Date(goal.created_at)
    const formattedDate = createdAt.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

    return (
      <div
        key={goal.id}
        className={`goal-card ${isActive ? 'active' : ''}`}
        onClick={() => workOnGoal(goal.id)}
        style={{ animationDelay: `${index * 0.1}s` }}
      >
        <div className="goal-header-content">
          {isActive && (
            <span className="badge badge-active">
              <span className="dot"></span>
              Active
            </span>
          )}
          <h3 className="goal-title">{cleanGoalTitle(goal.current_summary || goal.summary)}</h3>
        </div>

        <div className="goal-stats">
          <div className="stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span><span className="stat-value">{goal.total_days}</span> days</span>
          </div>
          <div className="stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            <span><span className="stat-value">{goal.daily_minutes_budget}m</span> daily</span>
          </div>
        </div>

        <div className="goal-footer">
          <span className="goal-date">Created {formattedDate}</span>
          <button className="btn-work" onClick={(e) => { e.stopPropagation(); workOnGoal(goal.id); }}>
            Work on Goal →
          </button>
        </div>
      </div>
    )
  }

  const renderSection = (title: string, goals: Goal[], emptyMessage: string, addRoute: string) => {
    return (
      <div className="goals-section">
        <div className="section-header">
          <div className="section-title-row">
            <h2 className="section-title">{title}</h2>
            <span className="section-count">{goals.length}</span>
          </div>
          <button className="btn-add-small" onClick={() => router.push(addRoute)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add
          </button>
        </div>

        {goals.length === 0 ? (
          <div className="empty-section">
            <div className="empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <p className="empty-text">{emptyMessage}</p>
          </div>
        ) : (
          <div className="goals-grid">
            {goals.map((goal, index) => renderGoalCard(goal, index))}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-primary-purple border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  const totalGoals = goalsByType.courses.length + goalsByType.assignments.length + goalsByType.exams.length

  return (
    <>
      <div className="noise-bg"></div>

      <nav>
        <div className="nav-container">
          <Link href="/" className="logo">ORAH</Link>
          <div className="nav-actions">
            <Link href="/dashboard" className="btn-back">Back</Link>
          </div>
        </div>
      </nav>

      <div className="container">
        <div className="page-header">
          <div className="header-top">
            <div>
              <h1 className="page-title">Your Goals</h1>
              <p className="goals-count"><strong>{totalGoals}</strong> goals created</p>
            </div>
            <button className="btn-add-goal" onClick={() => router.push('/academic-hub')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add New Goal
            </button>
          </div>
        </div>

        {totalGoals === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <h2 className="empty-title">No Goals Yet</h2>
            <p className="empty-text">Start by adding a new goal to see your progress here.</p>
            <button className="btn-add-goal" onClick={() => router.push('/academic-hub')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Create Your First Goal
            </button>
          </div>
        ) : (
          <>
            {renderSection(
              'Courses',
              goalsByType.courses,
              'No courses yet. Add a semester to get started!',
              '/semester-tracking'
            )}

            {renderSection(
              'Assignments',
              goalsByType.assignments,
              'No assignments yet. Add one to stay on track!',
              '/assignment-helper'
            )}

            {renderSection(
              'Exams & Midterms',
              goalsByType.exams,
              'No exams yet. Add one to prepare effectively!',
              '/exam-prep'
            )}
          </>
        )}
      </div>
    </>
  )
}
