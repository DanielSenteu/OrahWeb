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

export default function CoursesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCourses()
  }, [])

  const loadCourses = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (!error) setCourses(data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const getSemesterDisplay = (course: Course) => {
    if (course.semester && course.year) return `${course.semester} ${course.year}`
    return 'No semester set'
  }

  const getInitials = (name: string) =>
    name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

  if (loading) {
    return (
      <>
        <Navigation />
        <div className="courses-loading-wrap">
          <div className="spinner" />
          <p>Loading your courses…</p>
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
          <div>
            <h1 className="courses-title">My Courses</h1>
            <p className="courses-subtitle">Select a course to get started</p>
          </div>
          <Link href="/courses/new" className="btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Course
          </Link>
        </div>

        {courses.length === 0 ? (
          <div className="courses-empty">
            <div className="courses-empty-icon">📚</div>
            <h2 className="courses-empty-title">No courses yet</h2>
            <p className="courses-empty-text">
              Add your first course to start tracking lectures, assignments, and exams all in one place.
            </p>
            <Link href="/courses/new" className="btn-primary">
              Add Your First Course
            </Link>
          </div>
        ) : (
          <div className="courses-grid">
            {courses.map(course => (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className="course-card"
                style={{ '--course-color': course.color || '#4F46E5' } as React.CSSProperties}
              >
                <div className="course-card-header">
                  <div
                    className="course-icon"
                    style={{ background: `${course.color || '#4F46E5'}18` }}
                  >
                    {getInitials(course.course_name)}
                  </div>
                  <div className="course-card-info">
                    <h3 className="course-card-title">{course.course_name}</h3>
                    {course.professor_name && (
                      <p className="course-card-professor">{course.professor_name}</p>
                    )}
                  </div>
                </div>
                <div className="course-card-footer">
                  <span className="course-card-semester">{getSemesterDisplay(course)}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
