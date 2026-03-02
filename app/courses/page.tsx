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

interface CourseStats {
  assignments: number
  exams: number
  lectures: number
}

const COURSE_COLORS = [
  '#06B6D4', // cyan
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#F59E0B', // amber
  '#10B981', // emerald
  '#3B82F6', // blue
  '#EF4444', // red
  '#14B8A6', // teal
]

export default function CoursesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [courses, setCourses] = useState<Course[]>([])
  const [statsMap, setStatsMap] = useState<Record<string, CourseStats>>({})
  const [loading, setLoading] = useState(true)
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null)

  useEffect(() => {
    loadCourses()
  }, [])

  const loadCourses = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading courses:', error)
        setLoading(false)
        return
      }

      setCourses(data || [])

      // Load stats for each course in parallel
      if (data && data.length > 0) {
        const statsEntries = await Promise.all(
          data.map(async (course) => {
            const [assignRes, examRes, lectureRes] = await Promise.all([
              supabase.from('course_assignments').select('id', { count: 'exact', head: true }).eq('course_id', course.id),
              supabase.from('course_exams').select('id', { count: 'exact', head: true }).eq('course_id', course.id),
              supabase.from('course_lectures').select('id', { count: 'exact', head: true }).eq('course_id', course.id),
            ])
            return [course.id, {
              assignments: assignRes.count ?? 0,
              exams: examRes.count ?? 0,
              lectures: lectureRes.count ?? 0,
            }] as [string, CourseStats]
          })
        )
        setStatsMap(Object.fromEntries(statsEntries))
      }

      setLoading(false)
    } catch (error) {
      console.error('Error loading courses:', error)
      setLoading(false)
    }
  }

  const handleDeleteCourse = async (id: string) => {
    const { error } = await supabase.from('courses').delete().eq('id', id)
    if (!error) {
      setCourses(prev => prev.filter(c => c.id !== id))
      setStatsMap(prev => { const next = { ...prev }; delete next[id]; return next })
    }
    setDeletingCourseId(null)
  }

  const getSemesterDisplay = (course: Course) => {
    if (course.semester && course.year) return `${course.semester} ${course.year}`
    if (course.semester) return course.semester
    return null
  }

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

  const getCourseColor = (course: Course, index: number) =>
    course.color || COURSE_COLORS[index % COURSE_COLORS.length]

  if (loading) {
    return (
      <>
        <Navigation />
        <div className="courses-loading">
          <div className="spinner" style={{ width: '36px', height: '36px' }}></div>
          <p>Loading your courses...</p>
        </div>
      </>
    )
  }

  return (
    <>
      <Navigation />
      <div className="courses-container">
        {/* Header */}
        <div className="courses-header">
          <div className="courses-header-left">
            <h1 className="courses-title">My Courses</h1>
            <p className="courses-subtitle">
              {courses.length > 0
                ? `${courses.length} course${courses.length !== 1 ? 's' : ''} this semester`
                : 'Add your first course to get started'}
            </p>
          </div>
          <Link href="/courses/new" className="btn-add-course">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add Course
          </Link>
        </div>

        {courses.length === 0 ? (
          <div className="courses-empty">
            <div className="courses-empty-visual">
              <div className="courses-empty-icon-ring">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </div>
            </div>
            <h2 className="courses-empty-title">No courses yet</h2>
            <p className="courses-empty-text">
              Add your courses and upload your syllabus — Orah will extract all your assignments, exams, and class times automatically.
            </p>
            <Link href="/courses/new" className="btn-add-course">
              Add Your First Course
            </Link>
          </div>
        ) : (
          <div className="courses-grid">
            {courses.map((course, index) => {
              const color = getCourseColor(course, index)
              const stats = statsMap[course.id]
              const semester = getSemesterDisplay(course)
              return (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  className="course-card"
                  style={{ '--course-color': color } as React.CSSProperties}
                  onClick={(e) => { if (deletingCourseId === course.id) e.preventDefault() }}
                >
                  {/* Top accent bar */}
                  <div className="course-card-accent" />

                  {/* Delete button */}
                  <div
                    className="course-card-delete-wrap"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
                  >
                    {deletingCourseId === course.id ? (
                      <div className="course-card-confirm">
                        <span>Delete?</span>
                        <button className="course-confirm-yes" onClick={() => handleDeleteCourse(course.id)}>Yes</button>
                        <button className="course-confirm-no" onClick={() => setDeletingCourseId(null)}>No</button>
                      </div>
                    ) : (
                      <button
                        className="course-card-delete-btn"
                        onClick={() => setDeletingCourseId(course.id)}
                        title="Delete course"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4h6v2" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Icon + Title */}
                  <div className="course-card-top">
                    <div className="course-icon" style={{ background: `${color}22`, color }}>
                      {getInitials(course.course_name)}
                    </div>
                    <div className="course-card-meta">
                      {semester && <span className="course-semester-tag">{semester}</span>}
                    </div>
                  </div>

                  <h3 className="course-card-name">{course.course_name}</h3>
                  {course.professor_name && (
                    <p className="course-card-prof">{course.professor_name}</p>
                  )}

                  {/* Stats row */}
                  <div className="course-card-stats">
                    <div className="course-stat">
                      <span className="course-stat-num" style={{ color }}>
                        {stats?.assignments ?? '—'}
                      </span>
                      <span className="course-stat-label">assignments</span>
                    </div>
                    <div className="course-stat-sep" />
                    <div className="course-stat">
                      <span className="course-stat-num" style={{ color }}>
                        {stats?.exams ?? '—'}
                      </span>
                      <span className="course-stat-label">exams</span>
                    </div>
                    <div className="course-stat-sep" />
                    <div className="course-stat">
                      <span className="course-stat-num" style={{ color }}>
                        {stats?.lectures ?? '—'}
                      </span>
                      <span className="course-stat-label">lectures</span>
                    </div>
                  </div>

                  <div className="course-card-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </Link>
              )
            })}

            {/* Ghost "add" card */}
            <Link href="/courses/new" className="course-card-add">
              <div className="course-add-inner">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add Course</span>
              </div>
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
