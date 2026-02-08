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
  const [userId, setUserId] = useState<string | null>(null)

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

      setUserId(user.id)

      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading courses:', error)
        return
      }

      setCourses(data || [])
      setLoading(false)
    } catch (error) {
      console.error('Error loading courses:', error)
      setLoading(false)
    }
  }

  const getSemesterDisplay = (course: Course) => {
    if (course.semester && course.year) {
      return `${course.semester} ${course.year}`
    }
    return 'No semester set'
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  if (loading) {
    return (
      <>
        <Navigation />
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '100vh',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div className="spinner" style={{ width: '40px', height: '40px' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading your courses...</p>
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
            <p className="courses-subtitle">Manage all your courses in one place</p>
          </div>
          <Link href="/courses/new" className="btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add Course
          </Link>
        </div>

        {/* Courses Grid */}
        {courses.length === 0 ? (
          <div className="courses-empty">
            <div className="courses-empty-icon">📚</div>
            <h2 className="courses-empty-title">No courses yet</h2>
            <p className="courses-empty-text">
              Get started by adding your first course. You'll be able to track assignments, record lectures, and prepare for exams all in one place.
            </p>
            <Link href="/courses/new" className="btn-primary">
              Add Your First Course
            </Link>
          </div>
        ) : (
          <div className="courses-grid">
            {courses.map((course) => (
              <Link
                key={course.id}
                href={`/courses/${course.id}`}
                className="course-card"
                style={{
                  '--course-color': course.color || '#06B6D4',
                } as React.CSSProperties}
              >
                <div className="course-card-header">
                  <div 
                    className="course-icon"
                    style={{ backgroundColor: `${course.color || '#06B6D4'}20` }}
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
                    <polyline points="9 18 15 12 9 6"></polyline>
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
