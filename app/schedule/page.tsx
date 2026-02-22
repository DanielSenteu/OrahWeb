'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/layout/Navigation'
import './schedule.css'

interface Task {
  id: string
  title: string
  notes: string | null
  estimated_minutes: number
  scheduled_date_key: string
  is_completed: boolean
  day_number: number
  goal_id: string
}

interface Goal {
  id: string
  summary: string
  current_summary: string | null
}

function goalColorClass(summary: string): string {
  const s = (summary || '').toLowerCase()
  if (s.startsWith('exam') || s.includes('exam prep')) return 'task-exam'
  if (s.startsWith('assignment') || s.startsWith('semester')) return 'task-assignment'
  return 'task-general'
}

function goalLabel(summary: string): string {
  const s = summary || ''
  if (s.toLowerCase().startsWith('exam')) return 'Exam'
  if (s.toLowerCase().startsWith('assignment')) return 'Assignment'
  if (s.toLowerCase().startsWith('semester')) return 'Semester'
  return 'Goal'
}

export default function SchedulePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [goal, setGoal] = useState<Goal | null>(null)
  const [goalsMap, setGoalsMap] = useState<Record<string, Goal>>({})
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [currentView, setCurrentView] = useState<'day' | 'week' | 'month'>('week')
  const [weekData, setWeekData] = useState<{ weekDates: Date[], tasksByDate: { [key: string]: Task[] } }>({ weekDates: [], tasksByDate: {} })
  const [monthData, setMonthData] = useState<{ calendarDays: Array<{ date: Date, isCurrentMonth: boolean }>, tasksByDate: { [key: string]: Task[] } }>({ calendarDays: [], tasksByDate: {} })

  // Drag state
  const dragTaskRef = useRef<{ task: Task; sourceDateKey: string } | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  useEffect(() => {
    if (currentView === 'month') loadMonthSchedule()
    else if (currentView === 'week') loadWeekSchedule()
    else loadSchedule()
  }, [selectedDate, currentView])

  useEffect(() => {
    const interval = setInterval(updateCurrentTimeLine, 60000)
    updateCurrentTimeLine()
    return () => clearInterval(interval)
  }, [])

  const formatDateKey = (date: Date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // ── Loaders ──────────────────────────────────────────────────
  const loadSchedule = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: allGoals } = await supabase
        .from('user_goals').select('id, summary, current_summary').eq('user_id', user.id)

      const gMap: Record<string, Goal> = {}
      allGoals?.forEach(g => { gMap[g.id] = g })
      setGoalsMap(gMap)
      if (allGoals && allGoals.length > 0) setGoal(allGoals[0])

      const dateKey = formatDateKey(selectedDate)
      const { data: tasksData } = await supabase
        .from('task_items').select('*').eq('user_id', user.id)
        .eq('scheduled_date_key', dateKey).order('day_number', { ascending: true })

      setTasks(tasksData || [])
      setLoading(false)
    } catch {
      setLoading(false)
    }
  }

  const loadWeekSchedule = async () => {
    setLoading(true)
    const d = await loadWeekTasks()
    if (d) setWeekData(d)
    setLoading(false)
  }

  const loadMonthSchedule = async () => {
    setLoading(true)
    const d = await loadMonthTasks()
    if (d) setMonthData(d)
    setLoading(false)
  }

  const getWeekDates = (date: Date) => {
    const cur = new Date(date)
    const day = cur.getDay()
    const diff = cur.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(cur.setDate(diff))
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i); return d
    })
  }

  const loadWeekTasks = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const weekDates = getWeekDates(selectedDate)
      const dateKeys = weekDates.map(d => formatDateKey(d))

      const { data: tasksData } = await supabase
        .from('task_items').select('*').eq('user_id', user.id)
        .in('scheduled_date_key', dateKeys).order('day_number', { ascending: true })

      const tasksByDate: { [key: string]: Task[] } = {}
      tasksData?.forEach(task => {
        if (!tasksByDate[task.scheduled_date_key]) tasksByDate[task.scheduled_date_key] = []
        tasksByDate[task.scheduled_date_key].push(task)
      })
      return { weekDates, tasksByDate }
    } catch {
      return { weekDates: getWeekDates(selectedDate), tasksByDate: {} }
    }
  }

  const getMonthCalendarDays = (date: Date) => {
    const year = date.getFullYear(), month = date.getMonth()
    const firstDayOfWeek = new Date(year, month, 1).getDay()
    const lastDate = new Date(year, month + 1, 0).getDate()
    const calendarDays: Array<{ date: Date, isCurrentMonth: boolean }> = []

    if (firstDayOfWeek > 0) {
      const prevLast = new Date(year, month, 0).getDate()
      for (let i = firstDayOfWeek - 1; i >= 0; i--)
        calendarDays.push({ date: new Date(year, month - 1, prevLast - i), isCurrentMonth: false })
    }
    for (let i = 1; i <= lastDate; i++)
      calendarDays.push({ date: new Date(year, month, i), isCurrentMonth: true })

    const remaining = 7 - (calendarDays.length % 7)
    if (remaining < 7)
      for (let i = 1; i <= remaining; i++)
        calendarDays.push({ date: new Date(year, month + 1, i), isCurrentMonth: false })
    return calendarDays
  }

  const loadMonthTasks = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const calendarDays = getMonthCalendarDays(selectedDate)
      const dateKeys = calendarDays.map(d => formatDateKey(d.date))

      const { data: tasksData } = await supabase
        .from('task_items').select('*').eq('user_id', user.id)
        .in('scheduled_date_key', dateKeys).order('day_number', { ascending: true })

      const tasksByDate: { [key: string]: Task[] } = {}
      tasksData?.forEach(task => {
        if (!tasksByDate[task.scheduled_date_key]) tasksByDate[task.scheduled_date_key] = []
        tasksByDate[task.scheduled_date_key].push(task)
      })
      return { calendarDays, tasksByDate }
    } catch {
      return { calendarDays: getMonthCalendarDays(selectedDate), tasksByDate: {} }
    }
  }

  // ── Drag & Drop ──────────────────────────────────────────────
  const handleDragStart = (task: Task, sourceDateKey: string) => {
    dragTaskRef.current = { task, sourceDateKey }
  }

  const handleDragOver = (e: React.DragEvent, dateKey: string) => {
    e.preventDefault()
    setDragOverDate(dateKey)
  }

  const handleDragLeave = () => setDragOverDate(null)

  const handleDrop = async (e: React.DragEvent, targetDateKey: string) => {
    e.preventDefault()
    setDragOverDate(null)
    const drag = dragTaskRef.current
    if (!drag || drag.sourceDateKey === targetDateKey) return
    dragTaskRef.current = null

    // Optimistic update
    setWeekData(prev => {
      const updated = { ...prev, tasksByDate: { ...prev.tasksByDate } }
      updated.tasksByDate[drag.sourceDateKey] = (updated.tasksByDate[drag.sourceDateKey] || []).filter(t => t.id !== drag.task.id)
      const movedTask = { ...drag.task, scheduled_date_key: targetDateKey }
      updated.tasksByDate[targetDateKey] = [...(updated.tasksByDate[targetDateKey] || []), movedTask]
      return updated
    })

    try {
      const supabase = createClient()
      await supabase.from('task_items').update({ scheduled_date_key: targetDateKey }).eq('id', drag.task.id)
    } catch {
      loadWeekSchedule()
    }
  }

  const handleDayDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault()
    setDragOverDate(null)
    const drag = dragTaskRef.current
    if (!drag) return
    dragTaskRef.current = null

    const reordered = tasks.filter(t => t.id !== drag.task.id)
    reordered.splice(targetIndex, 0, drag.task)
    setTasks(reordered)

    try {
      const supabase = createClient()
      await Promise.all(reordered.map((t, i) =>
        supabase.from('task_items').update({ day_number: i + 1 }).eq('id', t.id)
      ))
    } catch {
      loadSchedule()
    }
  }

  // ── Misc ──────────────────────────────────────────────────────
  const navigateDate = (direction: 'prev' | 'next') => {
    const d = new Date(selectedDate)
    if (currentView === 'month') d.setMonth(d.getMonth() + (direction === 'next' ? 1 : -1))
    else if (currentView === 'week') d.setDate(d.getDate() + (direction === 'next' ? 7 : -7))
    else d.setDate(d.getDate() + (direction === 'next' ? 1 : -1))
    setSelectedDate(d)
  }

  const formatDisplayDate = (date: Date) => {
    const today = new Date()
    const isToday = date.toDateString() === today.toDateString()
    return {
      title: date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      label: isToday ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' })
    }
  }

  const updateCurrentTimeLine = () => {
    const now = new Date()
    const h = now.getHours(), m = now.getMinutes()
    const line = document.querySelector('.current-time-line') as HTMLElement
    if (!line) return
    if (h >= 7 && h <= 18) {
      line.style.top = ((h - 7) * 80 + (m / 60) * 80) + 'px'
      line.style.display = 'block'
    } else {
      line.style.display = 'none'
    }
  }

  const getTaskPosition = (index: number, total: number) => {
    const taskHeight = 160, spacing = 20
    const available = 11 * 80
    const totalH = total * taskHeight + (total - 1) * spacing
    const startOffset = Math.max(0, (available - totalH) / 2)
    return { top: startOffset + index * (taskHeight + spacing), height: taskHeight }
  }

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60), m = minutes % 60
    if (h > 0 && m > 0) return `${h}h ${m}m`
    if (h > 0) return `${h}h`
    return `${m}m`
  }

  if (loading) {
    return (
      <>
        <div className="noise-bg" />
        <Navigation />
        <div className="loading-container">
          <div className="loading-spinner" />
          <p className="loading-text">Loading schedule...</p>
        </div>
      </>
    )
  }

  const dateDisplay = formatDisplayDate(selectedDate)
  const isToday = new Date().toDateString() === selectedDate.toDateString()
  const getWeekDateRange = () => {
    const w = getWeekDates(selectedDate)
    return `${w[0].toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${w[6].toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
  }

  return (
    <>
      <div className="noise-bg" />
      <Navigation />

      <div className="container">
        {/* View Tabs */}
        <div className="view-tabs">
          {(['day', 'week', 'month'] as const).map(v => (
            <button key={v} className={`view-tab ${currentView === v ? 'active' : ''}`} onClick={() => setCurrentView(v)}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {/* Date Header */}
        <div className="date-header">
          <button className="date-nav-btn" onClick={() => navigateDate('prev')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div className="date-display">
            <h1 className="date-title">
              {currentView === 'month' ? selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                : currentView === 'week' ? getWeekDateRange()
                : dateDisplay.title}
            </h1>
            {currentView === 'day' && (
              <span className={`date-label ${isToday ? 'today' : ''}`}>{dateDisplay.label}</span>
            )}
          </div>
          <button className="date-nav-btn" onClick={() => navigateDate('next')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>

        {currentView === 'week' && (
          <p className="drag-hint">Drag tasks between days to reschedule them</p>
        )}

        {/* Schedule */}
        <div className="schedule-container">

          {/* Month */}
          {currentView === 'month' && (
            <div className="month-container">
              <div className="weekday-header">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="weekday">{d}</div>)}
              </div>
              <div className="calendar-grid">
                {monthData.calendarDays.map((day, index) => {
                  const dateKey = formatDateKey(day.date)
                  const dayTasks = monthData.tasksByDate[dateKey] || []
                  const isDayToday = new Date().toDateString() === day.date.toDateString()
                  return (
                    <div
                      key={`${dateKey}-${index}`}
                      className={`day-cell ${!day.isCurrentMonth ? 'other-month' : ''} ${isDayToday ? 'today' : ''} ${dayTasks.length > 0 ? 'has-tasks' : ''}`}
                      onClick={() => { if (day.isCurrentMonth) { setSelectedDate(day.date); setCurrentView('day') } }}
                    >
                      <div className="day-number">{day.date.getDate()}</div>
                      {dayTasks.length > 0 && (
                        <div className="task-indicators">
                          {dayTasks.slice(0, 3).map(task => (
                            <div key={task.id} className="task-dot"
                              onClick={e => { e.stopPropagation(); router.push(`/tasks/${task.id}`) }}>
                              <span className="task-dot-indicator" />{task.title}
                            </div>
                          ))}
                          {dayTasks.length > 3 && <div className="more-tasks">+{dayTasks.length - 3} more</div>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Week (drag & drop) */}
          {currentView === 'week' && (
            <div className="week-grid">
              {weekData.weekDates.map(date => {
                const dateKey = formatDateKey(date)
                const dayTasks = weekData.tasksByDate[dateKey] || []
                const isDayToday = new Date().toDateString() === date.toDateString()
                const isDragTarget = dragOverDate === dateKey
                return (
                  <div
                    key={dateKey}
                    className={`day-column ${isDayToday ? 'today' : ''} ${isDragTarget ? 'drag-over' : ''}`}
                    onDragOver={e => handleDragOver(e, dateKey)}
                    onDragLeave={handleDragLeave}
                    onDrop={e => handleDrop(e, dateKey)}
                  >
                    <div className="day-header">
                      <div className="day-name">{date.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                      <div className="day-number">{date.getDate()}</div>
                      {dayTasks.length > 0 && (
                        <div className="task-count">{dayTasks.length} task{dayTasks.length !== 1 ? 's' : ''}</div>
                      )}
                    </div>
                    <div className="day-tasks">
                      {dayTasks.length === 0 ? (
                        <div className="empty-day">
                          <div className="empty-day-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <rect x="3" y="4" width="18" height="18" rx="2" />
                              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                          </div>
                          <div className="empty-day-text">Drop tasks here</div>
                        </div>
                      ) : (
                        dayTasks.map(task => (
                          <div
                            key={task.id}
                            className="week-task-card"
                            draggable
                            onDragStart={() => handleDragStart(task, dateKey)}
                            onClick={() => router.push(`/tasks/${task.id}`)}
                          >
                            <div className="drag-handle">
                              <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12">
                                <circle cx="7" cy="5" r="1.5" /><circle cx="13" cy="5" r="1.5" />
                                <circle cx="7" cy="10" r="1.5" /><circle cx="13" cy="10" r="1.5" />
                                <circle cx="7" cy="15" r="1.5" /><circle cx="13" cy="15" r="1.5" />
                              </svg>
                            </div>
                            <div className="task-card-time">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                              </svg>
                              {formatTime(task.estimated_minutes)}
                            </div>
                            <div className="task-card-title">{task.title}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Day */}
          {currentView === 'day' && tasks.length === 0 && (
            <div className="empty-day">
              <div className="empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <h2 className="empty-title">No Tasks Scheduled</h2>
              <p className="empty-text">No tasks are scheduled for this day</p>
            </div>
          )}

          {currentView === 'day' && tasks.length > 0 && (
            <div className="schedule-grid">
              <div className="time-column">
                {['7 AM','8 AM','9 AM','10 AM','11 AM','12 PM','1 PM','2 PM','3 PM','4 PM','5 PM','6 PM'].map(t => (
                  <div key={t} className="time-slot">{t}</div>
                ))}
              </div>
              <div className="events-column">
                {[...Array(12)].map((_, i) => (
                  <div
                    key={i}
                    className={`hour-row ${dragOverDate === `row-${i}` ? 'drag-over-row' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragOverDate(`row-${i}`) }}
                    onDragLeave={handleDragLeave}
                    onDrop={e => handleDayDrop(e, i)}
                  />
                ))}
                {tasks.map((task, index) => {
                  const pos = getTaskPosition(index, tasks.length)
                  return (
                    <div
                      key={task.id}
                      className="task-event"
                      style={{ top: `${pos.top}px`, height: `${pos.height}px` }}
                      draggable
                      onDragStart={() => handleDragStart(task, formatDateKey(selectedDate))}
                      onClick={() => router.push(`/tasks/${task.id}`)}
                    >
                      <div className="task-event-drag-handle">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12">
                          <circle cx="7" cy="5" r="1.5" /><circle cx="13" cy="5" r="1.5" />
                          <circle cx="7" cy="10" r="1.5" /><circle cx="13" cy="10" r="1.5" />
                          <circle cx="7" cy="15" r="1.5" /><circle cx="13" cy="15" r="1.5" />
                        </svg>
                      </div>
                      <div className="task-event-time">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                        {formatTime(task.estimated_minutes)}
                      </div>
                      <div className="task-event-title">{task.title}</div>
                    </div>
                  )
                })}
                {isToday && <div className="current-time-line" />}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
