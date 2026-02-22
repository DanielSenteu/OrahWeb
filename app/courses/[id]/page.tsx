'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/layout/Navigation'
import Link from 'next/link'
import './course-dashboard.css'

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

type OrahMessage = { role: 'user' | 'assistant'; content: string }

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

  // Orah floating chat
  const [orahOpen, setOrahOpen] = useState(false)
  const [orahMessages, setOrahMessages] = useState<OrahMessage[]>([])
  const [orahInput, setOrahInput] = useState('')
  const [orahLoading, setOrahLoading] = useState(false)
  const orahEndRef = useRef<HTMLDivElement>(null)
  const orahInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (courseId) loadCourse()
  }, [courseId])

  useEffect(() => {
    if (courseId && course) loadTabData(courseId, activeTab)
  }, [activeTab, courseId])

  useEffect(() => {
    if (activeTab === 'overview' && semesterPlan?.plan_data?.tasks) {
      filterTasksForDate(selectedDate)
    }
  }, [selectedDate, semesterPlan, activeTab])

  useEffect(() => {
    orahEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [orahMessages, orahLoading])

  // Initialise Orah greeting when panel first opens
  useEffect(() => {
    if (orahOpen && orahMessages.length === 0 && course) {
      setOrahMessages([{
        role: 'assistant',
        content: `Hey! I'm Orah, your AI for ${course.course_name}. Ask me anything about your assignments, exams, lecture material, or how to study for this course.`,
      }])
    }
  }, [orahOpen, course])

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
      loadTabData(data.id, activeTab)
    } catch {
      setLoading(false)
    }
  }

  const loadTabData = async (id: string, tab: Tab) => {
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
          .order('lecture_date', { ascending: true })
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
          (examsData || []).map(async (exam) => {
            const { data: goalData } = await supabase
              .from('user_goals')
              .select('id')
              .eq('user_id', user.id)
              .eq('exam_id', exam.id)
              .eq('goal_type', 'exam')
              .maybeSingle()

            let finalGoal = goalData
            if (!finalGoal) {
              const { data: match } = await supabase
                .from('user_goals')
                .select('id')
                .eq('user_id', user.id)
                .ilike('summary', `%${exam.exam_name}%`)
                .maybeSingle()
              finalGoal = match
            }

            let firstTaskId = null
            if (finalGoal) {
              const { data: taskData } = await supabase
                .from('task_items')
                .select('id')
                .eq('goal_id', finalGoal.id)
                .order('day_number', { ascending: true })
                .limit(1)
                .maybeSingle()
              firstTaskId = taskData?.id || null
            }

            return { ...exam, hasPlan: !!finalGoal, firstTaskId }
          })
        )
        setExams(examsWithPlan)
      }
    } catch (error) {
      console.error('Error loading tab data:', error)
    } finally {
      setDataLoading(false)
    }
  }

  // ── Orah chat ──
  const sendOrahMessage = async (text?: string) => {
    const msg = text || orahInput.trim()
    if (!msg || orahLoading) return

    const newMessages: OrahMessage[] = [...orahMessages, { role: 'user', content: msg }]
    setOrahMessages(newMessages)
    setOrahInput('')
    setOrahLoading(true)

    try {
      // Build course context for Orah
      const courseContext = `
Course: ${course?.course_name}
Professor: ${course?.professor_name || 'Not specified'}
Semester: ${course?.semester || ''} ${course?.year || ''}
Upcoming assignments: ${assignments.slice(0, 5).map(a => `${a.assignment_name} due ${a.due_date || 'TBD'}`).join(', ') || 'none loaded'}
Upcoming exams: ${exams.slice(0, 3).map(e => `${e.exam_name} on ${e.exam_date || 'TBD'}`).join(', ') || 'none loaded'}
${course?.syllabus_text ? `Syllabus excerpt: ${course.syllabus_text.slice(0, 1500)}` : ''}
      `.trim()

      const res = await fetch('/api/orah-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          academicType: 'course',
          syllabusContent: courseContext,
        }),
      })

      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      if (data.reply) {
        setOrahMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      }
    } catch {
      setOrahMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I had trouble connecting. Try again in a moment." }])
    } finally {
      setOrahLoading(false)
    }
  }

  const getInitials = (name: string) =>
    name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  const getSemesterDisplay = () => {
    if (course?.semester && course?.year) return `${course.semester} ${course.year}`
    return ''
  }

  const formatDateKey = (date: Date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const filterTasksForDate = (date: Date) => {
    if (!semesterPlan?.plan_data?.tasks) { setDailyTasks([]); return }
    const key = formatDateKey(date)
    setDailyTasks(semesterPlan.plan_data.tasks.filter((t: any) => t.scheduled_date_key === key) || [])
  }

  const navigateDate = (dir: 'prev' | 'next') => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + (dir === 'next' ? 1 : -1))
    setSelectedDate(d)
  }

  const formatDisplayDate = (date: Date) => {
    const today = new Date()
    if (date.toDateString() === today.toDateString()) return { label: 'Today', value: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
    const tmrw = new Date(today); tmrw.setDate(today.getDate() + 1)
    if (date.toDateString() === tmrw.toDateString()) return { label: 'Tomorrow', value: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
    return { label: date.toLocaleDateString('en-US', { weekday: 'long' }), value: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  }

  const getStatusBadge = (status: string) => {
    if (status === 'completed') return 'status-completed'
    if (status === 'in_progress' || status === 'studying') return 'status-inprogress'
    return 'status-pending'
  }

  const isUpcoming = (dateStr: string | null) => {
    if (!dateStr) return false
    return new Date(dateStr) > new Date()
  }

  const daysUntil = (dateStr: string | null) => {
    if (!dateStr) return null
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
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
          <div className="spinner" style={{ width: '40px', height: '40px' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading course...</p>
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

  return (
    <>
      <Navigation />
      <div className="course-dashboard-container">
        {/* Course Header */}
        <div className="course-header">
          <div className="course-header-content">
            <Link href="/courses" className="back-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
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
        <div className="course-tabs">
          {(['overview', 'lectures', 'assignments', 'exams'] as Tab[]).map(tab => (
            <button
              key={tab}
              className={`course-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
              style={{ '--tab-color': courseColor } as React.CSSProperties}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'assignments' && assignments.length > 0 && (
                <span className="tab-count">{assignments.length}</span>
              )}
              {tab === 'exams' && exams.length > 0 && (
                <span className="tab-count">{exams.length}</span>
              )}
              {tab === 'lectures' && lectures.length > 0 && (
                <span className="tab-count">{lectures.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="course-content">

          {/* ── Overview ── */}
          {activeTab === 'overview' && (
            <div className="tab-panel">
              {dataLoading ? (
                <div className="tab-loading"><div className="spinner" style={{ width: '32px', height: '32px' }} /><p>Loading...</p></div>
              ) : semesterPlan ? (
                <div className="overview-content">
                  <div className="overview-card">
                    <h3 className="overview-card-title">Semester Plan</h3>
                    <div className="overview-stats">
                      <div className="stat-item">
                        <div className="stat-label">Study Hours/Day</div>
                        <div className="stat-value" style={{ color: courseColor }}>{semesterPlan.study_hours_per_day || 2}h</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-label">Study Times</div>
                        <div className="stat-value">{semesterPlan.preferred_study_times?.join(', ') || 'Flexible'}</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-label">Assignments</div>
                        <div className="stat-value" style={{ color: courseColor }}>{assignments.length || '—'}</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-label">Exams</div>
                        <div className="stat-value" style={{ color: courseColor }}>{exams.length || '—'}</div>
                      </div>
                    </div>
                  </div>

                  {semesterPlan.plan_data?.tasks?.length > 0 && (
                    <div className="daily-tasks-section">
                      <div className="date-nav">
                        <button className="date-nav-btn" onClick={() => navigateDate('prev')}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                          Prev
                        </button>
                        <div className="current-date">
                          <div className="date-label">{dateDisp.label}</div>
                          <div className="date-value">{dateDisp.value}</div>
                        </div>
                        <button className="date-nav-btn" onClick={() => navigateDate('next')}>
                          Next
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                        </button>
                      </div>

                      {dailyTasks.length === 0 ? (
                        <div className="tab-empty">
                          <div className="tab-empty-icon">📅</div>
                          <h3>No Tasks Scheduled</h3>
                          <p>No tasks are scheduled for this day.</p>
                        </div>
                      ) : (
                        <div className="tasks-list">
                          {dailyTasks.map((task: any, i: number) => (
                            <div key={task.id || i} className="task-card">
                              <div className="task-header">
                                <div className="task-icon" style={{ background: `${courseColor}22` }}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke={courseColor} strokeWidth="2"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
                                </div>
                                <div className="task-info">
                                  <h2 className="task-title">{task.title}</h2>
                                  {task.notes && <p className="task-description">{task.notes}</p>}
                                </div>
                              </div>
                              <div className="task-meta-row">
                                <div className="task-meta-item">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
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
                  <p>Create a personalized semester plan to organize your study schedule around your actual assignments and exams.</p>
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
                <div className="tab-loading"><div className="spinner" style={{ width: '32px', height: '32px' }} /><p>Loading...</p></div>
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
                        {lecture.processing_status === 'completed' && lecture.generated_notes ? (
                          <span className="status-pill status-completed">Notes Ready</span>
                        ) : lecture.processing_status === 'processing' ? (
                          <span className="status-pill status-inprogress">Processing...</span>
                        ) : (
                          <span className="status-pill status-pending">Not Recorded</span>
                        )}
                        <Link
                          href={`/lecture-notes?courseId=${courseId}&lectureId=${lecture.id}`}
                          className="item-action-btn"
                          style={{ '--btn-color': courseColor } as React.CSSProperties}
                        >
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
                  <p>Upload your syllabus to automatically populate your lecture schedule, or record your first lecture manually.</p>
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {!course.syllabus_text && (
                      <Link href={`/courses/${courseId}/syllabus`} className="btn-primary">Upload Syllabus</Link>
                    )}
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
                <div className="tab-loading"><div className="spinner" style={{ width: '32px', height: '32px' }} /><p>Loading...</p></div>
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
                          <span className={`status-pill ${getStatusBadge(a.status)}`}>
                            {(a.status || 'not started').replace('_', ' ')}
                          </span>
                          <Link
                            href={`/assignment-helper?courseId=${courseId}&assignmentId=${a.id}`}
                            className="item-action-btn"
                            style={{ '--btn-color': courseColor } as React.CSSProperties}
                          >
                            {a.step_by_step_plan ? 'View Plan' : 'Create Plan'}
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
                  <p>Upload your syllabus to automatically extract all assignments, or add them manually.</p>
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {!course.syllabus_text && (
                      <Link href={`/courses/${courseId}/syllabus`} className="btn-primary">Upload Syllabus</Link>
                    )}
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
                <div className="tab-loading"><div className="spinner" style={{ width: '32px', height: '32px' }} /><p>Loading...</p></div>
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
                          <span className={`status-pill ${getStatusBadge(exam.status)}`}>
                            {(exam.status || 'not started').replace('_', ' ')}
                          </span>
                          {exam.hasPlan ? (
                            <Link
                              href={`/courses/${courseId}/exams/${exam.id}/study`}
                              className="item-action-btn item-action-primary"
                              style={{ '--btn-color': courseColor } as React.CSSProperties}
                            >
                              Study Now
                            </Link>
                          ) : (
                            <Link
                              href={`/exam-prep?courseId=${courseId}&examId=${exam.id}`}
                              className="item-action-btn"
                              style={{ '--btn-color': courseColor } as React.CSSProperties}
                            >
                              Create Study Plan
                            </Link>
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
                  <p>Upload your syllabus to automatically extract all exams, or add them manually.</p>
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {!course.syllabus_text && (
                      <Link href={`/courses/${courseId}/syllabus`} className="btn-primary">Upload Syllabus</Link>
                    )}
                    <Link href={`/exam-prep?courseId=${courseId}`} className="btn-secondary-action">Add Exam</Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Orah Floating Button ── */}
      <button
        className={`orah-fab ${orahOpen ? 'orah-fab--open' : ''}`}
        onClick={() => setOrahOpen(o => !o)}
        aria-label="Chat with Orah"
        style={{ '--fab-color': courseColor } as React.CSSProperties}
      >
        {orahOpen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <span className="orah-fab-label">O</span>
        )}
      </button>

      {/* ── Orah Chat Panel ── */}
      {orahOpen && (
        <div className="orah-panel">
          <div className="orah-panel-header" style={{ borderBottom: `2px solid ${courseColor}33` }}>
            <div className="orah-panel-avatar" style={{ background: `${courseColor}22`, color: courseColor }}>O</div>
            <div>
              <div className="orah-panel-title">Orah</div>
              <div className="orah-panel-sub">for {course.course_name}</div>
            </div>
          </div>

          <div className="orah-messages">
            {orahMessages.map((m, i) => (
              <div key={i} className={`orah-msg ${m.role}`}>
                {m.role === 'assistant' && (
                  <div className="orah-msg-avatar" style={{ color: courseColor }}>O</div>
                )}
                <div className="orah-msg-bubble">{m.content}</div>
              </div>
            ))}
            {orahLoading && (
              <div className="orah-msg assistant">
                <div className="orah-msg-avatar" style={{ color: courseColor }}>O</div>
                <div className="orah-msg-bubble orah-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
            <div ref={orahEndRef} />
          </div>

          <div className="orah-input-row">
            <textarea
              ref={orahInputRef}
              className="orah-input"
              placeholder="Ask about assignments, exams, material..."
              rows={1}
              value={orahInput}
              onChange={e => setOrahInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendOrahMessage() } }}
              disabled={orahLoading}
            />
            <button
              className="orah-send-btn"
              onClick={() => sendOrahMessage()}
              disabled={!orahInput.trim() || orahLoading}
              style={{ background: courseColor }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
