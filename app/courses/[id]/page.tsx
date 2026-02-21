'use client'

import { useState, useEffect } from 'react'
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
}

interface TimelineItem {
  id: string
  type: 'assignment' | 'exam'
  name: string
  date: string        // ISO YYYY-MM-DD
  status: string
  daysUntil: number   // negative = overdue
  hasPlan?: boolean
}

type Section = 'home' | 'timeline' | 'assignments' | 'exams' | 'lectures' | 'chat'

const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
  {
    id: 'home',
    label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    id: 'timeline',
    label: 'Timeline',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    id: 'assignments',
    label: 'Assignments',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    id: 'exams',
    label: 'Exams',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
  {
    id: 'lectures',
    label: 'Lectures',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
  {
    id: 'chat',
    label: 'AI Assistant',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
]

export default function CourseDashboardPage() {
  const router = useRouter()
  const params = useParams()
  const courseId = params.id as string
  const supabase = createClient()

  const [course, setCourse] = useState<Course | null>(null)
  const [activeSection, setActiveSection] = useState<Section>('home')
  const [loading, setLoading] = useState(true)

  // Per-section data
  const [semesterPlan, setSemesterPlan] = useState<any>(null)
  const [lectures, setLectures] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [exams, setExams] = useState<any[]>([])
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([])
  const [dataLoading, setDataLoading] = useState(false)

  // Deadline counters for sidebar badges
  const [assignmentCount, setAssignmentCount] = useState(0)
  const [examCount, setExamCount] = useState(0)

  // Day navigation for Home section
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [dailyTasks, setDailyTasks] = useState<any[]>([])

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

      if (error || !data) { router.push('/courses'); return }

      setCourse(data)
      setLoading(false)
      loadSectionData(data.id, 'home', user.id)

      // Load badge counts
      const today = new Date().toISOString().split('T')[0]
      const [{ count: ac }, { count: ec }] = await Promise.all([
        supabase.from('course_assignments').select('id', { count: 'exact', head: true })
          .eq('course_id', data.id).eq('user_id', user.id).neq('status', 'completed').gte('due_date', today),
        supabase.from('course_exams').select('id', { count: 'exact', head: true })
          .eq('course_id', data.id).eq('user_id', user.id).neq('status', 'completed').gte('exam_date', today),
      ])
      setAssignmentCount(ac || 0)
      setExamCount(ec || 0)
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  useEffect(() => {
    if (courseId && course) {
      loadSectionData(courseId, activeSection, undefined)
    }
  }, [activeSection, courseId])

  useEffect(() => {
    if (activeSection === 'home' && semesterPlan?.plan_data?.tasks) {
      filterTasksForDate(selectedDate)
    }
  }, [selectedDate, semesterPlan, activeSection])

  const loadSectionData = async (id: string, section: Section, passedUserId?: string) => {
    setDataLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const uid = passedUserId || user?.id
      if (!uid) return

      if (section === 'home') {
        const { data: plan } = await supabase
          .from('course_semester_plans').select('*')
          .eq('course_id', id).eq('user_id', uid).single()
        setSemesterPlan(plan)
      } else if (section === 'timeline') {
        const today = new Date(); today.setHours(0, 0, 0, 0)
        // Fetch all assignments and exams (including past, to show overdue)
        const [{ data: aData }, { data: eData }] = await Promise.all([
          supabase.from('course_assignments')
            .select('id, assignment_name, due_date, status')
            .eq('course_id', id).eq('user_id', uid)
            .neq('status', 'completed')
            .order('due_date', { ascending: true }),
          supabase.from('course_exams')
            .select('id, exam_name, exam_date, status')
            .eq('course_id', id).eq('user_id', uid)
            .neq('status', 'completed')
            .order('exam_date', { ascending: true }),
        ])
        const items: TimelineItem[] = []
        for (const a of (aData || [])) {
          if (!a.due_date) continue
          const d = new Date(a.due_date); d.setHours(0, 0, 0, 0)
          items.push({
            id: a.id, type: 'assignment', name: a.assignment_name,
            date: a.due_date, status: a.status || 'not_started',
            daysUntil: Math.ceil((d.getTime() - today.getTime()) / 86400000),
          })
        }
        for (const e of (eData || [])) {
          if (!e.exam_date) continue
          const d = new Date(e.exam_date); d.setHours(0, 0, 0, 0)
          items.push({
            id: e.id, type: 'exam', name: e.exam_name,
            date: e.exam_date, status: e.status || 'not_started',
            daysUntil: Math.ceil((d.getTime() - today.getTime()) / 86400000),
          })
        }
        items.sort((a, b) => a.daysUntil - b.daysUntil)
        setTimelineItems(items)
      } else if (section === 'lectures') {
        const { data: d } = await supabase
          .from('course_lectures').select('*')
          .eq('course_id', id).eq('user_id', uid)
          .order('lecture_date', { ascending: false })
        setLectures(d || [])
      } else if (section === 'assignments') {
        const { data: d } = await supabase
          .from('course_assignments').select('*')
          .eq('course_id', id).eq('user_id', uid)
          .order('due_date', { ascending: true })
        setAssignments(d || [])
      } else if (section === 'exams') {
        const { data: examsData } = await supabase
          .from('course_exams').select('*')
          .eq('course_id', id).eq('user_id', uid)
          .order('exam_date', { ascending: true })

        const withPlan = await Promise.all(
          (examsData || []).map(async (exam) => {
            const { data: goalData } = await supabase
              .from('user_goals').select('id')
              .eq('user_id', uid).eq('exam_id', exam.id).eq('goal_type', 'exam').maybeSingle()
            let fallback = null
            if (!goalData) {
              const { data: m } = await supabase
                .from('user_goals').select('id')
                .eq('user_id', uid).ilike('summary', `%${exam.exam_name}%`).maybeSingle()
              fallback = m
            }
            const final = goalData || fallback
            let firstTaskId = null
            if (final) {
              const { data: td } = await supabase
                .from('task_items').select('id')
                .eq('goal_id', final.id).eq('user_id', uid)
                .order('day_number', { ascending: true }).limit(1).maybeSingle()
              if (td) firstTaskId = td.id
            }
            return { ...exam, hasPlan: !!final, firstTaskId }
          })
        )
        setExams(withPlan)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setDataLoading(false)
    }
  }

  const getInitials = (name: string) =>
    name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  const getSemesterDisplay = () =>
    course?.semester && course?.year ? `${course.semester} ${course.year}` : null

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
    const tom = new Date(today); tom.setDate(tom.getDate() + 1)
    if (date.toDateString() === tom.toDateString()) return { label: 'Tomorrow', value: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
    const yes = new Date(today); yes.setDate(yes.getDate() - 1)
    if (date.toDateString() === yes.toDateString()) return { label: 'Yesterday', value: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
    return { label: date.toLocaleDateString('en-US', { weekday: 'long' }), value: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  }

  const calculateProgress = () => {
    if (dailyTasks.length === 0) return 0
    return Math.round((dailyTasks.filter((t: any) => t.is_completed).length / dailyTasks.length) * 100)
  }

  // Group timeline items into labelled buckets
  const getTimelineGroups = () => {
    const groups: { label: string; sublabel: string; items: TimelineItem[] }[] = []
    const buckets: { label: string; sublabel: string; test: (d: number) => boolean }[] = [
      { label: 'Overdue', sublabel: 'Past due', test: d => d < 0 },
      { label: 'Today', sublabel: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }), test: d => d === 0 },
      { label: 'Tomorrow', sublabel: new Date(Date.now() + 86400000).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }), test: d => d === 1 },
      { label: 'This Week', sublabel: 'In the next 7 days', test: d => d >= 2 && d <= 7 },
      { label: 'Next Week', sublabel: '8–14 days away', test: d => d >= 8 && d <= 14 },
      { label: 'This Month', sublabel: '15–30 days away', test: d => d >= 15 && d <= 30 },
      { label: 'Later', sublabel: 'More than 30 days away', test: d => d > 30 },
    ]
    for (const b of buckets) {
      const matching = timelineItems.filter(i => b.test(i.daysUntil))
      if (matching.length > 0) groups.push({ label: b.label, sublabel: b.sublabel, items: matching })
    }
    return groups
  }

  const formatTimelineDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  const color = course?.color || '#06B6D4'

  if (loading) return (
    <>
      <Navigation />
      <div className="cd-loading">
        <div className="spinner" style={{ width: 40, height: 40 }} />
        <p>Loading course…</p>
      </div>
    </>
  )

  if (!course) return (
    <>
      <Navigation />
      <div className="cd-error">
        <h2>Course not found</h2>
        <Link href="/courses" className="cd-btn">Back to Courses</Link>
      </div>
    </>
  )

  return (
    <>
      <Navigation />
      <div className="cd-shell">

        {/* ── Sidebar ─────────────────────────────────────────────── */}
        <aside className="cd-sidebar" style={{ '--cd-color': color } as React.CSSProperties}>

          {/* Course identity */}
          <div className="cd-sidebar-identity">
            <div className="cd-sidebar-icon" style={{ background: `${color}22`, color }}>
              {getInitials(course.course_name)}
            </div>
            <div className="cd-sidebar-meta">
              <p className="cd-sidebar-name">{course.course_name}</p>
              {course.professor_name && <p className="cd-sidebar-prof">{course.professor_name}</p>}
              {getSemesterDisplay() && <p className="cd-sidebar-sem">{getSemesterDisplay()}</p>}
            </div>
          </div>

          {/* Navigation */}
          <nav className="cd-nav">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                className={`cd-nav-item ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => setActiveSection(item.id)}
              >
                <span className="cd-nav-icon">{item.icon}</span>
                <span className="cd-nav-label">{item.label}</span>
                {item.id === 'assignments' && assignmentCount > 0 && (
                  <span className="cd-nav-badge">{assignmentCount}</span>
                )}
                {item.id === 'exams' && examCount > 0 && (
                  <span className="cd-nav-badge exam">{examCount}</span>
                )}
              </button>
            ))}
          </nav>

          {/* Back link */}
          <Link href="/courses" className="cd-sidebar-back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            All Courses
          </Link>
        </aside>

        {/* ── Main Content ─────────────────────────────────────────── */}
        <main className="cd-main">

          {/* HOME */}
          {activeSection === 'home' && (
            <div className="cd-section">
              <div className="cd-section-header">
                <div>
                  <h1 className="cd-section-title">Home</h1>
                  <p className="cd-section-sub">Your study plan for {course.course_name}</p>
                </div>
                {!semesterPlan && (
                  <Link href={`/courses/${courseId}/semester-plan`} className="cd-btn">
                    Create Study Plan
                  </Link>
                )}
              </div>

              {dataLoading ? (
                <div className="cd-inner-loading"><div className="spinner" style={{ width: 32, height: 32 }} /><p>Loading…</p></div>
              ) : semesterPlan ? (
                <div className="cd-home-content">
                  <div className="cd-stats-row">
                    <div className="cd-stat-card">
                      <div className="cd-stat-value">{semesterPlan.study_hours_per_day || 2}h</div>
                      <div className="cd-stat-label">Study / Day</div>
                    </div>
                    <div className="cd-stat-card">
                      <div className="cd-stat-value">{semesterPlan.preferred_study_times?.length || 0}</div>
                      <div className="cd-stat-label">Time Slots</div>
                    </div>
                    <div className="cd-stat-card">
                      <div className="cd-stat-value">{semesterPlan.plan_data?.tasks?.length || 0}</div>
                      <div className="cd-stat-label">Total Tasks</div>
                    </div>
                  </div>

                  {semesterPlan.plan_data?.tasks?.length > 0 && (
                    <div className="cd-daily-section">
                      <div className="cd-date-nav">
                        <button className="cd-date-btn" onClick={() => navigateDate('prev')}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                          Prev
                        </button>
                        <div className="cd-date-center">
                          <div className="cd-date-label">{formatDisplayDate(selectedDate).label}</div>
                          <div className="cd-date-value">{formatDisplayDate(selectedDate).value}</div>
                        </div>
                        <button className="cd-date-btn" onClick={() => navigateDate('next')}>
                          Next
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                        </button>
                      </div>

                      {dailyTasks.length === 0 ? (
                        <div className="cd-empty-inline">
                          <p>No tasks scheduled for this day.</p>
                        </div>
                      ) : (
                        <>
                          <div className="cd-tasks-list">
                            {dailyTasks.map((task: any, i: number) => (
                              <div key={task.id || i} className="cd-task-card">
                                <div className="cd-task-icon">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
                                  </svg>
                                </div>
                                <div className="cd-task-body">
                                  <h3 className="cd-task-title">{task.title}</h3>
                                  {task.notes && <p className="cd-task-notes">{task.notes}</p>}
                                  <div className="cd-task-meta">
                                    {task.estimated_minutes > 0 && (
                                      <span className="cd-task-chip">{task.estimated_minutes} min</span>
                                    )}
                                    {task.day_number && (
                                      <span className="cd-task-chip muted">Day {task.day_number}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="cd-progress-row">
                            <span className="cd-progress-label">Today&apos;s Progress</span>
                            <span className="cd-progress-pct">{calculateProgress()}%</span>
                          </div>
                          <div className="cd-progress-track">
                            <div className="cd-progress-fill" style={{ width: `${calculateProgress()}%` }} />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="cd-empty">
                  <div className="cd-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <h3>No Study Plan Yet</h3>
                  <p>Create a personalized semester plan to organize your study schedule.</p>
                  <Link href={`/courses/${courseId}/semester-plan`} className="cd-btn">Create Semester Plan</Link>
                </div>
              )}
            </div>
          )}

          {/* TIMELINE */}
          {activeSection === 'timeline' && (
            <div className="cd-section">
              <div className="cd-section-header">
                <div>
                  <h1 className="cd-section-title">Timeline</h1>
                  <p className="cd-section-sub">
                    {timelineItems.length > 0
                      ? `${timelineItems.length} pending deadline${timelineItems.length !== 1 ? 's' : ''}`
                      : 'No pending deadlines'}
                  </p>
                </div>
              </div>

              {dataLoading ? (
                <div className="cd-inner-loading"><div className="spinner" style={{ width: 32, height: 32 }} /><p>Loading…</p></div>
              ) : timelineItems.length === 0 ? (
                <div className="cd-empty">
                  <div className="cd-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h3>All Clear</h3>
                  <p>No pending assignments or exams for this course.</p>
                </div>
              ) : (
                <div className="tl-groups">
                  {getTimelineGroups().map(group => (
                    <div key={group.label} className="tl-group">
                      <div className="tl-group-header">
                        <span className={`tl-group-label ${group.label === 'Overdue' ? 'overdue' : ''}`}>{group.label}</span>
                        <span className="tl-group-sub">{group.sublabel}</span>
                      </div>
                      <div className="tl-items">
                        {group.items.map(item => {
                          const overdue = item.daysUntil < 0
                          const urgent = item.daysUntil >= 0 && item.daysUntil <= 3
                          return (
                            <div key={item.id} className={`tl-item ${overdue ? 'overdue' : urgent ? 'urgent' : ''}`}>
                              {/* Spine dot */}
                              <div className={`tl-dot ${item.type} ${overdue ? 'overdue' : ''}`} />

                              <div className="tl-item-body">
                                <div className="tl-item-top">
                                  <span className={`tl-type-tag ${item.type}`}>
                                    {item.type === 'assignment' ? 'Assignment' : 'Exam'}
                                  </span>
                                  <span className="tl-item-date">{formatTimelineDate(item.date)}</span>
                                </div>
                                <h3 className="tl-item-name">{item.name}</h3>
                                <div className="tl-item-footer">
                                  <span className={`cd-status-badge ${item.status}`}>
                                    {item.status.replace('_', ' ')}
                                  </span>
                                  {overdue ? (
                                    <span className="tl-overdue-chip">
                                      {Math.abs(item.daysUntil)}d overdue
                                    </span>
                                  ) : item.daysUntil === 0 ? (
                                    <span className="tl-urgent-chip">Due today</span>
                                  ) : item.daysUntil === 1 ? (
                                    <span className="tl-urgent-chip">Due tomorrow</span>
                                  ) : urgent ? (
                                    <span className="tl-urgent-chip">{item.daysUntil}d left</span>
                                  ) : (
                                    <span className="tl-days-chip">{item.daysUntil}d</span>
                                  )}
                                  <Link
                                    href={item.type === 'assignment'
                                      ? `/assignment-helper?courseId=${courseId}&assignmentId=${item.id}`
                                      : `/exam-prep?courseId=${courseId}&examId=${item.id}`
                                    }
                                    className="cd-item-btn"
                                  >
                                    {item.type === 'exam' ? 'Exam Prep' : 'View'}
                                  </Link>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ASSIGNMENTS */}
          {activeSection === 'assignments' && (
            <div className="cd-section">
              <div className="cd-section-header">
                <div>
                  <h1 className="cd-section-title">Assignments</h1>
                  <p className="cd-section-sub">{assignmentCount > 0 ? `${assignmentCount} pending` : 'All caught up'}</p>
                </div>
                <Link href={`/assignment-helper?courseId=${courseId}`} className="cd-btn">+ Add Assignment</Link>
              </div>

              {dataLoading ? (
                <div className="cd-inner-loading"><div className="spinner" style={{ width: 32, height: 32 }} /><p>Loading…</p></div>
              ) : assignments.length > 0 ? (
                <div className="cd-list">
                  {assignments.map(a => {
                    const daysUntil = a.due_date
                      ? Math.ceil((new Date(a.due_date).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000)
                      : null
                    const urgent = daysUntil !== null && daysUntil <= 3 && a.status !== 'completed'
                    return (
                      <div key={a.id} className={`cd-item-card ${urgent ? 'urgent' : ''}`} style={{ '--cd-color': color } as React.CSSProperties}>
                        <div className="cd-item-left">
                          <div className={`cd-item-status ${a.status || 'not_started'}`} />
                          <div className="cd-item-body">
                            <h3 className="cd-item-name">{a.assignment_name}</h3>
                            {a.due_date && (
                              <p className="cd-item-date">
                                Due {new Date(a.due_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                {daysUntil !== null && daysUntil >= 0 && (
                                  <span className={`cd-days-chip ${urgent ? 'urgent' : ''}`}>
                                    {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil}d`}
                                  </span>
                                )}
                              </p>
                            )}
                            {a.description && <p className="cd-item-desc">{a.description}</p>}
                          </div>
                        </div>
                        <div className="cd-item-right">
                          <span className={`cd-status-badge ${a.status || 'not_started'}`}>
                            {(a.status || 'not started').replace('_', ' ')}
                          </span>
                          <Link href={`/assignment-helper?courseId=${courseId}&assignmentId=${a.id}`} className="cd-item-btn">
                            {a.step_by_step_plan ? 'View Plan' : 'Create Plan'}
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="cd-empty">
                  <div className="cd-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <h3>No Assignments Yet</h3>
                  <p>Add assignments manually or extract them from your syllabus.</p>
                  <Link href={`/assignment-helper?courseId=${courseId}`} className="cd-btn">Add Assignment</Link>
                </div>
              )}
            </div>
          )}

          {/* EXAMS */}
          {activeSection === 'exams' && (
            <div className="cd-section">
              <div className="cd-section-header">
                <div>
                  <h1 className="cd-section-title">Exams</h1>
                  <p className="cd-section-sub">{examCount > 0 ? `${examCount} upcoming` : 'No upcoming exams'}</p>
                </div>
                <Link href={`/exam-prep?courseId=${courseId}`} className="cd-btn">+ Add Exam</Link>
              </div>

              {dataLoading ? (
                <div className="cd-inner-loading"><div className="spinner" style={{ width: 32, height: 32 }} /><p>Loading…</p></div>
              ) : exams.length > 0 ? (
                <div className="cd-list">
                  {exams.map(exam => {
                    const daysUntil = exam.exam_date
                      ? Math.ceil((new Date(exam.exam_date).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000)
                      : null
                    const urgent = daysUntil !== null && daysUntil <= 7 && exam.status !== 'completed'
                    return (
                      <div key={exam.id} className={`cd-item-card ${urgent ? 'urgent' : ''}`} style={{ '--cd-color': color } as React.CSSProperties}>
                        <div className="cd-item-left">
                          <div className={`cd-item-status exam ${exam.status || 'not_started'}`} />
                          <div className="cd-item-body">
                            <h3 className="cd-item-name">{exam.exam_name}</h3>
                            {exam.exam_date && (
                              <p className="cd-item-date">
                                {new Date(exam.exam_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                {daysUntil !== null && daysUntil >= 0 && (
                                  <span className={`cd-days-chip ${urgent ? 'urgent' : ''}`}>
                                    {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil}d`}
                                  </span>
                                )}
                              </p>
                            )}
                            {exam.topics?.length > 0 && (
                              <p className="cd-item-desc">{exam.topics.join(', ')}</p>
                            )}
                          </div>
                        </div>
                        <div className="cd-item-right">
                          <span className={`cd-status-badge ${exam.status || 'not_started'}`}>
                            {(exam.status || 'not started').replace('_', ' ')}
                          </span>
                          {exam.hasPlan ? (
                            <Link href={`/courses/${courseId}/exams/${exam.id}/study`} className="cd-item-btn primary">
                              Study Now
                            </Link>
                          ) : (
                            <Link href={`/exam-prep?courseId=${courseId}&examId=${exam.id}`} className="cd-item-btn">
                              Create Plan
                            </Link>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="cd-empty">
                  <div className="cd-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                    </svg>
                  </div>
                  <h3>No Exams Yet</h3>
                  <p>Add exams to track and create study plans.</p>
                  <Link href={`/exam-prep?courseId=${courseId}`} className="cd-btn">Add Exam</Link>
                </div>
              )}
            </div>
          )}

          {/* LECTURES */}
          {activeSection === 'lectures' && (
            <div className="cd-section">
              <div className="cd-section-header">
                <div>
                  <h1 className="cd-section-title">Lectures</h1>
                  <p className="cd-section-sub">Notes & recordings</p>
                </div>
                <Link href={`/lecture-notes?courseId=${courseId}`} className="cd-btn">+ Record Lecture</Link>
              </div>

              {dataLoading ? (
                <div className="cd-inner-loading"><div className="spinner" style={{ width: 32, height: 32 }} /><p>Loading…</p></div>
              ) : lectures.length > 0 ? (
                <div className="cd-list">
                  {lectures.map(lec => (
                    <div key={lec.id} className="cd-item-card" style={{ '--cd-color': color } as React.CSSProperties}>
                      <div className="cd-item-left">
                        <div className="cd-lec-icon" style={{ background: `${color}18`, color }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                        </div>
                        <div className="cd-item-body">
                          <h3 className="cd-item-name">
                            {lec.title || `Lecture${lec.week_number ? ` — Week ${lec.week_number}` : ''}`}
                          </h3>
                          {lec.lecture_date && (
                            <p className="cd-item-date">
                              {new Date(lec.lecture_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="cd-item-right">
                        {lec.processing_status === 'completed' && lec.generated_notes && (
                          <span className="cd-status-badge completed">Notes Ready</span>
                        )}
                        {lec.processing_status === 'processing' && (
                          <span className="cd-status-badge processing">Processing…</span>
                        )}
                        {lec.processing_status === 'pending' && !lec.audio_url && (
                          <span className="cd-status-badge not_started">Not Recorded</span>
                        )}
                        {lec.processing_status === 'pending' && lec.audio_url && (
                          <span className="cd-status-badge not_started">Pending</span>
                        )}
                        <Link
                          href={`/lecture-notes?courseId=${courseId}&lectureId=${lec.id}`}
                          className="cd-item-btn"
                        >
                          {lec.audio_url ? 'View Notes' : 'Record'}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="cd-empty">
                  <div className="cd-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </div>
                  <h3>No Lectures Yet</h3>
                  <p>Record lectures to generate AI-powered notes and summaries.</p>
                  <Link href={`/lecture-notes?courseId=${courseId}`} className="cd-btn">Record First Lecture</Link>
                </div>
              )}
            </div>
          )}

          {/* AI CHAT — built next */}
          {activeSection === 'chat' && (
            <div className="cd-section">
              <div className="cd-section-header">
                <div>
                  <h1 className="cd-section-title">AI Assistant</h1>
                  <p className="cd-section-sub">Powered by Claude — knows your course inside out</p>
                </div>
              </div>
              <div className="cd-empty">
                <div className="cd-empty-icon" style={{ color }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h3>AI Assistant Coming Soon</h3>
                <p>Chat with Claude about {course.course_name}. Ask questions, generate quizzes, get help with assignments, and more.</p>
              </div>
            </div>
          )}

        </main>
      </div>
    </>
  )
}
