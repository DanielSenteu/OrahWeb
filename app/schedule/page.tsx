'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import './schedule.css'

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
}

export default function SchedulePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [goal, setGoal] = useState<Goal | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [currentView, setCurrentView] = useState<'day' | 'week' | 'month'>('day')
  const [weekData, setWeekData] = useState<{ weekDates: Date[], tasksByDate: { [key: string]: Task[] } }>({ weekDates: [], tasksByDate: {} })
  const [monthData, setMonthData] = useState<{ calendarDays: Array<{ date: Date, isCurrentMonth: boolean }>, tasksByDate: { [key: string]: Task[] } }>({ calendarDays: [], tasksByDate: {} })

  useEffect(() => {
    if (currentView === 'month') {
      loadMonthSchedule()
    } else if (currentView === 'week') {
      loadWeekSchedule()
    } else {
      loadSchedule()
    }
  }, [selectedDate, currentView])

  const loadWeekSchedule = async () => {
    setLoading(true)
    const weekTasksData = await loadWeekTasks()
    if (weekTasksData) {
      setWeekData(weekTasksData)
    }
    setLoading(false)
  }

  const loadMonthSchedule = async () => {
    setLoading(true)
    const monthTasksData = await loadMonthTasks()
    if (monthTasksData) {
      setMonthData(monthTasksData)
    }
    setLoading(false)
  }

  useEffect(() => {
    // Update current time line every minute
    const interval = setInterval(() => {
      updateCurrentTimeLine()
    }, 60000)
    
    updateCurrentTimeLine()
    
    return () => clearInterval(interval)
  }, [])

  const formatDateKey = (date: Date) => {
    // Format date as YYYY-MM-DD WITHOUT timezone conversion
    // This ensures dates match exactly what's stored in the database
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const loadSchedule = async () => {
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
      console.error('Schedule load error:', error)
      setLoading(false)
    }
  }

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate)
    if (currentView === 'month') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1))
    } else if (currentView === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7))
    } else {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1))
    }
    setSelectedDate(newDate)
  }

  const getWeekDates = (date: Date) => {
    const weekDates: Date[] = []
    const currentDate = new Date(date)
    
    // Get Monday of the current week
    const day = currentDate.getDay()
    const diff = currentDate.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(currentDate.setDate(diff))
    
    // Generate all 7 days
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(monday)
      dayDate.setDate(monday.getDate() + i)
      weekDates.push(dayDate)
    }
    
    return weekDates
  }

  const loadWeekTasks = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) return

      // Get active goal
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('active_goal_id')
        .eq('user_id', user.id)
        .single()

      if (!prefs?.active_goal_id) return

      // Get all tasks for the week
      const weekDates = getWeekDates(selectedDate)
      const dateKeys = weekDates.map(d => formatDateKey(d))

      const { data: tasksData } = await supabase
        .from('task_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('goal_id', prefs.active_goal_id)
        .in('scheduled_date_key', dateKeys)
        .order('day_number', { ascending: true })

      // Group tasks by date
      const tasksByDate: { [key: string]: Task[] } = {}
      tasksData?.forEach(task => {
        if (!tasksByDate[task.scheduled_date_key]) {
          tasksByDate[task.scheduled_date_key] = []
        }
        tasksByDate[task.scheduled_date_key].push(task)
      })

      return { weekDates, tasksByDate }
    } catch (error) {
      console.error('Week tasks load error:', error)
      return { weekDates: getWeekDates(selectedDate), tasksByDate: {} }
    }
  }

  const getMonthCalendarDays = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    
    // First day of the month
    const firstDay = new Date(year, month, 1)
    const firstDayOfWeek = firstDay.getDay() // 0 = Sunday
    
    // Last day of the month
    const lastDay = new Date(year, month + 1, 0)
    const lastDate = lastDay.getDate()
    
    // Days from previous month
    const calendarDays: Array<{ date: Date, isCurrentMonth: boolean }> = []
    if (firstDayOfWeek > 0) {
      const prevMonth = new Date(year, month, 0)
      const prevMonthLastDate = prevMonth.getDate()
      for (let i = firstDayOfWeek - 1; i >= 0; i--) {
        calendarDays.push({
          date: new Date(year, month - 1, prevMonthLastDate - i),
          isCurrentMonth: false
        })
      }
    }
    
    // Days of current month
    for (let i = 1; i <= lastDate; i++) {
      calendarDays.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      })
    }
    
    // Days from next month to fill the grid
    const totalDays = calendarDays.length
    const remainingDays = 7 - (totalDays % 7)
    if (remainingDays < 7) {
      for (let i = 1; i <= remainingDays; i++) {
        calendarDays.push({
          date: new Date(year, month + 1, i),
          isCurrentMonth: false
        })
      }
    }
    
    return calendarDays
  }

  const loadMonthTasks = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) return

      // Get active goal
      const { data: prefs } = await supabase
        .from('user_preferences')
        .select('active_goal_id')
        .eq('user_id', user.id)
        .single()

      if (!prefs?.active_goal_id) return

      // Get all calendar days for the month
      const calendarDays = getMonthCalendarDays(selectedDate)
      const dateKeys = calendarDays.map(d => formatDateKey(d.date))

      const { data: tasksData } = await supabase
        .from('task_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('goal_id', prefs.active_goal_id)
        .in('scheduled_date_key', dateKeys)
        .order('day_number', { ascending: true })

      // Group tasks by date
      const tasksByDate: { [key: string]: Task[] } = {}
      tasksData?.forEach(task => {
        if (!tasksByDate[task.scheduled_date_key]) {
          tasksByDate[task.scheduled_date_key] = []
        }
        tasksByDate[task.scheduled_date_key].push(task)
      })

      return { calendarDays, tasksByDate }
    } catch (error) {
      console.error('Month tasks load error:', error)
      return { calendarDays: getMonthCalendarDays(selectedDate), tasksByDate: {} }
    }
  }

  const formatDisplayDate = (date: Date) => {
    const today = new Date()
    const isToday = date.toDateString() === today.toDateString()
    
    const dateStr = date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    })
    
    return {
      title: dateStr,
      label: isToday ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short' })
    }
  }

  const updateCurrentTimeLine = () => {
    const now = new Date()
    const hours = now.getHours()
    const minutes = now.getMinutes()
    
    // Calculate position (7 AM = 0, each hour = 80px)
    const startHour = 7
    if (hours >= startHour && hours <= 18) {
      const hoursFromStart = hours - startHour
      const position = (hoursFromStart * 80) + (minutes / 60 * 80)
      
      const timeLine = document.querySelector('.current-time-line') as HTMLElement
      if (timeLine) {
        timeLine.style.top = position + 'px'
        timeLine.style.display = 'block'
      }
    } else {
      const timeLine = document.querySelector('.current-time-line') as HTMLElement
      if (timeLine) {
        timeLine.style.display = 'none'
      }
    }
  }

  const getTaskPosition = (index: number, totalTasks: number) => {
    // Distribute tasks evenly across the day (7 AM to 6 PM = 11 hours)
    const totalHours = 11
    const hourHeight = 80 // pixels per hour
    const availableHeight = totalHours * hourHeight
    const taskHeight = 160 // height for each task card
    const spacing = 20 // spacing between tasks
    
    if (totalTasks === 0) return { top: 0, height: taskHeight }
    
    // Calculate spacing between tasks
    const totalTaskHeight = totalTasks * taskHeight + (totalTasks - 1) * spacing
    const startOffset = Math.max(0, (availableHeight - totalTaskHeight) / 2)
    
    return {
      top: startOffset + (index * (taskHeight + spacing)),
      height: taskHeight
    }
  }

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`
    if (hours > 0) return `${hours}h`
    return `${mins}m`
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
          <p className="loading-text">Loading schedule...</p>
        </div>
      </>
    )
  }

  const dateDisplay = formatDisplayDate(selectedDate)
  const isToday = new Date().toDateString() === selectedDate.toDateString()

  const getWeekDateRange = () => {
    const weekDates = getWeekDates(selectedDate)
    const start = weekDates[0].toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    const end = weekDates[6].toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    return `${start} - ${end}`
  }

  const getMonthDisplay = () => {
    return selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  return (
    <>
      {/* Background */}
      <div className="noise-bg"></div>

      {/* Navigation */}
      <nav>
        <div className="nav-container">
          <Link href="/" className="logo">ORAH</Link>
          <div className="nav-actions">
            <Link href="/dashboard" className="btn-done">Done</Link>
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <div className="container">
        {/* View Tabs */}
        <div className="view-tabs">
          <button 
            className={`view-tab ${currentView === 'day' ? 'active' : ''}`}
            onClick={() => setCurrentView('day')}
          >
            Day
          </button>
          <button 
            className={`view-tab ${currentView === 'week' ? 'active' : ''}`}
            onClick={() => setCurrentView('week')}
          >
            Week
          </button>
          <button 
            className={`view-tab ${currentView === 'month' ? 'active' : ''}`}
            onClick={() => setCurrentView('month')}
          >
            Month
          </button>
        </div>

        {/* Date Header */}
        <div className="date-header">
          <button className="date-nav-btn" onClick={() => navigateDate('prev')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          <div className="date-display">
            <h1 className="date-title">
              {currentView === 'month' 
                ? getMonthDisplay() 
                : currentView === 'week' 
                ? getWeekDateRange() 
                : dateDisplay.title}
            </h1>
            {currentView === 'day' && (
              <span className={`date-label ${isToday ? 'today' : ''}`}>
                {dateDisplay.label}
              </span>
            )}
          </div>

          <button className="date-nav-btn" onClick={() => navigateDate('next')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>

        {/* Schedule Container */}
        <div className="schedule-container">
          {currentView === 'month' ? (
            /* Month View */
            <div className="month-container">
              {/* Weekday Headers */}
              <div className="weekday-header">
                <div className="weekday">Sun</div>
                <div className="weekday">Mon</div>
                <div className="weekday">Tue</div>
                <div className="weekday">Wed</div>
                <div className="weekday">Thu</div>
                <div className="weekday">Fri</div>
                <div className="weekday">Sat</div>
              </div>

              {/* Calendar Grid */}
              <div className="calendar-grid">
                {monthData.calendarDays.map((day, index) => {
                  const dateKey = formatDateKey(day.date)
                  const dayTasks = monthData.tasksByDate[dateKey] || []
                  const isDayToday = new Date().toDateString() === day.date.toDateString()
                  const dayNumber = day.date.getDate()
                  const maxVisibleTasks = 3

                  return (
                    <div
                      key={`${dateKey}-${index}`}
                      className={`day-cell ${!day.isCurrentMonth ? 'other-month' : ''} ${isDayToday ? 'today' : ''} ${dayTasks.length > 0 ? 'has-tasks' : ''}`}
                      onClick={() => {
                        if (day.isCurrentMonth) {
                          setSelectedDate(day.date)
                          setCurrentView('day')
                        }
                      }}
                    >
                      <div className="day-number">{dayNumber}</div>
                      {dayTasks.length > 0 && (
                        <div className="task-indicators">
                          {dayTasks.slice(0, maxVisibleTasks).map((task) => (
                            <div
                              key={task.id}
                              className="task-dot"
                              onClick={(e) => {
                                e.stopPropagation()
                                router.push(`/tasks/${task.id}`)
                              }}
                            >
                              <span className="task-dot-indicator"></span>
                              {task.title}
                            </div>
                          ))}
                          {dayTasks.length > maxVisibleTasks && (
                            <div className="more-tasks">
                              +{dayTasks.length - maxVisibleTasks} more
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : currentView === 'week' ? (
            /* Week View */
            <div className="week-grid">
              {weekData.weekDates.map((date, index) => {
                const dateKey = formatDateKey(date)
                const dayTasks = weekData.tasksByDate[dateKey] || []
                const isDayToday = new Date().toDateString() === date.toDateString()
                const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })
                const dayNumber = date.getDate()

                return (
                  <div key={dateKey} className={`day-column ${isDayToday ? 'today' : ''}`}>
                    <div className="day-header">
                      <div className="day-name">{dayName}</div>
                      <div className="day-number">{dayNumber}</div>
                      {dayTasks.length > 0 && (
                        <div className="task-count">
                          {dayTasks.length} task{dayTasks.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                    <div className="day-tasks">
                      {dayTasks.length === 0 ? (
                        <div className="empty-day">
                          <div className="empty-day-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                              <line x1="16" y1="2" x2="16" y2="6"/>
                              <line x1="8" y1="2" x2="8" y2="6"/>
                              <line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                          </div>
                          <div className="empty-day-text">No tasks scheduled</div>
                        </div>
                      ) : (
                        dayTasks.map((task) => (
                          <div
                            key={task.id}
                            className="week-task-card"
                            onClick={() => router.push(`/tasks/${task.id}`)}
                          >
                            <div className="task-card-time">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12 6 12 12 16 14"/>
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
          ) : tasks.length === 0 ? (
            <div className="empty-day">
              <div className="empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
              </div>
              <h2 className="empty-title">No Tasks Scheduled</h2>
              <p className="empty-text">No tasks are scheduled for this day</p>
            </div>
          ) : (
            <div className="schedule-grid">
              {/* Time Column */}
              <div className="time-column">
                <div className="time-slot">7 AM</div>
                <div className="time-slot">8 AM</div>
                <div className="time-slot">9 AM</div>
                <div className="time-slot">10 AM</div>
                <div className="time-slot">11 AM</div>
                <div className="time-slot">12 PM</div>
                <div className="time-slot">1 PM</div>
                <div className="time-slot">2 PM</div>
                <div className="time-slot">3 PM</div>
                <div className="time-slot">4 PM</div>
                <div className="time-slot">5 PM</div>
                <div className="time-slot">6 PM</div>
              </div>

              {/* Events Column */}
              <div className="events-column">
                {/* Hour rows */}
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="hour-row"></div>
                ))}

                {/* Task Events */}
                {tasks.map((task, index) => {
                  const position = getTaskPosition(index, tasks.length)
                  return (
                    <div
                      key={task.id}
                      className="task-event"
                      style={{
                        top: `${position.top}px`,
                        height: `${position.height}px`
                      }}
                      onClick={() => router.push(`/tasks/${task.id}`)}
                    >
                      <div className="task-event-time">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        {formatTime(task.estimated_minutes)}
                      </div>
                      <div className="task-event-title">{task.title}</div>
                    </div>
                  )
                })}

                {/* Current Time Line */}
                {isToday && <div className="current-time-line"></div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
