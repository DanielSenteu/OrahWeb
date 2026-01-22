'use client'

import { useEffect, useLayoutEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import './dashboard.css'

interface Task {
  id: string
  title: string
  notes: string | null
  estimated_minutes: number
  scheduled_date_key: string
  is_completed: boolean
  day_number: number
}

interface Goal {
  id: string
  summary: string
  current_summary: string | null
  total_days: number
  daily_minutes_budget: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [goal, setGoal] = useState<Goal | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [currentDateKey, setCurrentDateKey] = useState('')

  // Force scroll to top BEFORE paint to prevent stuck scroll
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [])

  useEffect(() => {
    loadDashboard()
  }, [selectedDate])

  // Format date as YYYY-MM-DD WITHOUT timezone conversion
  // This ensures dates match exactly what's stored in the database
  const formatDateKey = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const loadDashboard = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/login')
        return
      }

      // Get active goal
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('active_goal_id')
        .eq('user_id', user.id)
        .single()

      if (!prefs?.active_goal_id) {
        // No active goal, redirect to goals page
        router.push('/goals')
        return
      }

      // Get goal details
      const { data: goalData } = await supabase
        .from('user_goals')
        .select('*')
        .eq('id', prefs.active_goal_id)
        .single()

      setGoal(goalData)

      // Get tasks for selected date
      const dateKey = formatDateKey(selectedDate)
      setCurrentDateKey(dateKey)

      const { data: tasksData } = await supabase
        .from('task_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('goal_id', prefs.active_goal_id)
        .eq('scheduled_date_key', dateKey)
        .order('day_number', { ascending: true })

      setTasks(tasksData || [])
      setLoading(false)
    } catch (error) {
      console.error('Dashboard load error:', error)
      setLoading(false)
    }
  }

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1))
    setSelectedDate(newDate)
  }

  const formatDisplayDate = (date: Date) => {
    const today = new Date()
    const isToday = date.toDateString() === today.toDateString()
    
    if (isToday) {
      return {
        label: 'Today',
        value: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      }
    }
    
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const isTomorrow = date.toDateString() === tomorrow.toDateString()
    
    if (isTomorrow) {
      return {
        label: 'Tomorrow',
        value: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      }
    }
    
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = date.toDateString() === yesterday.toDateString()
    
    if (isYesterday) {
      return {
        label: 'Yesterday',
        value: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      }
    }
    
    return {
      label: date.toLocaleDateString('en-US', { weekday: 'long' }),
      value: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
  }

  const calculateProgress = () => {
    if (tasks.length === 0) return 0
    const completed = tasks.filter(t => t.is_completed).length
    return Math.round((completed / tasks.length) * 100)
  }

  const getTaskStats = () => {
    const completed = tasks.filter(t => t.is_completed).length
    return `${completed}/${tasks.length}`
  }

  if (loading) {
    return (
      <>
        <div className="noise-bg"></div>
        <nav>
          <div className="nav-container">
            <Link href="/" className="logo">ORAH</Link>
          </div>
        </nav>
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading dashboard...</p>
        </div>
      </>
    )
  }

  if (!goal) {
    return (
      <>
        <div className="noise-bg"></div>
        <nav>
          <div className="nav-container">
            <Link href="/" className="logo">ORAH</Link>
          </div>
        </nav>
        <div className="container">
          <div className="empty-state">
            <div className="empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h2 className="empty-title">No Active Goal</h2>
            <p className="empty-text">Create or activate a goal to see your daily tasks</p>
            <Link href="/goals" className="btn-add-goal">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Go to Goals
            </Link>
          </div>
        </div>
      </>
    )
  }

  const dateDisplay = formatDisplayDate(selectedDate)
  const progress = calculateProgress()
  const taskStats = getTaskStats()

  return (
    <>
      {/* Background */}
      <div className="noise-bg"></div>

      {/* Navigation */}
      <nav>
        <div className="nav-container">
          <Link href="/" className="logo">ORAH</Link>
          <div className="nav-tabs">
            <Link href="/lecture-notes" className="nav-tab">Notes</Link>
            <Link href="/goals" className="nav-tab">Goals</Link>
            <Link href="/schedule" className="nav-tab">Schedule</Link>
            <Link href="/assistant" className="nav-tab">Orah</Link>
            <Link href="/dashboard" className="nav-tab active">Dashboard</Link>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <div className="container">
        {/* Active Goal Header */}
        <div className="active-goal-header">
          <div className="goal-header-top">
            <div className="goal-icon-large">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
            </div>
            <div className="goal-header-info">
              <h1 className="goal-title-large">{goal.current_summary || goal.summary}</h1>
              <div className="goal-meta">
                <div className="meta-item">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M9 11l3 3L22 4"/>
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                  </svg>
                  <span><span className="meta-value">{taskStats}</span> tasks</span>
                </div>
                <div className="meta-item">
                  <svg viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <span><span className="meta-value">{goal.daily_minutes_budget}m</span> daily</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Date Navigation */}
        <div className="date-nav">
          <button className="date-nav-btn" onClick={() => navigateDate('prev')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Previous
          </button>

          <div className="current-date">
            <div className="date-label">{dateDisplay.label}</div>
            <div className="date-value">{dateDisplay.value}</div>
          </div>

          <button className="date-nav-btn" onClick={() => navigateDate('next')}>
            Next
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>

        {/* Tasks List */}
        {tasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <h2 className="empty-title">No Tasks Scheduled</h2>
            <p className="empty-text">
              No tasks are scheduled for this day
            </p>
          </div>
        ) : (
          <div className="tasks-list">
            {tasks.map((task, index) => (
              <div 
                key={task.id} 
                className="task-card"
                style={{
                  animation: `fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${0.2 + index * 0.1}s forwards`
                }}
              >
                <div className="task-header">
                  <div className="task-icon">
                    <svg viewBox="0 0 24 24" fill="none">
                      <polyline points="16 18 22 12 16 6"/>
                      <polyline points="8 6 2 12 8 18"/>
                    </svg>
                  </div>
                  <div className="task-info">
                    <h2 className="task-title">{task.title}</h2>
                    {task.notes && (
                      <p className="task-description">{task.notes}</p>
                    )}
                  </div>
                </div>

                <div className="task-meta-row">
                  <div className="task-meta-item">
                    <svg viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span><span className="task-meta-value">{task.estimated_minutes} min</span></span>
                  </div>
                  <div className="task-meta-item">
                    <span className="day-badge">📅 Day {task.day_number}</span>
                  </div>
                </div>

                <div className="task-footer">
                  <button 
                    className="btn-work-task"
                    onClick={() => router.push(`/tasks/${task.id}`)}
                  >
                    Work on Task
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                      <polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="progress-section">
        <div className="progress-container">
          <div className="progress-label-section">
            <div className="progress-label">Today&apos;s Progress</div>
            <div className="progress-value">{progress}%</div>
          </div>
          <div className="progress-bar-wrapper">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ 
                  width: `${progress}%`,
                  transition: 'width 1s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
