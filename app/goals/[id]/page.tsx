'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/layout/Navigation'
import './plan.css'

interface Goal {
  id: string
  summary: string
  current_summary: string | null
  total_days: number
  daily_minutes_budget: number
  domain: string | null
  created_at: string
}

interface Task {
  id: string
  title: string
  notes: string | null
  estimated_minutes: number
  day_number: number
  scheduled_date_key: string | null
  is_completed: boolean
  deliverable: string | null
}

interface DayGroup {
  dayNumber: number
  dateKey: string | null
  tasks: Task[]
}

export default function PlanPage() {
  const router = useRouter()
  const params = useParams()
  const goalId = params.id as string
  const supabase = createClient()

  const [goal, setGoal] = useState<Goal | null>(null)
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPlan()
  }, [goalId])

  const loadPlan = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: goalData } = await supabase
        .from('user_goals')
        .select('*')
        .eq('id', goalId)
        .eq('user_id', user.id)
        .single()

      if (!goalData) { router.push('/goals'); return }
      setGoal(goalData)

      const { data: tasksData } = await supabase
        .from('task_items')
        .select('*')
        .eq('goal_id', goalId)
        .order('day_number', { ascending: true })

      const tasks: Task[] = tasksData || []

      // Group tasks by day_number
      const groupMap = new Map<number, DayGroup>()
      for (const task of tasks) {
        const day = task.day_number || 1
        if (!groupMap.has(day)) {
          groupMap.set(day, { dayNumber: day, dateKey: task.scheduled_date_key, tasks: [] })
        }
        groupMap.get(day)!.tasks.push(task)
      }

      setDayGroups(Array.from(groupMap.values()).sort((a, b) => a.dayNumber - b.dayNumber))
      setLoading(false)
    } catch (error) {
      console.error('Plan load error:', error)
      setLoading(false)
    }
  }

  const cleanTitle = (summary: string) =>
    summary.replace(/^(Semester|Assignment|Exam|Midterm):\s*/i, '')

  const formatDate = (dateKey: string | null) => {
    if (!dateKey) return null
    const d = new Date(dateKey + 'T00:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const completedCount = dayGroups.flatMap(g => g.tasks).filter(t => t.is_completed).length
  const totalCount = dayGroups.flatMap(g => g.tasks).length

  if (loading) {
    return (
      <>
        <Navigation />
        <div className="plan-loading">
          <div className="spinner" style={{ width: '36px', height: '36px' }} />
          <p>Loading plan…</p>
        </div>
      </>
    )
  }

  if (!goal) return null

  return (
    <>
      <Navigation />
      <div className="plan-container">
        {/* Header */}
        <div className="plan-header">
          <button className="plan-back-btn" onClick={() => router.back()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
          <div className="plan-header-body">
            <h1 className="plan-title">{cleanTitle(goal.current_summary || goal.summary)}</h1>
            <div className="plan-meta">
              <span>{goal.total_days} days</span>
              <span className="plan-meta-dot" />
              <span>{goal.daily_minutes_budget} min/day</span>
              {totalCount > 0 && (
                <>
                  <span className="plan-meta-dot" />
                  <span>{completedCount}/{totalCount} tasks done</span>
                </>
              )}
            </div>
          </div>
          {totalCount > 0 && (
            <div className="plan-progress-bar">
              <div
                className="plan-progress-fill"
                style={{ width: `${Math.round((completedCount / totalCount) * 100)}%` }}
              />
            </div>
          )}
        </div>

        {/* Days */}
        {dayGroups.length === 0 ? (
          <div className="plan-empty">
            <p>No tasks found for this plan.</p>
          </div>
        ) : (
          <div className="plan-days">
            {dayGroups.map(group => {
              const allDone = group.tasks.every(t => t.is_completed)
              const dateStr = formatDate(group.dateKey)
              return (
                <div key={group.dayNumber} className={`plan-day ${allDone ? 'plan-day--done' : ''}`}>
                  <div className="plan-day-header">
                    <div className="plan-day-label">
                      <span className="plan-day-num">Day {group.dayNumber}</span>
                      {dateStr && <span className="plan-day-date">{dateStr}</span>}
                    </div>
                    {allDone && <span className="plan-day-badge">Done</span>}
                  </div>
                  <div className="plan-tasks">
                    {group.tasks.map(task => (
                      <Link
                        key={task.id}
                        href={`/tasks/${task.id}`}
                        className={`plan-task-card ${task.is_completed ? 'plan-task-card--done' : ''}`}
                      >
                        <div className="plan-task-check">
                          {task.is_completed ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <div className="plan-task-circle" />
                          )}
                        </div>
                        <div className="plan-task-body">
                          <div className="plan-task-title">{task.title}</div>
                          {task.notes && <div className="plan-task-notes">{task.notes}</div>}
                          {task.deliverable && <div className="plan-task-deliverable">{task.deliverable}</div>}
                        </div>
                        <div className="plan-task-right">
                          {task.estimated_minutes > 0 && (
                            <span className="plan-task-time">{task.estimated_minutes}m</span>
                          )}
                          <svg className="plan-task-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
