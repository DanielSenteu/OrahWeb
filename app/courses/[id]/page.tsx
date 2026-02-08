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

type Tab = 'overview' | 'lectures' | 'assignments' | 'exams'

export default function CourseDashboardPage() {
  const router = useRouter()
  const params = useParams()
  const courseId = params.id as string
  const supabase = createClient()
  
  const [course, setCourse] = useState<Course | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (courseId) {
      loadCourse()
    }
  }, [courseId])

  const loadCourse = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .eq('user_id', user.id)
        .single()

      if (error) {
        console.error('Error loading course:', error)
        router.push('/courses')
        return
      }

      setCourse(data)
      setLoading(false)
    } catch (error) {
      console.error('Error loading course:', error)
      setLoading(false)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getSemesterDisplay = () => {
    if (course?.semester && course?.year) {
      return `${course.semester} ${course.year}`
    }
    return 'No semester set'
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
          <div className="course-error">
            <h2>Course not found</h2>
            <Link href="/courses" className="btn-primary">Back to Courses</Link>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Navigation />
      <div className="course-dashboard-container">
        {/* Course Header */}
        <div className="course-header">
          <div className="course-header-content">
            <Link href="/courses" className="back-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              Back to Courses
            </Link>
            <div className="course-title-section">
              <div 
                className="course-header-icon"
                style={{ backgroundColor: `${course.color || '#06B6D4'}20` }}
              >
                {getInitials(course.course_name)}
              </div>
              <div>
                <h1 className="course-dashboard-title">{course.course_name}</h1>
                {course.professor_name && (
                  <p className="course-professor">{course.professor_name}</p>
                )}
                <p className="course-semester">{getSemesterDisplay()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="course-tabs">
          <button
            className={`course-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`course-tab ${activeTab === 'lectures' ? 'active' : ''}`}
            onClick={() => setActiveTab('lectures')}
          >
            Lectures
          </button>
          <button
            className={`course-tab ${activeTab === 'assignments' ? 'active' : ''}`}
            onClick={() => setActiveTab('assignments')}
          >
            Assignments
          </button>
          <button
            className={`course-tab ${activeTab === 'exams' ? 'active' : ''}`}
            onClick={() => setActiveTab('exams')}
          >
            Exams
          </button>
        </div>

        {/* Tab Content */}
        <div className="course-content">
          {activeTab === 'overview' && (
            <div className="tab-panel">
              <h2 className="tab-panel-title">Course Overview</h2>
              <p className="tab-panel-text">
                This is where the course overview will go. Coming soon!
              </p>
            </div>
          )}

          {activeTab === 'lectures' && (
            <div className="tab-panel">
              <h2 className="tab-panel-title">Lectures</h2>
              <p className="tab-panel-text">
                This is where lectures will be displayed. Coming soon!
              </p>
            </div>
          )}

          {activeTab === 'assignments' && (
            <div className="tab-panel">
              <h2 className="tab-panel-title">Assignments</h2>
              <p className="tab-panel-text">
                This is where assignments will be displayed. Coming soon!
              </p>
            </div>
          )}

          {activeTab === 'exams' && (
            <div className="tab-panel">
              <h2 className="tab-panel-title">Exams</h2>
              <p className="tab-panel-text">
                This is where exams will be displayed. Coming soon!
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
