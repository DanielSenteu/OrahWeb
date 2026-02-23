'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/layout/Navigation'
import Link from 'next/link'
import './course-dashboard.css'
import { OrahMessage, MarkdownMessage, downloadCheatsheetPDF } from './orah-components'

interface Course {
  id: string
  course_name: string
  professor_name: string | null
  semester: string | null
  year: number | null
  color: string
  syllabus_text: string | null
}

type Tab = 'overview' | 'lectures' | 'assignments' | 'exams'

// ─── Main Component ────────────────────────────────────────────────────────────

export default function CourseDashboardPage() {
  const router = useRouter()
  const params = useParams()
  const courseId = params.id as string
  const supabase = createClient()

  const [course, setCourse] = useState<Course | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [semesterPlan, setSemesterPlan] = useState<any>(null)
  const [lectures, setLectures] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [exams, setExams] = useState<any[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [dailyTasks, setDailyTasks] = useState<any[]>([])

  // Orah sidebar
  const [orahOpen, setOrahOpen] = useState(true)
  const [orahMessages, setOrahMessages] = useState<OrahMessage[]>([])
  const [orahInput, setOrahInput] = useState('')
  const [orahLoading, setOrahLoading] = useState(false)
  const orahEndRef = useRef<HTMLDivElement>(null)
  const orahInputRef = useRef<HTMLTextAreaElement>(null)
  const streamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (courseId) loadCourse()
    return () => { if (streamTimerRef.current) clearTimeout(streamTimerRef.current) }
  }, [courseId])

  useEffect(() => { if (courseId && course) loadTabData(courseId, activeTab) }, [activeTab, courseId])

  useEffect(() => {
    if (activeTab === 'overview' && semesterPlan?.plan_data?.tasks) filterTasksForDate(selectedDate)
  }, [selectedDate, semesterPlan, activeTab])

  useEffect(() => { orahEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [orahMessages, orahLoading])

  useEffect(() => {
    if (orahOpen && orahMessages.length === 0 && course) {
      setOrahMessages([{
        role: 'assistant',
        content: `Hey! I'm **Orah**, your AI for **${course.course_name}**.\n\nI have full access to your recordings, transcripts, schedule, and course data. Ask me anything — I can make cheatsheets, solve math, draw diagrams, create quizzes, build study plans, and more.`,
      }])
    }
  }, [orahOpen, course])

  const loadCourse = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data, error } = await supabase.from('courses').select('*').eq('id', courseId).eq('user_id', user.id).single()
      if (error) { router.push('/courses'); return }
      setCourse(data); setLoading(false); loadTabData(data.id, activeTab)
    } catch { setLoading(false) }
  }

  const loadTabData = async (id: string, tab: Tab) => {
    setDataLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      if (tab === 'overview') {
        const { data: plan } = await supabase.from('course_semester_plans').select('*').eq('course_id', id).eq('user_id', user.id).single()
        setSemesterPlan(plan)
      } else if (tab === 'lectures') {
        const { data } = await supabase.from('course_lectures').select('*').eq('course_id', id).eq('user_id', user.id).order('lecture_date', { ascending: true })
        setLectures(data || [])
      } else if (tab === 'assignments') {
        const { data } = await supabase.from('course_assignments').select('*').eq('course_id', id).eq('user_id', user.id).order('due_date', { ascending: true })
        setAssignments(data || [])
      } else if (tab === 'exams') {
        const { data: examsData } = await supabase.from('course_exams').select('*').eq('course_id', id).eq('user_id', user.id).order('exam_date', { ascending: true })
        const examsWithPlan = await Promise.all(
          (examsData || []).map(async (exam) => {
            const { data: goalData } = await supabase.from('user_goals').select('id').eq('user_id', user.id).eq('exam_id', exam.id).maybeSingle()
            let finalGoal = goalData
            if (!finalGoal) {
              const { data: match } = await supabase.from('user_goals').select('id').eq('user_id', user.id).ilike('summary', `%${exam.exam_name}%`).maybeSingle()
              finalGoal = match
            }
            let firstTaskId = null
            if (finalGoal) {
              const { data: taskData } = await supabase.from('task_items').select('id').eq('goal_id', finalGoal.id).order('day_number', { ascending: true }).limit(1).maybeSingle()
              firstTaskId = taskData?.id || null
            }
            return { ...exam, hasPlan: !!finalGoal, firstTaskId }
          })
        )
        setExams(examsWithPlan)
      }
    } catch (e) { console.error('Error loading tab data:', e) }
    finally { setDataLoading(false) }
  }

  // ── Simulated streaming ────────────────────────────────────────────────────
  const streamIntoMessage = useCallback((fullText: string, msgIndex: number, extras: Partial<OrahMessage>, onDone?: () => void) => {
    const tokens = fullText.split(/(\s+)/)
    let pos = 0
    const CHUNK = 4
    const DELAY = 16

    const tick = () => {
      if (pos >= tokens.length) {
        setOrahMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, ...extras, content: fullText } : m))
        onDone?.()
        return
      }
      const chunk = tokens.slice(pos, pos + CHUNK).join('')
      setOrahMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, content: m.content + chunk } : m))
      pos += CHUNK
      streamTimerRef.current = setTimeout(tick, DELAY)
    }
    tick()
  }, [])

  // ── Send message ───────────────────────────────────────────────────────────
  const sendOrahMessage = async (text?: string) => {
    const msg = text || orahInput.trim()
    if (!msg || orahLoading) return

    const newMessages: OrahMessage[] = [...orahMessages, { role: 'user', content: msg }]
    setOrahMessages(newMessages)
    setOrahInput('')
    if (orahInputRef.current) { orahInputRef.current.style.height = 'auto' }
    setOrahLoading(true)

    try {
      const res = await fetch('/api/course-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, courseId, courseName: course?.course_name, syllabus: course?.syllabus_text ?? null }),
      })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()

      const reply: string = data.reply || 'Sorry, I had trouble replying.'
      const extras: Partial<OrahMessage> = {
        isCheatsheet: data.isCheatsheet,
        cheatsheetTitle: data.cheatsheetTitle,
        isMath: data.isMath,
        taskCreated: data.taskCreated ?? undefined,
      }

      const msgIndex = newMessages.length
      setOrahMessages(prev => [...prev, { role: 'assistant', content: '' }])
      setOrahLoading(false)

      streamIntoMessage(reply, msgIndex, extras, () => {
        if (data.action) {
          const action = data.action
          if (action.type === 'switch_tab') setTimeout(() => setActiveTab(action.tab as Tab), 600)
          else if (action.type === 'navigate') {
            const urlMap: Record<string, string> = {
              assignment_helper: `/assignment-helper?courseId=${courseId}`,
              exam_prep: `/exam-prep?courseId=${courseId}`,
              lecture_notes: `/lecture-notes?courseId=${courseId}`,
              semester_plan: `/courses/${courseId}/semester-plan`,
              syllabus: `/courses/${courseId}/syllabus`,
            }
            const url = urlMap[action.page]
            if (url) setTimeout(() => router.push(url), 1000)
          }
        }
        // Refresh daily tasks if a new task was created
        if (data.taskCreated) loadTabData(courseId, 'overview')
      })
    } catch {
      setOrahLoading(false)
      setOrahMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble connecting. Try again.' }])
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getInitials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const getSemesterDisplay = () => course?.semester && course?.year ? `${course.semester} ${course.year}` : ''

  const formatDateKey = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  const filterTasksForDate = (date: Date) => {
    if (!semesterPlan?.plan_data?.tasks) { setDailyTasks([]); return }
    setDailyTasks(semesterPlan.plan_data.tasks.filter((t: any) => t.scheduled_date_key === formatDateKey(date)) || [])
  }

  const navigateDate = (dir: 'prev' | 'next') => {
    const d = new Date(selectedDate); d.setDate(d.getDate() + (dir === 'next' ? 1 : -1)); setSelectedDate(d)
  }

  const formatDisplayDate = (date: Date) => {
    const today = new Date()
    if (date.toDateString() === today.toDateString()) return { label: 'Today', value: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
    const tmrw = new Date(today); tmrw.setDate(today.getDate() + 1)
    if (date.toDateString() === tmrw.toDateString()) return { label: 'Tomorrow', value: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
    return { label: date.toLocaleDateString('en-US', { weekday: 'long' }), value: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  }

  const getStatusBadge = (s: string) => s === 'completed' ? 'status-completed' : (s === 'in_progress' || s === 'studying') ? 'status-inprogress' : 'status-pending'
  const isUpcoming = (d: string | null) => !!d && new Date(d) > new Date()
  const daysUntil = (d: string | null) => {
    if (!d) return null
    const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
    if (diff < 0) return null
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    return `${diff}d`
  }

  if (loading) {
    return (
      <>
        <Navigation />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', flexDirection: 'column', gap: '1rem' }}>
          <div className="spinner" style={{ width: '40px', height: '40px' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Loading course…</p>
        </div>
      </>
    )
  }

  if (!course) {
    return (
      <>
        <Navigation />
        <div className="course-dashboard-container">
          <div className="course-error"><h2>Course not found</h2><Link href="/courses" className="btn-primary">Back to Courses</Link></div>
        </div>
      </>
    )
  }

  const courseColor = course.color || '#06B6D4'
  const dateDisp = formatDisplayDate(selectedDate)

  const CHIPS = [
    "What's due this week?",
    "Show all recordings",
    "What's missing from this course?",
    "Make a cheatsheet",
    "Create a practice quiz",
    "Draw a concept map",
    "Add a study task",
    "Show my full schedule",
  ]

  return (
    <>
      <Navigation />

      <div className="course-page-wrapper">

        {/* ── Orah Sidebar ─────────────────────────────────────────────────── */}
        <aside className={`orah-sidebar ${orahOpen ? 'orah-sidebar--open' : 'orah-sidebar--closed'}`}>
          <div className="orah-sidebar-header" style={{ borderBottom: `1.5px solid ${courseColor}33` }}>
            <div className="orah-brand">
              <div className="orah-brand-icon" style={{ background: `${courseColor}22`, color: courseColor }}>O</div>
              <div>
                <div className="orah-brand-name">Orah</div>
                <div className="orah-brand-sub">{course.course_name}</div>
              </div>
            </div>
            <button className="orah-collapse-btn" onClick={() => setOrahOpen(false)} aria-label="Hide Orah">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
          </div>

          {/* Capability pills */}
          <div className="orah-caps">
            {['Recordings', 'Transcripts', 'Schedule', 'Cheatsheets', 'Math', 'Diagrams', 'Quizzes', 'HTML'].map(cap => (
              <span key={cap} className="orah-cap-tag">{cap}</span>
            ))}
          </div>

          {/* Messages */}
          <div className="orah-messages">
            {orahMessages.map((m, idx) => (
              <div key={idx} className={`orah-msg orah-msg--${m.role}`}>
                {m.role === 'assistant' && (
                  <div className="orah-msg-avatar" style={{ color: courseColor }}>O</div>
                )}
                <div className={`orah-msg-bubble${m.isMath ? ' orah-msg-bubble--math' : ''}`}>
                  {m.role === 'assistant'
                    ? <MarkdownMessage content={m.content} isMath={m.isMath} />
                    : <span>{m.content}</span>
                  }

                  {/* Task created confirmation */}
                  {m.taskCreated && (
                    <div className="orah-task-created">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      <span>Task added: <strong>{m.taskCreated.title}</strong> on {m.taskCreated.date}</span>
                    </div>
                  )}

                  {/* PDF download for cheatsheets */}
                  {m.isCheatsheet && m.content.length > 20 && (
                    <button
                      className="orah-pdf-btn"
                      style={{ borderColor: `${courseColor}55`, color: courseColor }}
                      onClick={() => downloadCheatsheetPDF(m.cheatsheetTitle || 'Cheatsheet', m.content)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      Download PDF
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Suggestion chips after greeting */}
            {orahMessages.length === 1 && !orahLoading && (
              <div className="orah-suggestions">
                {CHIPS.map(chip => (
                  <button
                    key={chip}
                    className="orah-chip"
                    style={{ borderColor: `${courseColor}44`, color: courseColor }}
                    onClick={() => sendOrahMessage(chip)}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            {orahLoading && (
              <div className="orah-msg orah-msg--assistant">
                <div className="orah-msg-avatar" style={{ color: courseColor }}>O</div>
                <div className="orah-msg-bubble orah-typing"><span /><span /><span /></div>
              </div>
            )}
            <div ref={orahEndRef} />
          </div>

          {/* Input */}
          <div className="orah-input-row">
            <textarea
              ref={orahInputRef}
              className="orah-input"
              placeholder="Ask anything — diagrams, quizzes, math, cheatsheets…"
              rows={1}
              value={orahInput}
              onChange={e => {
                setOrahInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendOrahMessage() } }}
              disabled={orahLoading}
            />
            <button
              className="orah-send-btn"
              onClick={() => sendOrahMessage()}
              disabled={!orahInput.trim() || orahLoading}
              style={{ background: courseColor }}
              aria-label="Send"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </aside>

        {/* ── Course Content ────────────────────────────────────────────────── */}
        <main className="course-main">
          {!orahOpen && (
            <button
              className="orah-open-btn"
              onClick={() => setOrahOpen(true)}
              style={{ background: `${courseColor}18`, color: courseColor, borderColor: `${courseColor}44` }}
              title="Open Orah"
            >
              <div className="orah-open-btn-icon">O</div>
              <span>Orah</span>
            </button>
          )}

          <div className="course-inner">
            {/* Header */}
            <div className="course-header">
              <div className="course-header-content">
                <Link href="/courses" className="back-link">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                  Back to Courses
                </Link>
                <div className="course-title-section">
                  <div className="course-header-icon" style={{ background: `${courseColor}22`, color: courseColor }}>
                    {getInitials(course.course_name)}
                  </div>
                  <div>
                    <h1 className="course-dashboard-title">{course.course_name}</h1>
                    {course.professor_name && <p className="course-professor">{course.professor_name}</p>}
                    {getSemesterDisplay() && <p className="course-semester">{getSemesterDisplay()}</p>}
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="course-tabs-row">
              <div className="course-tabs">
                {(['overview', 'lectures', 'assignments', 'exams'] as Tab[]).map(tab => (
                  <button
                    key={tab}
                    className={`course-tab ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                    style={{ '--tab-color': courseColor } as React.CSSProperties}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    {tab === 'assignments' && assignments.length > 0 && <span className="tab-count">{assignments.length}</span>}
                    {tab === 'exams' && exams.length > 0 && <span className="tab-count">{exams.length}</span>}
                    {tab === 'lectures' && lectures.length > 0 && <span className="tab-count">{lectures.length}</span>}
                  </button>
                ))}
              </div>
              <button
                className="orah-fullpage-btn"
                style={{ '--btn-color': courseColor } as React.CSSProperties}
                onClick={() => router.push(`/courses/${courseId}/orah`)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                Open Orah
              </button>
            </div>

            {/* Tab Content */}
            <div className="course-content">

              {/* ── Overview ── */}
              {activeTab === 'overview' && (
                <div className="tab-panel">
                  {dataLoading ? (
                    <div className="tab-loading"><div className="spinner" style={{ width: '32px', height: '32px' }} /><p>Loading…</p></div>
                  ) : semesterPlan ? (
                    <div className="overview-content">
                      <div className="overview-card">
                        <h3 className="overview-card-title">Semester Plan</h3>
                        <div className="overview-stats">
                          <div className="stat-item"><div className="stat-label">Study Hours/Day</div><div className="stat-value" style={{ color: courseColor }}>{semesterPlan.study_hours_per_day || 2}h</div></div>
                          <div className="stat-item"><div className="stat-label">Study Times</div><div className="stat-value">{semesterPlan.preferred_study_times?.join(', ') || 'Flexible'}</div></div>
                          <div className="stat-item"><div className="stat-label">Assignments</div><div className="stat-value" style={{ color: courseColor }}>{assignments.length || '—'}</div></div>
                          <div className="stat-item"><div className="stat-label">Exams</div><div className="stat-value" style={{ color: courseColor }}>{exams.length || '—'}</div></div>
                        </div>
                      </div>
                      {semesterPlan.plan_data?.tasks?.length > 0 && (
                        <div className="daily-tasks-section">
                          <div className="date-nav">
                            <button className="date-nav-btn" onClick={() => navigateDate('prev')}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>Prev
                            </button>
                            <div className="current-date">
                              <div className="date-label">{dateDisp.label}</div>
                              <div className="date-value">{dateDisp.value}</div>
                            </div>
                            <button className="date-nav-btn" onClick={() => navigateDate('next')}>
                              Next<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                            </button>
                          </div>
                          {dailyTasks.length === 0 ? (
                            <div className="tab-empty"><div className="tab-empty-icon">📅</div><h3>No Tasks Scheduled</h3><p>No tasks for this day.</p></div>
                          ) : (
                            <div className="tasks-list">
                              {dailyTasks.map((task: any, i: number) => (
                                <div key={task.id || i} className="task-card">
                                  <div className="task-header">
                                    <div className="task-icon" style={{ background: `${courseColor}22` }}>
                                      <svg viewBox="0 0 24 24" fill="none" stroke={courseColor} strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                                    </div>
                                    <div className="task-info">
                                      <h2 className="task-title">{task.title}</h2>
                                      {task.notes && <p className="task-description">{task.notes}</p>}
                                    </div>
                                  </div>
                                  <div className="task-meta-row">
                                    <div className="task-meta-item">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                      <span className="task-meta-value">{task.estimated_minutes || 0} min</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="tab-empty">
                      <div className="tab-empty-icon">📅</div>
                      <h3>No Semester Plan Yet</h3>
                      <p>Create a personalized semester plan to organize your study schedule.</p>
                      <Link href={`/courses/${courseId}/semester-plan`} className="btn-primary">Create Semester Plan</Link>
                    </div>
                  )}
                </div>
              )}

              {/* ── Lectures ── */}
              {activeTab === 'lectures' && (
                <div className="tab-panel">
                  <div className="tab-panel-header">
                    <h2 className="tab-panel-title">Lectures</h2>
                    <Link href={`/lecture-notes?courseId=${courseId}`} className="btn-primary-small">+ Record Lecture</Link>
                  </div>
                  {dataLoading ? (
                    <div className="tab-loading"><div className="spinner" style={{ width: '32px', height: '32px' }} /><p>Loading…</p></div>
                  ) : lectures.length > 0 ? (
                    <div className="items-list">
                      {lectures.map(lecture => (
                        <div key={lecture.id} className="item-card">
                          <div className="item-card-left">
                            <div className="item-card-dot" style={{ background: courseColor }} />
                            <div>
                              <div className="item-card-title">{lecture.title || `Lecture${lecture.week_number ? ` – Week ${lecture.week_number}` : ''}`}</div>
                              {lecture.lecture_date && (
                                <div className="item-card-sub">
                                  {new Date(lecture.lecture_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                  {lecture.week_number && ` · Week ${lecture.week_number}`}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="item-card-right">
                            {lecture.processing_status === 'completed' && lecture.generated_notes
                              ? <span className="status-pill status-completed">Notes Ready</span>
                              : lecture.processing_status === 'processing'
                                ? <span className="status-pill status-inprogress">Processing…</span>
                                : <span className="status-pill status-pending">Not Recorded</span>
                            }
                            <Link href={`/lecture-notes?courseId=${courseId}&lectureId=${lecture.id}`} className="item-action-btn" style={{ '--btn-color': courseColor } as React.CSSProperties}>
                              {lecture.audio_url ? 'View Notes' : 'Record'}
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="tab-empty">
                      <div className="tab-empty-icon">🎙️</div>
                      <h3>No Lectures Yet</h3>
                      <p>Upload your syllabus to populate the lecture schedule, or record manually.</p>
                      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {!course.syllabus_text && <Link href={`/courses/${courseId}/syllabus`} className="btn-primary">Upload Syllabus</Link>}
                        <Link href={`/lecture-notes?courseId=${courseId}`} className="btn-secondary-action">Record Lecture</Link>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Assignments ── */}
              {activeTab === 'assignments' && (
                <div className="tab-panel">
                  <div className="tab-panel-header">
                    <h2 className="tab-panel-title">Assignments</h2>
                    <Link href={`/assignment-helper?courseId=${courseId}`} className="btn-primary-small">+ Add Assignment</Link>
                  </div>
                  {dataLoading ? (
                    <div className="tab-loading"><div className="spinner" style={{ width: '32px', height: '32px' }} /><p>Loading…</p></div>
                  ) : assignments.length > 0 ? (
                    <div className="items-list">
                      {assignments.map(a => {
                        const due = daysUntil(a.due_date)
                        const upcoming = isUpcoming(a.due_date)
                        return (
                          <div key={a.id} className="item-card">
                            <div className="item-card-left">
                              <div className="item-card-dot" style={{ background: upcoming ? courseColor : '#6b7280' }} />
                              <div>
                                <div className="item-card-title">{a.assignment_name}</div>
                                {a.due_date && (
                                  <div className="item-card-sub">
                                    Due {new Date(a.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    {due && <span className="due-chip" style={{ background: `${courseColor}22`, color: courseColor }}>{due}</span>}
                                  </div>
                                )}
                                {a.description && <div className="item-card-desc">{a.description}</div>}
                              </div>
                            </div>
                            <div className="item-card-right">
                              <span className={`status-pill ${getStatusBadge(a.status)}`}>{(a.status || 'not started').replace('_', ' ')}</span>
                              <Link href={a.step_by_step_plan ? `/schedule` : `/assignment-helper?courseId=${courseId}&assignmentId=${a.id}`} className={`item-action-btn ${a.step_by_step_plan ? 'item-action-primary' : ''}`} style={{ '--btn-color': courseColor } as React.CSSProperties}>
                                {a.step_by_step_plan ? 'Go to Plan' : 'Create Plan'}
                              </Link>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="tab-empty">
                      <div className="tab-empty-icon">📝</div>
                      <h3>No Assignments Yet</h3>
                      <p>Upload your syllabus to extract assignments, or add them manually.</p>
                      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {!course.syllabus_text && <Link href={`/courses/${courseId}/syllabus`} className="btn-primary">Upload Syllabus</Link>}
                        <Link href={`/assignment-helper?courseId=${courseId}`} className="btn-secondary-action">Add Assignment</Link>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Exams ── */}
              {activeTab === 'exams' && (
                <div className="tab-panel">
                  <div className="tab-panel-header">
                    <h2 className="tab-panel-title">Exams</h2>
                    <Link href={`/exam-prep?courseId=${courseId}`} className="btn-primary-small">+ Add Exam</Link>
                  </div>
                  {dataLoading ? (
                    <div className="tab-loading"><div className="spinner" style={{ width: '32px', height: '32px' }} /><p>Loading…</p></div>
                  ) : exams.length > 0 ? (
                    <div className="items-list">
                      {exams.map(exam => {
                        const due = daysUntil(exam.exam_date)
                        const upcoming = isUpcoming(exam.exam_date)
                        return (
                          <div key={exam.id} className="item-card">
                            <div className="item-card-left">
                              <div className="item-card-dot" style={{ background: upcoming ? courseColor : '#6b7280' }} />
                              <div>
                                <div className="item-card-title">{exam.exam_name}</div>
                                {exam.exam_date && (
                                  <div className="item-card-sub">
                                    {new Date(exam.exam_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}
                                    {due && <span className="due-chip" style={{ background: `${courseColor}22`, color: courseColor }}>{due}</span>}
                                  </div>
                                )}
                                {exam.topics?.length > 0 && (
                                  <div className="item-card-topics">
                                    {exam.topics.slice(0, 4).map((t: string, i: number) => (
                                      <span key={i} className="topic-tag">{t}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="item-card-right">
                              <span className={`status-pill ${getStatusBadge(exam.status)}`}>{(exam.status || 'not started').replace('_', ' ')}</span>
                              {exam.hasPlan ? (
                                <Link href={`/courses/${courseId}/exams/${exam.id}/study`} className="item-action-btn item-action-primary" style={{ '--btn-color': courseColor } as React.CSSProperties}>Go to Plan</Link>
                              ) : (
                                <Link href={`/exam-prep?courseId=${courseId}&examId=${exam.id}`} className="item-action-btn" style={{ '--btn-color': courseColor } as React.CSSProperties}>Create Study Plan</Link>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="tab-empty">
                      <div className="tab-empty-icon">📚</div>
                      <h3>No Exams Yet</h3>
                      <p>Upload your syllabus to extract all exams, or add them manually.</p>
                      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {!course.syllabus_text && <Link href={`/courses/${courseId}/syllabus`} className="btn-primary">Upload Syllabus</Link>}
                        <Link href={`/exam-prep?courseId=${courseId}`} className="btn-secondary-action">Add Exam</Link>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
