'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/layout/Navigation'
import Link from 'next/link'
import './course-dashboard.css'

/* ─── Types ─── */
interface Course {
  id: string
  course_name: string
  professor_name: string | null
  semester: string | null
  year: number | null
  color: string
}

type Tab = 'overview' | 'lectures' | 'assignments' | 'exams' | 'calendar' | 'chat'

interface CalendarEvent {
  date: string       // YYYY-MM-DD
  title: string
  type: 'lecture' | 'assignment' | 'exam' | 'task'
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/* ─── Calendar helpers ─── */
function buildCalendar(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (Date | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ─── Main component ─── */
export default function CourseDashboardPage() {
  const router = useRouter()
  const params = useParams()
  const courseId = params.id as string
  const supabase = createClient()

  const [course, setCourse] = useState<Course | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)

  // Tab data
  const [semesterPlan, setSemesterPlan] = useState<any>(null)
  const [lectures, setLectures] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [exams, setExams] = useState<any[]>([])
  const [dataLoading, setDataLoading] = useState(false)

  // Overview day navigation
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [dailyTasks, setDailyTasks] = useState<any[]>([])

  // Calendar
  const today = new Date()
  const [calMonth, setCalMonth] = useState(today.getMonth())
  const [calYear, setCalYear] = useState(today.getFullYear())
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([])
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null)

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  /* ─── Load course ─── */
  useEffect(() => {
    if (courseId) loadCourse()
  }, [courseId])

  const loadCourse = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .eq('user_id', user.id)
        .single()

      if (error) { router.push('/courses'); return }
      setCourse(data)
      setLoading(false)
      loadTabData(data.id, 'overview')
      loadAllCalendarEvents(data.id)
    } catch {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (courseId && course) loadTabData(courseId, activeTab)
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'overview' && semesterPlan?.plan_data?.tasks) {
      filterTasksForDate(selectedDate)
    }
  }, [selectedDate, semesterPlan, activeTab])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  /* ─── Load tab data ─── */
  const loadTabData = async (id: string, tab: Tab) => {
    if (tab === 'calendar' || tab === 'chat') return
    setDataLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      if (tab === 'overview') {
        const { data: plan } = await supabase
          .from('course_semester_plans')
          .select('*')
          .eq('course_id', id)
          .eq('user_id', user.id)
          .single()
        setSemesterPlan(plan)
      } else if (tab === 'lectures') {
        const { data } = await supabase
          .from('course_lectures')
          .select('*')
          .eq('course_id', id)
          .eq('user_id', user.id)
          .order('lecture_date', { ascending: false })
        setLectures(data || [])
      } else if (tab === 'assignments') {
        const { data } = await supabase
          .from('course_assignments')
          .select('*')
          .eq('course_id', id)
          .eq('user_id', user.id)
          .order('due_date', { ascending: true })
        setAssignments(data || [])
      } else if (tab === 'exams') {
        const { data: examsData } = await supabase
          .from('course_exams')
          .select('*')
          .eq('course_id', id)
          .eq('user_id', user.id)
          .order('exam_date', { ascending: true })

        const examsWithPlan = await Promise.all(
          (examsData || []).map(async (exam: any) => {
            const { data: goal } = await supabase
              .from('user_goals')
              .select('id')
              .eq('user_id', user.id)
              .eq('exam_id', exam.id)
              .eq('goal_type', 'exam')
              .maybeSingle()

            let firstTaskId = null
            if (goal) {
              const { data: task } = await supabase
                .from('task_items')
                .select('id')
                .eq('goal_id', goal.id)
                .eq('user_id', user.id)
                .order('day_number', { ascending: true })
                .limit(1)
                .maybeSingle()
              firstTaskId = task?.id || null
            }
            return { ...exam, hasPlan: !!goal, firstTaskId }
          })
        )
        setExams(examsWithPlan)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setDataLoading(false)
    }
  }

  /* ─── Calendar events ─── */
  const loadAllCalendarEvents = async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const events: CalendarEvent[] = []

      const { data: lecs } = await supabase
        .from('course_lectures')
        .select('title, lecture_date, week_number')
        .eq('course_id', id)
        .eq('user_id', user.id)
      ;(lecs || []).forEach((l: any) => {
        if (l.lecture_date) events.push({
          date: l.lecture_date.slice(0, 10),
          title: l.title || `Lecture${l.week_number ? ` Wk ${l.week_number}` : ''}`,
          type: 'lecture'
        })
      })

      const { data: asgns } = await supabase
        .from('course_assignments')
        .select('assignment_name, due_date')
        .eq('course_id', id)
        .eq('user_id', user.id)
      ;(asgns || []).forEach((a: any) => {
        if (a.due_date) events.push({
          date: a.due_date.slice(0, 10),
          title: a.assignment_name,
          type: 'assignment'
        })
      })

      const { data: exs } = await supabase
        .from('course_exams')
        .select('exam_name, exam_date')
        .eq('course_id', id)
        .eq('user_id', user.id)
      ;(exs || []).forEach((e: any) => {
        if (e.exam_date) events.push({
          date: e.exam_date.slice(0, 10),
          title: e.exam_name,
          type: 'exam'
        })
      })

      const { data: plan } = await supabase
        .from('course_semester_plans')
        .select('plan_data')
        .eq('course_id', id)
        .eq('user_id', user.id)
        .single()
      if (plan?.plan_data?.tasks) {
        ;(plan.plan_data.tasks as any[]).forEach(t => {
          if (t.scheduled_date_key) events.push({
            date: t.scheduled_date_key,
            title: t.title,
            type: 'task'
          })
        })
      }

      setCalEvents(events)
    } catch (e) {
      console.error(e)
    }
  }

  /* ─── Overview helpers ─── */
  const filterTasksForDate = (date: Date) => {
    if (!semesterPlan?.plan_data?.tasks) { setDailyTasks([]); return }
    const key = toDateKey(date)
    setDailyTasks(semesterPlan.plan_data.tasks.filter((t: any) => t.scheduled_date_key === key))
  }

  const navigateDate = (dir: 'prev' | 'next') => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + (dir === 'next' ? 1 : -1))
    setSelectedDate(d)
  }

  const formatDisplayDate = (date: Date) => {
    const t = new Date(); t.setHours(0,0,0,0)
    const d = new Date(date); d.setHours(0,0,0,0)
    const diff = (d.getTime() - t.getTime()) / 86400000
    let label = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday'
      : date.toLocaleDateString('en-US', { weekday: 'long' })
    const value = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return { label, value }
  }

  const getInitials = (name: string) =>
    name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  const getSemesterDisplay = () =>
    course?.semester && course?.year ? `${course.semester} ${course.year}` : ''

  /* ─── Chat ─── */
  const sendChatMessage = async () => {
    const text = chatInput.trim()
    if (!text || chatLoading) return

    const userMsg: ChatMessage = { role: 'user', content: text }
    setChatMessages(prev => [...prev, userMsg])
    setChatInput('')
    setChatLoading(true)

    try {
      const res = await fetch(`/api/courses/${courseId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...chatMessages, userMsg] })
      })

      if (!res.ok) throw new Error('Chat request failed')
      const data = await res.json()
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.message }])
    } catch {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I ran into an error. Please try again.'
      }])
    } finally {
      setChatLoading(false)
    }
  }

  /* ─── Calendar render ─── */
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const calWeeks = buildCalendar(calYear, calMonth)
  const eventsMap: Record<string, CalendarEvent[]> = {}
  calEvents.forEach(e => {
    if (!eventsMap[e.date]) eventsMap[e.date] = []
    eventsMap[e.date].push(e)
  })
  const selectedEvents = selectedCalDate ? eventsMap[selectedCalDate] || [] : []

  /* ─── Loading ─── */
  if (loading) {
    return (
      <>
        <Navigation />
        <div className="cd-loading">
          <div className="spinner" />
          <p>Loading course…</p>
        </div>
      </>
    )
  }

  if (!course) {
    return (
      <>
        <Navigation />
        <div className="cd-error">
          <h2>Course not found</h2>
          <Link href="/courses" className="btn-primary">Back to Courses</Link>
        </div>
      </>
    )
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'lectures', label: 'Lectures' },
    { id: 'assignments', label: 'Assignments' },
    { id: 'exams', label: 'Exams' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'chat', label: 'Ask Orah' },
  ]

  /* ─── JSX ─── */
  return (
    <>
      <Navigation />
      <div className="cd-container">

        {/* Course header */}
        <div className="cd-header">
          <Link href="/courses" className="cd-back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Courses
          </Link>
          <div className="cd-header-main">
            <div
              className="cd-avatar"
              style={{
                background: `${course.color || '#4F46E5'}18`,
                color: course.color || '#4F46E5'
              }}
            >
              {getInitials(course.course_name)}
            </div>
            <div className="cd-header-text">
              <h1 className="cd-course-name">{course.course_name}</h1>
              <p className="cd-course-meta">
                {course.professor_name && <span>{course.professor_name}</span>}
                {course.professor_name && getSemesterDisplay() && <span className="cd-meta-sep">·</span>}
                {getSemesterDisplay() && <span>{getSemesterDisplay()}</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="cd-tabs-wrap">
          <div className="cd-tabs">
            {TABS.map(tab => (
              <button
                key={tab.id}
                className={`cd-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                style={activeTab === tab.id ? { borderBottomColor: course.color || '#4F46E5', color: course.color || '#4F46E5' } : {}}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="cd-content">

          {/* ── Overview ── */}
          {activeTab === 'overview' && (
            <div className="tab-panel">
              <div className="tab-header">
                <h2 className="tab-title">Overview</h2>
                {!semesterPlan && (
                  <Link href={`/courses/${courseId}/semester-plan`} className="btn-sm-primary">
                    Create Semester Plan
                  </Link>
                )}
              </div>

              {dataLoading ? <TabLoader /> : semesterPlan ? (
                <div>
                  <div className="overview-stats-row">
                    <div className="stat-box">
                      <div className="stat-label">Study Hours/Day</div>
                      <div className="stat-value">{semesterPlan.study_hours_per_day || 2}h</div>
                    </div>
                    {semesterPlan.preferred_study_times?.length > 0 && (
                      <div className="stat-box">
                        <div className="stat-label">Preferred Times</div>
                        <div className="stat-value">{semesterPlan.preferred_study_times.join(', ')}</div>
                      </div>
                    )}
                  </div>

                  {semesterPlan.plan_data?.tasks?.length > 0 && (
                    <div className="day-nav-section">
                      <div className="day-nav">
                        <button className="day-nav-btn" onClick={() => navigateDate('prev')}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="15 18 9 12 15 6"/>
                          </svg>
                        </button>
                        <div className="day-nav-center">
                          <span className="day-nav-label">{formatDisplayDate(selectedDate).label}</span>
                          <span className="day-nav-value">{formatDisplayDate(selectedDate).value}</span>
                        </div>
                        <button className="day-nav-btn" onClick={() => navigateDate('next')}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        </button>
                      </div>

                      {dailyTasks.length === 0 ? (
                        <EmptyState icon="📅" title="No tasks this day" text="No study tasks are scheduled for this day." />
                      ) : (
                        <div className="tasks-list">
                          {dailyTasks.map((task: any, i: number) => (
                            <div key={task.id || i} className="task-item">
                              <div className="task-item-left">
                                <div className="task-dot" style={{ background: course.color || '#4F46E5' }} />
                                <div>
                                  <p className="task-item-title">{task.title}</p>
                                  {task.notes && <p className="task-item-note">{task.notes}</p>}
                                </div>
                              </div>
                              <span className="task-item-time">{task.estimated_minutes || 0}m</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon="📅"
                  title="No semester plan yet"
                  text="Create a semester plan to organise your study schedule for this course."
                  action={<Link href={`/courses/${courseId}/semester-plan`} className="btn-sm-primary">Create Semester Plan</Link>}
                />
              )}
            </div>
          )}

          {/* ── Lectures ── */}
          {activeTab === 'lectures' && (
            <div className="tab-panel">
              <div className="tab-header">
                <h2 className="tab-title">Lectures</h2>
                <Link href={`/lecture-notes?courseId=${courseId}`} className="btn-sm-primary">
                  + Record Lecture
                </Link>
              </div>
              {dataLoading ? <TabLoader /> : lectures.length > 0 ? (
                <div className="item-list">
                  {lectures.map(lec => (
                    <div key={lec.id} className="item-card">
                      <div className="item-card-left">
                        <div className="item-icon" style={{ background: `${course.color || '#4F46E5'}15`, color: course.color || '#4F46E5' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                        </div>
                        <div>
                          <p className="item-title">{lec.title || `Lecture${lec.week_number ? ` – Week ${lec.week_number}` : ''}`}</p>
                          {lec.lecture_date && (
                            <p className="item-meta">{new Date(lec.lecture_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                          )}
                        </div>
                      </div>
                      <div className="item-card-right">
                        {lec.processing_status === 'completed' && lec.generated_notes && (
                          <span className="badge badge-success">Notes ready</span>
                        )}
                        {lec.processing_status === 'processing' && (
                          <span className="badge badge-info">Processing…</span>
                        )}
                        <Link href={`/lecture-notes?courseId=${courseId}&lectureId=${lec.id}`} className="btn-sm-ghost">
                          {lec.audio_url ? 'View notes' : 'Record'}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon="🎙️"
                  title="No lectures yet"
                  text="Record a lecture or upload a transcript to generate AI-powered study notes."
                  action={<Link href={`/lecture-notes?courseId=${courseId}`} className="btn-sm-primary">Record Your First Lecture</Link>}
                  uploadHint
                />
              )}
            </div>
          )}

          {/* ── Assignments ── */}
          {activeTab === 'assignments' && (
            <div className="tab-panel">
              <div className="tab-header">
                <h2 className="tab-title">Assignments</h2>
                <Link href={`/assignment-helper?courseId=${courseId}`} className="btn-sm-primary">
                  + Add Assignment
                </Link>
              </div>
              {dataLoading ? <TabLoader /> : assignments.length > 0 ? (
                <div className="item-list">
                  {assignments.map(a => (
                    <div key={a.id} className="item-card">
                      <div className="item-card-left">
                        <div className="item-icon" style={{ background: '#FEF3C720', color: '#D97706' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </div>
                        <div>
                          <p className="item-title">{a.assignment_name}</p>
                          {a.due_date && (
                            <p className="item-meta">Due {new Date(a.due_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                          )}
                        </div>
                      </div>
                      <div className="item-card-right">
                        <span className={`badge ${a.status === 'completed' ? 'badge-success' : a.status === 'in_progress' ? 'badge-info' : 'badge-neutral'}`}>
                          {(a.status || 'not started').replace('_', ' ')}
                        </span>
                        <Link href={`/assignment-helper?courseId=${courseId}&assignmentId=${a.id}`} className="btn-sm-ghost">
                          {a.step_by_step_plan ? 'View plan' : 'Create plan'}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon="📝"
                  title="No assignments yet"
                  text="Add an assignment to get a step-by-step plan that breaks it into daily tasks."
                  action={<Link href={`/assignment-helper?courseId=${courseId}`} className="btn-sm-primary">Add Your First Assignment</Link>}
                  uploadHint
                />
              )}
            </div>
          )}

          {/* ── Exams ── */}
          {activeTab === 'exams' && (
            <div className="tab-panel">
              <div className="tab-header">
                <h2 className="tab-title">Exams</h2>
                <Link href={`/exam-prep?courseId=${courseId}`} className="btn-sm-primary">
                  + Add Exam
                </Link>
              </div>
              {dataLoading ? <TabLoader /> : exams.length > 0 ? (
                <div className="item-list">
                  {exams.map(e => (
                    <div key={e.id} className="item-card">
                      <div className="item-card-left">
                        <div className="item-icon" style={{ background: '#FEE2E220', color: '#DC2626' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                          </svg>
                        </div>
                        <div>
                          <p className="item-title">{e.exam_name}</p>
                          {e.exam_date && (
                            <p className="item-meta">{new Date(e.exam_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                          )}
                          {e.topics?.length > 0 && (
                            <p className="item-meta">{e.topics.slice(0, 3).join(', ')}{e.topics.length > 3 ? '…' : ''}</p>
                          )}
                        </div>
                      </div>
                      <div className="item-card-right">
                        <span className={`badge ${e.status === 'completed' ? 'badge-success' : 'badge-neutral'}`}>
                          {(e.status || 'not started').replace('_', ' ')}
                        </span>
                        {e.hasPlan ? (
                          <Link href={`/courses/${courseId}/exams/${e.id}/study`} className="btn-sm-primary">
                            Study
                          </Link>
                        ) : (
                          <Link href={`/exam-prep?courseId=${courseId}&examId=${e.id}`} className="btn-sm-ghost">
                            Create plan
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon="📚"
                  title="No exams yet"
                  text="Add an exam to build a spaced-repetition study schedule leading up to exam day."
                  action={<Link href={`/exam-prep?courseId=${courseId}`} className="btn-sm-primary">Add Your First Exam</Link>}
                  uploadHint
                />
              )}
            </div>
          )}

          {/* ── Calendar ── */}
          {activeTab === 'calendar' && (
            <div className="tab-panel">
              <div className="tab-header">
                <h2 className="tab-title">Calendar</h2>
              </div>

              <div className="cal-wrap">
                {/* Month nav */}
                <div className="cal-month-nav">
                  <button className="cal-nav-btn" onClick={() => {
                    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
                    else setCalMonth(m => m - 1)
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                  </button>
                  <span className="cal-month-label">{MONTH_NAMES[calMonth]} {calYear}</span>
                  <button className="cal-nav-btn" onClick={() => {
                    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
                    else setCalMonth(m => m + 1)
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                </div>

                {/* Day headers */}
                <div className="cal-grid">
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                    <div key={d} className="cal-day-header">{d}</div>
                  ))}

                  {calWeeks.flat().map((date, idx) => {
                    const key = date ? toDateKey(date) : null
                    const events = key ? eventsMap[key] || [] : []
                    const isToday = key === toDateKey(today)
                    const isSelected = key === selectedCalDate
                    return (
                      <div
                        key={idx}
                        className={`cal-cell ${!date ? 'cal-cell-empty' : ''} ${isToday ? 'cal-cell-today' : ''} ${isSelected ? 'cal-cell-selected' : ''} ${events.length > 0 ? 'cal-cell-has-events' : ''}`}
                        onClick={() => date && setSelectedCalDate(isSelected ? null : key)}
                        style={isSelected ? { borderColor: course.color || '#4F46E5' } : {}}
                      >
                        {date && (
                          <>
                            <span
                              className="cal-day-num"
                              style={isToday ? { background: course.color || '#4F46E5' } : {}}
                            >
                              {date.getDate()}
                            </span>
                            <div className="cal-dots">
                              {events.slice(0, 3).map((ev, i) => (
                                <span
                                  key={i}
                                  className={`cal-dot cal-dot-${ev.type}`}
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Legend */}
                <div className="cal-legend">
                  <span className="cal-legend-item"><span className="cal-dot cal-dot-lecture" />Lecture</span>
                  <span className="cal-legend-item"><span className="cal-dot cal-dot-assignment" />Assignment</span>
                  <span className="cal-legend-item"><span className="cal-dot cal-dot-exam" />Exam</span>
                  <span className="cal-legend-item"><span className="cal-dot cal-dot-task" />Study task</span>
                </div>

                {/* Selected day events */}
                {selectedCalDate && (
                  <div className="cal-day-detail">
                    <p className="cal-day-detail-title">
                      {new Date(selectedCalDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>
                    {selectedEvents.length === 0 ? (
                      <p className="cal-day-detail-empty">Nothing scheduled on this day.</p>
                    ) : (
                      <ul className="cal-day-events">
                        {selectedEvents.map((ev, i) => (
                          <li key={i} className="cal-day-event">
                            <span className={`cal-dot cal-dot-${ev.type}`} style={{ flexShrink: 0 }} />
                            <span className="cal-event-title">{ev.title}</span>
                            <span className={`badge badge-${ev.type === 'exam' ? 'danger' : ev.type === 'assignment' ? 'warning' : ev.type === 'lecture' ? 'info' : 'neutral'}`}>
                              {ev.type}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Chat ── */}
          {activeTab === 'chat' && (
            <div className="tab-panel chat-panel">
              <div className="chat-messages">
                {chatMessages.length === 0 ? (
                  <div className="chat-welcome">
                    <div className="chat-welcome-avatar" style={{ background: `${course.color || '#4F46E5'}18`, color: course.color || '#4F46E5' }}>
                      {getInitials(course.course_name)}
                    </div>
                    <h3 className="chat-welcome-title">Ask Orah about {course.course_name}</h3>
                    <p className="chat-welcome-text">
                      I have access to your lectures, assignments, and exams for this course.
                      Ask me anything — quiz questions, summaries, study tips, or what&apos;s coming up next.
                    </p>
                    <div className="chat-starters">
                      {[
                        'What assignments are due soon?',
                        'Quiz me on my lecture notes',
                        'What exams do I have coming up?',
                        'Summarise this course for me',
                      ].map(s => (
                        <button
                          key={s}
                          className="chat-starter-btn"
                          onClick={() => { setChatInput(s) }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  chatMessages.map((msg, i) => (
                    <div key={i} className={`chat-msg ${msg.role}`}>
                      {msg.role === 'assistant' && (
                        <div className="chat-msg-avatar" style={{ background: `${course.color || '#4F46E5'}18`, color: course.color || '#4F46E5' }}>
                          O
                        </div>
                      )}
                      <div className="chat-msg-bubble">
                        {msg.content.split('\n').map((line, j) => (
                          <p key={j}>{line}</p>
                        ))}
                      </div>
                    </div>
                  ))
                )}
                {chatLoading && (
                  <div className="chat-msg assistant">
                    <div className="chat-msg-avatar" style={{ background: `${course.color || '#4F46E5'}18`, color: course.color || '#4F46E5' }}>O</div>
                    <div className="chat-msg-bubble chat-typing">
                      <span /><span /><span />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="chat-input-row">
                <textarea
                  className="chat-input"
                  placeholder={`Ask about ${course.course_name}…`}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage() }
                  }}
                  rows={1}
                />
                <button
                  className="chat-send-btn"
                  onClick={sendChatMessage}
                  disabled={!chatInput.trim() || chatLoading}
                  style={{ background: course.color || '#4F46E5' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}

/* ─── Small reusable components ─── */
function TabLoader() {
  return (
    <div className="tab-loader">
      <div className="spinner" />
    </div>
  )
}

function EmptyState({ icon, title, text, action, uploadHint }: {
  icon: string; title: string; text: string; action?: React.ReactNode; uploadHint?: boolean
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3 className="empty-title">{title}</h3>
      <p className="empty-text">{text}</p>
      {uploadHint && (
        <p className="empty-upload-hint">
          You can also upload a document or use the <strong>Ask Orah</strong> tab and I&apos;ll help extract the information.
        </p>
      )}
      {action}
    </div>
  )
}
