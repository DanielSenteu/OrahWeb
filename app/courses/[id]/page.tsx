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
  
  // Data for each tab
  const [semesterPlan, setSemesterPlan] = useState<any>(null)
  const [lectures, setLectures] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [exams, setExams] = useState<any[]>([])
  const [dataLoading, setDataLoading] = useState(false)

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
      
      // Load data for active tab
      loadTabData(data.id, activeTab)
    } catch (error) {
      console.error('Error loading course:', error)
      setLoading(false)
    }
  }

  useEffect(() => {
    if (courseId && course) {
      loadTabData(courseId, activeTab)
    }
  }, [activeTab, courseId])

  const loadTabData = async (id: string, tab: Tab) => {
    setDataLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      if (tab === 'overview') {
        // Load semester plan
        const { data: plan } = await supabase
          .from('course_semester_plans')
          .select('*')
          .eq('course_id', id)
          .eq('user_id', user.id)
          .single()
        
        setSemesterPlan(plan)
      } else if (tab === 'lectures') {
        // Load lectures
        const { data: lecturesData } = await supabase
          .from('course_lectures')
          .select('*')
          .eq('course_id', id)
          .eq('user_id', user.id)
          .order('lecture_date', { ascending: false })
        
        setLectures(lecturesData || [])
      } else if (tab === 'assignments') {
        // Load assignments
        const { data: assignmentsData } = await supabase
          .from('course_assignments')
          .select('*')
          .eq('course_id', id)
          .eq('user_id', user.id)
          .order('due_date', { ascending: true })
        
        setAssignments(assignmentsData || [])
      } else if (tab === 'exams') {
        // Load exams
        const { data: examsData } = await supabase
          .from('course_exams')
          .select('*')
          .eq('course_id', id)
          .eq('user_id', user.id)
          .order('exam_date', { ascending: true })
        
        setExams(examsData || [])
      }
    } catch (error) {
      console.error('Error loading tab data:', error)
    } finally {
      setDataLoading(false)
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
              <div className="tab-panel-header">
                <h2 className="tab-panel-title">Course Overview</h2>
                {!semesterPlan && (
                  <Link 
                    href={`/courses/${courseId}/semester-plan`}
                    className="btn-primary-small"
                  >
                    Create Semester Plan
                  </Link>
                )}
              </div>
              
              {dataLoading ? (
                <div className="tab-loading">
                  <div className="spinner" style={{ width: '32px', height: '32px' }}></div>
                  <p>Loading...</p>
                </div>
              ) : semesterPlan ? (
                <div className="overview-content">
                  <div className="overview-card">
                    <h3 className="overview-card-title">Semester Plan</h3>
                    <div className="overview-stats">
                      <div className="stat-item">
                        <div className="stat-label">Study Hours/Day</div>
                        <div className="stat-value">{semesterPlan.study_hours_per_day || 2}h</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-label">Preferred Times</div>
                        <div className="stat-value">
                          {semesterPlan.preferred_study_times?.join(', ') || 'Not set'}
                        </div>
                      </div>
                    </div>
                    {semesterPlan.plan_data?.tasks && semesterPlan.plan_data.tasks.length > 0 && (
                      <div className="overview-tasks">
                        <h4>Daily Tasks</h4>
                        <p>You have {semesterPlan.plan_data.tasks.length} tasks scheduled across your semester plan.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="tab-empty">
                  <div className="tab-empty-icon">📅</div>
                  <h3>No Semester Plan Yet</h3>
                  <p>Create a personalized semester plan to organize your study schedule.</p>
                  <Link 
                    href={`/courses/${courseId}/semester-plan`}
                    className="btn-primary"
                  >
                    Create Semester Plan
                  </Link>
                </div>
              )}
            </div>
          )}

          {activeTab === 'lectures' && (
            <div className="tab-panel">
              <div className="tab-panel-header">
                <h2 className="tab-panel-title">Lectures</h2>
                <Link 
                  href={`/lecture-notes?courseId=${courseId}`}
                  className="btn-primary-small"
                >
                  Record Lecture
                </Link>
              </div>
              
              {dataLoading ? (
                <div className="tab-loading">
                  <div className="spinner" style={{ width: '32px', height: '32px' }}></div>
                  <p>Loading...</p>
                </div>
              ) : lectures.length > 0 ? (
                <div className="lectures-list">
                  {lectures.map((lecture) => (
                    <div key={lecture.id} className="lecture-card">
                      <div className="lecture-header">
                        <h3>{lecture.title || `Lecture ${lecture.week_number ? `Week ${lecture.week_number}` : ''}`}</h3>
                        {lecture.lecture_date && (
                          <span className="lecture-date">
                            {new Date(lecture.lecture_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {lecture.processing_status === 'completed' && lecture.generated_notes && (
                        <p className="lecture-status">✅ Notes generated</p>
                      )}
                      {lecture.processing_status === 'processing' && (
                        <p className="lecture-status">⏳ Processing...</p>
                      )}
                      {lecture.processing_status === 'pending' && (
                        <p className="lecture-status">⏸️ Pending</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="tab-empty">
                  <div className="tab-empty-icon">🎙️</div>
                  <h3>No Lectures Yet</h3>
                  <p>Start recording your lectures to generate organized notes automatically.</p>
                  <Link 
                    href={`/lecture-notes?courseId=${courseId}`}
                    className="btn-primary"
                  >
                    Record Your First Lecture
                  </Link>
                </div>
              )}
            </div>
          )}

          {activeTab === 'assignments' && (
            <div className="tab-panel">
              <div className="tab-panel-header">
                <h2 className="tab-panel-title">Assignments</h2>
                <button className="btn-primary-small">
                  Add Assignment
                </button>
              </div>
              
              {dataLoading ? (
                <div className="tab-loading">
                  <div className="spinner" style={{ width: '32px', height: '32px' }}></div>
                  <p>Loading...</p>
                </div>
              ) : assignments.length > 0 ? (
                <div className="assignments-list">
                  {assignments.map((assignment) => (
                    <div key={assignment.id} className="assignment-card">
                      <div className="assignment-header">
                        <h3>{assignment.assignment_name}</h3>
                        <span className={`assignment-status ${assignment.status}`}>
                          {assignment.status}
                        </span>
                      </div>
                      {assignment.due_date && (
                        <p className="assignment-due">
                          Due: {new Date(assignment.due_date).toLocaleDateString()}
                        </p>
                      )}
                      {assignment.description && (
                        <p className="assignment-description">{assignment.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="tab-empty">
                  <div className="tab-empty-icon">📝</div>
                  <h3>No Assignments Yet</h3>
                  <p>Add assignments to get step-by-step completion plans.</p>
                  <button className="btn-primary">
                    Add Your First Assignment
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'exams' && (
            <div className="tab-panel">
              <div className="tab-panel-header">
                <h2 className="tab-panel-title">Exams</h2>
                <button className="btn-primary-small">
                  Add Exam
                </button>
              </div>
              
              {dataLoading ? (
                <div className="tab-loading">
                  <div className="spinner" style={{ width: '32px', height: '32px' }}></div>
                  <p>Loading...</p>
                </div>
              ) : exams.length > 0 ? (
                <div className="exams-list">
                  {exams.map((exam) => (
                    <div key={exam.id} className="exam-card">
                      <div className="exam-header">
                        <h3>{exam.exam_name}</h3>
                        <span className={`exam-status ${exam.status}`}>
                          {exam.status}
                        </span>
                      </div>
                      {exam.exam_date && (
                        <p className="exam-date">
                          Date: {new Date(exam.exam_date).toLocaleDateString()}
                        </p>
                      )}
                      {exam.topics && exam.topics.length > 0 && (
                        <div className="exam-topics">
                          <strong>Topics:</strong> {exam.topics.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="tab-empty">
                  <div className="tab-empty-icon">📚</div>
                  <h3>No Exams Yet</h3>
                  <p>Add exams to get personalized study plans with spaced repetition.</p>
                  <button className="btn-primary">
                    Add Your First Exam
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
