'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/layout/Navigation'
import Link from 'next/link'
import './courses.css'

interface Course {
  id: string
  course_name: string
  professor_name: string | null
  semester: string | null
  year: number | null
  color: string
  created_at: string
}

interface DeadlineInfo {
  label: string
  daysUntil: number
  type: 'assignment' | 'exam'
  urgent: boolean
}

export default function CoursesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [courses, setCourses] = useState<Course[]>([])
  const [deadlines, setDeadlines] = useState<Record<string, DeadlineInfo[]>>({})
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({})
  const [examCounts, setExamCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [weekDeadlineCount, setWeekDeadlineCount] = useState(0)

  useEffect(() => { loadCourses() }, [])

  const getGreeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const loadCourses = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const raw = user.email?.split('@')[0] || ''
      setUserName(raw.charAt(0).toUpperCase() + raw.slice(1))

      const { data: coursesData, error } = await supabase
        .from('courses').select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      const courseList: Course[] = coursesData || []
      setCourses(courseList)
      if (courseList.length === 0) { setLoading(false); return }

      const courseIds = courseList.map(c => c.id)
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const todayStr = today.toISOString().split('T')[0]

      const [{ data: assignments }, { data: exams }] = await Promise.all([
        supabase.from('course_assignments')
          .select('course_id, assignment_name, due_date')
          .in('course_id', courseIds).eq('user_id', user.id)
          .neq('status', 'completed').gte('due_date', todayStr)
          .order('due_date', { ascending: true }),
        supabase.from('course_exams')
          .select('course_id, exam_name, exam_date')
          .in('course_id', courseIds).eq('user_id', user.id)
          .neq('status', 'completed').gte('exam_date', todayStr)
          .order('exam_date', { ascending: true }),
      ])

      const deadlineMap: Record<string, DeadlineInfo[]> = {}
      const aCount: Record<string, number> = {}
      const eCount: Record<string, number> = {}
      let weekCount = 0

      for (const a of (assignments || [])) {
        if (!deadlineMap[a.course_id]) deadlineMap[a.course_id] = []
        aCount[a.course_id] = (aCount[a.course_id] || 0) + 1
        const days = Math.ceil((new Date(a.due_date).getTime() - today.getTime()) / 86400000)
        if (days <= 7) weekCount++
        deadlineMap[a.course_id].push({ label: a.assignment_name, daysUntil: days, type: 'assignment', urgent: days <= 3 })
      }
      for (const e of (exams || [])) {
        if (!deadlineMap[e.course_id]) deadlineMap[e.course_id] = []
        eCount[e.course_id] = (eCount[e.course_id] || 0) + 1
        const days = Math.ceil((new Date(e.exam_date).getTime() - today.getTime()) / 86400000)
        if (days <= 7) weekCount++
        deadlineMap[e.course_id].push({ label: e.exam_name, daysUntil: days, type: 'exam', urgent: days <= 3 })
      }
      for (const id in deadlineMap) {
        deadlineMap[id].sort((a, b) => a.daysUntil - b.daysUntil)
      }

      setDeadlines(deadlineMap)
      setAssignmentCounts(aCount)
      setExamCounts(eCount)
      setWeekDeadlineCount(weekCount)
      setLoading(false)
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  const getInitials = (name: string) =>
    name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  const formatDays = (d: DeadlineInfo) => {
    if (d.daysUntil === 0) return 'Today'
    if (d.daysUntil === 1) return 'Tomorrow'
    return `${d.daysUntil}d`
  }

  const totalExams = Object.values(examCounts).reduce((s, n) => s + n, 0)

  if (loading) return (
    <>
      <Navigation />
      <div className="courses-loading">
        <div className="spinner" style={{ width: 40, height: 40 }} />
        <p>Loading your courses…</p>
      </div>
    </>
  )

  return (
    <>
      <Navigation />
      <div className="courses-page">

        {/* Hero */}
        <div className="courses-hero">
          <div className="courses-hero-left">
            <p className="courses-greeting">{getGreeting()}{userName ? `, ${userName}` : ''}</p>
            <h1 className="courses-title">My Courses</h1>
          </div>

          <div className="courses-hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-value">{courses.length}</div>
              <div className="hero-stat-label">Courses</div>
            </div>
            <div className="hero-stat-divider" />
            <div className={`hero-stat ${weekDeadlineCount > 0 ? 'urgent' : ''}`}>
              <div className="hero-stat-value">{weekDeadlineCount}</div>
              <div className="hero-stat-label">Due This Week</div>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <div className="hero-stat-value">{totalExams}</div>
              <div className="hero-stat-label">Exams</div>
            </div>
          </div>

          <Link href="/courses/new" className="btn-add-course">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Course
          </Link>
        </div>

        {/* Content */}
        {courses.length === 0 ? (
          <div className="courses-empty">
            <div className="courses-empty-graphic">
              <svg viewBox="0 0 120 120" fill="none">
                <circle cx="60" cy="60" r="60" fill="rgba(6,182,212,0.06)" />
                <rect x="30" y="35" width="60" height="50" rx="8" fill="rgba(6,182,212,0.1)" stroke="rgba(6,182,212,0.3)" strokeWidth="1.5" />
                <line x1="42" y1="52" x2="78" y2="52" stroke="rgba(6,182,212,0.4)" strokeWidth="2" strokeLinecap="round" />
                <line x1="42" y1="62" x2="70" y2="62" stroke="rgba(6,182,212,0.25)" strokeWidth="2" strokeLinecap="round" />
                <line x1="42" y1="72" x2="65" y2="72" stroke="rgba(6,182,212,0.15)" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="courses-empty-title">Start your semester</h2>
            <p className="courses-empty-text">
              Add your first course to track assignments, record lectures, prep for exams, and get an AI assistant that knows your syllabus inside out.
            </p>
            <Link href="/courses/new" className="btn-add-course-lg">Add Your First Course</Link>
          </div>
        ) : (
          <div className="courses-grid">
            {courses.map((course) => {
              const list = deadlines[course.id] || []
              const next = list[0] || null
              const ac = assignmentCounts[course.id] || 0
              const ec = examCounts[course.id] || 0
              const color = course.color || '#06B6D4'

              return (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  className="course-card"
                  style={{ '--course-color': color } as React.CSSProperties}
                >
                  {/* Left accent bar */}
                  <div className="course-card-bar" style={{ background: color }} />

                  {/* Top */}
                  <div className="course-card-top" style={{ background: `linear-gradient(135deg, ${color}18, ${color}06)` }}>
                    <div className="course-card-icon" style={{ background: `${color}22`, color }}>
                      {getInitials(course.course_name)}
                    </div>
                    {next && (
                      <div className={`deadline-chip ${next.urgent ? 'urgent' : ''}`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        {formatDays(next)}
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div className="course-card-body">
                    <h3 className="course-card-name">{course.course_name}</h3>
                    {course.professor_name && (
                      <p className="course-card-prof">{course.professor_name}</p>
                    )}
                    {next ? (
                      <p className="course-card-next">
                        <span className={`next-dot ${next.type}`} />
                        <span className="next-type">{next.type === 'assignment' ? 'Assignment' : 'Exam'}:</span>
                        <span className="next-label">{next.label}</span>
                      </p>
                    ) : (
                      <p className="course-card-clear">No upcoming deadlines</p>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="course-card-footer">
                    <div className="course-chips">
                      {ac > 0 && (
                        <span className="c-chip">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          {ac}
                        </span>
                      )}
                      {ec > 0 && (
                        <span className="c-chip exam">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                          </svg>
                          {ec}
                        </span>
                      )}
                      {course.semester && course.year && (
                        <span className="c-chip muted">{course.semester} {course.year}</span>
                      )}
                    </div>
                    <svg className="course-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
