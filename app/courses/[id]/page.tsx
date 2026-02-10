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
  
  // Day navigation for Overview tab
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [dailyTasks, setDailyTasks] = useState<any[]>([])

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

  useEffect(() => {
    if (activeTab === 'overview' && semesterPlan?.plan_data?.tasks) {
      filterTasksForDate(selectedDate)
    }
  }, [selectedDate, semesterPlan, activeTab])

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
        
        // For each exam, check if a goal/plan exists
        const examsWithPlanStatus = await Promise.all(
          (examsData || []).map(async (exam) => {
            console.log(`🔍 Checking plan for exam: ${exam.exam_name} (${exam.id})`)
            
            // Check if there's a goal for this exam (by exam_id)
            const { data: goalData, error: goalError } = await supabase
              .from('user_goals')
              .select('id')
              .eq('user_id', user.id)
              .eq('exam_id', exam.id)
              .eq('goal_type', 'exam')
              .maybeSingle()
            
            console.log(`  Goal by exam_id:`, goalData, goalError)
            
            // Also check if goal summary contains exam name (fallback for old goals or if exam_id not set)
            let goalDataFallback = null
            if (!goalData) {
              const { data: fallbackGoal, error: fallbackError } = await supabase
                .from('user_goals')
                .select('id')
                .eq('user_id', user.id)
                .ilike('summary', `%${exam.exam_name}%`)
                .maybeSingle()
              
              console.log(`  Goal by summary:`, fallbackGoal, fallbackError)
              goalDataFallback = fallbackGoal
            }
            
            const finalGoalData = goalData || goalDataFallback
            console.log(`  Final goal data:`, finalGoalData)
            
            // If goal exists, get the first task
            let firstTaskId = null
            if (finalGoalData) {
              const { data: taskData } = await supabase
                .from('task_items')
                .select('id')
                .eq('goal_id', finalGoalData.id)
                .eq('user_id', user.id)
                .order('day_number', { ascending: true })
                .limit(1)
                .maybeSingle()
              
              if (taskData) {
                firstTaskId = taskData.id
              }
            }
            
            return {
              ...exam,
              hasPlan: !!finalGoalData,
              firstTaskId
            }
          })
        )
        
        setExams(examsWithPlanStatus)
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

  // Format date as YYYY-MM-DD
  const formatDateKey = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Filter tasks for selected date
  const filterTasksForDate = (date: Date) => {
    if (!semesterPlan?.plan_data?.tasks) {
      setDailyTasks([])
      return
    }

    const dateKey = formatDateKey(date)
    const tasks = semesterPlan.plan_data.tasks.filter(
      (task: any) => task.scheduled_date_key === dateKey
    )
    setDailyTasks(tasks || [])
  }

  // Navigate between days
  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1))
    setSelectedDate(newDate)
  }

  // Format display date
  const formatDisplayDate = (date: Date) => {
    const today = new Date()
    const isToday = date.toDateString() === today.toDateString()
    
    if (isToday) {
      return {
        label: 'Today',
        value: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      }
    }
    
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const isTomorrow = date.toDateString() === tomorrow.toDateString()
    
    if (isTomorrow) {
      return {
        label: 'Tomorrow',
        value: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      }
    }
    
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = date.toDateString() === yesterday.toDateString()
    
    if (isYesterday) {
      return {
        label: 'Yesterday',
        value: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      }
    }
    
    return {
      label: date.toLocaleDateString('en-US', { weekday: 'long' }),
      value: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
  }

  const calculateProgress = () => {
    if (dailyTasks.length === 0) return 0
    const completed = dailyTasks.filter((t: any) => t.is_completed).length
    return Math.round((completed / dailyTasks.length) * 100)
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
                  {/* Semester Plan Stats */}
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
                  </div>

                  {/* Daily Tasks with Day Navigation */}
                  {semesterPlan.plan_data?.tasks && semesterPlan.plan_data.tasks.length > 0 && (
                    <div className="daily-tasks-section">
                      {/* Date Navigation */}
                      <div className="date-nav">
                        <button className="date-nav-btn" onClick={() => navigateDate('prev')}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="15 18 9 12 15 6"/>
                          </svg>
                          Previous
                        </button>

                        <div className="current-date">
                          <div className="date-label">{formatDisplayDate(selectedDate).label}</div>
                          <div className="date-value">{formatDisplayDate(selectedDate).value}</div>
                        </div>

                        <button className="date-nav-btn" onClick={() => navigateDate('next')}>
                          Next
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="9 18 15 12 9 6"/>
                          </svg>
                        </button>
                      </div>

                      {/* Tasks List */}
                      {dailyTasks.length === 0 ? (
                        <div className="tab-empty">
                          <div className="tab-empty-icon">📅</div>
                          <h3>No Tasks Scheduled</h3>
                          <p>No tasks are scheduled for this day.</p>
                        </div>
                      ) : (
                        <>
                          <div className="tasks-list">
                            {dailyTasks.map((task: any, index: number) => (
                              <div 
                                key={task.id || index} 
                                className="task-card"
                              >
                                <div className="task-header">
                                  <div className="task-icon">
                                    <svg viewBox="0 0 24 24" fill="none">
                                      <polyline points="16 18 22 12 16 6"/>
                                      <polyline points="8 6 2 12 8 18"/>
                                    </svg>
                                  </div>
                                  <div className="task-info">
                                    <h2 className="task-title">{task.title}</h2>
                                    {task.notes && (
                                      <p className="task-description">{task.notes}</p>
                                    )}
                                  </div>
                                </div>

                                <div className="task-meta-row">
                                  <div className="task-meta-item">
                                    <svg viewBox="0 0 24 24" fill="none">
                                      <circle cx="12" cy="12" r="10"/>
                                      <polyline points="12 6 12 12 16 14"/>
                                    </svg>
                                    <span><span className="task-meta-value">{task.estimated_minutes || 0} min</span></span>
                                  </div>
                                  {task.day_number && (
                                    <div className="task-meta-item">
                                      <span className="day-badge">📅 Day {task.day_number}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Progress Bar */}
                          <div className="progress-section">
                            <div className="progress-container">
                              <div className="progress-label-section">
                                <div className="progress-label">Today&apos;s Progress</div>
                                <div className="progress-value">{calculateProgress()}%</div>
                              </div>
                              <div className="progress-bar-wrapper">
                                <div className="progress-bar">
                                  <div 
                                    className="progress-fill" 
                                    style={{ 
                                      width: `${calculateProgress()}%`,
                                      transition: 'width 1s cubic-bezier(0.16, 1, 0.3, 1)'
                                    }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
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
                <>
                  <div className="lectures-list">
                    {lectures.map((lecture) => (
                      <div key={lecture.id} className="lecture-card">
                        <div className="lecture-header">
                          <div>
                            <h3>{lecture.title || `Lecture ${lecture.week_number ? `Week ${lecture.week_number}` : ''}`}</h3>
                            {lecture.lecture_date && (
                              <p className="lecture-date">
                                📅 {new Date(lecture.lecture_date).toLocaleDateString('en-US', { 
                                  weekday: 'long', 
                                  year: 'numeric', 
                                  month: 'long', 
                                  day: 'numeric' 
                                })}
                              </p>
                            )}
                            {lecture.week_number && (
                              <p className="lecture-week">Week {lecture.week_number}</p>
                            )}
                          </div>
                          <div className="lecture-status-badge">
                            {lecture.processing_status === 'completed' && lecture.generated_notes && (
                              <span className="status-completed">✅ Notes Ready</span>
                            )}
                            {lecture.processing_status === 'processing' && (
                              <span className="status-processing">⏳ Processing...</span>
                            )}
                            {lecture.processing_status === 'pending' && !lecture.audio_url && (
                              <span className="status-pending">⏸️ Not Recorded</span>
                            )}
                            {lecture.processing_status === 'pending' && lecture.audio_url && (
                              <span className="status-pending">⏸️ Pending</span>
                            )}
                          </div>
                        </div>
                        <div className="lecture-actions">
                          <Link 
                            href={`/lecture-notes?courseId=${courseId}&lectureId=${lecture.id}`}
                            className="btn-lecture-action"
                          >
                            {lecture.audio_url ? 'View/Edit Notes' : 'Record Lecture'}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="section-footer">
                    <Link 
                      href={`/lecture-notes?courseId=${courseId}`}
                      className="btn-primary"
                    >
                      Record New Lecture
                    </Link>
                  </div>
                </>
              ) : (
                <div className="tab-empty">
                  <div className="tab-empty-icon">🎙️</div>
                  <h3>No Lectures Yet</h3>
                  <p>Lectures will appear here once extracted from your syllabus, or you can record them manually.</p>
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
                <Link 
                  href={`/assignment-helper?courseId=${courseId}`}
                  className="btn-primary-small"
                >
                  Add Assignment
                </Link>
              </div>
              
              {dataLoading ? (
                <div className="tab-loading">
                  <div className="spinner" style={{ width: '32px', height: '32px' }}></div>
                  <p>Loading...</p>
                </div>
              ) : assignments.length > 0 ? (
                <>
                  <div className="assignments-list">
                    {assignments.map((assignment) => (
                      <div key={assignment.id} className="assignment-card">
                        <div className="assignment-header">
                          <div>
                            <h3>{assignment.assignment_name}</h3>
                            {assignment.due_date && (
                              <p className="assignment-due">
                                📅 Due: {new Date(assignment.due_date).toLocaleDateString('en-US', { 
                                  weekday: 'long', 
                                  year: 'numeric', 
                                  month: 'long', 
                                  day: 'numeric' 
                                })}
                              </p>
                            )}
                            {assignment.description && (
                              <p className="assignment-description">{assignment.description}</p>
                            )}
                          </div>
                          <span className={`assignment-status ${assignment.status}`}>
                            {assignment.status?.replace('_', ' ') || 'not started'}
                          </span>
                        </div>
                        <div className="assignment-actions">
                          <Link 
                            href={`/assignment-helper?courseId=${courseId}&assignmentId=${assignment.id}`}
                            className="btn-assignment-action"
                          >
                            {assignment.step_by_step_plan ? 'View Plan' : 'Create Plan'}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="section-footer">
                    <Link 
                      href={`/assignment-helper?courseId=${courseId}`}
                      className="btn-primary"
                    >
                      Add New Assignment
                    </Link>
                  </div>
                </>
              ) : (
                <div className="tab-empty">
                  <div className="tab-empty-icon">📝</div>
                  <h3>No Assignments Yet</h3>
                  <p>Assignments will appear here once extracted from your syllabus, or you can add them manually.</p>
                  <Link 
                    href={`/assignment-helper?courseId=${courseId}`}
                    className="btn-primary"
                  >
                    Add Your First Assignment
                  </Link>
                </div>
              )}
            </div>
          )}

          {activeTab === 'exams' && (
            <div className="tab-panel">
              <div className="tab-panel-header">
                <h2 className="tab-panel-title">Exams</h2>
                <Link 
                  href={`/exam-prep?courseId=${courseId}`}
                  className="btn-primary-small"
                >
                  Add Exam
                </Link>
              </div>
              
              {dataLoading ? (
                <div className="tab-loading">
                  <div className="spinner" style={{ width: '32px', height: '32px' }}></div>
                  <p>Loading...</p>
                </div>
              ) : exams.length > 0 ? (
                <>
                  <div className="exams-list">
                    {exams.map((exam) => (
                      <div key={exam.id} className="exam-card">
                        <div className="exam-header">
                          <div>
                            <h3>{exam.exam_name}</h3>
                            {exam.exam_date && (
                              <p className="exam-date">
                                📅 Date: {new Date(exam.exam_date).toLocaleDateString('en-US', { 
                                  weekday: 'long', 
                                  year: 'numeric', 
                                  month: 'long', 
                                  day: 'numeric' 
                                })}
                              </p>
                            )}
                            {exam.topics && exam.topics.length > 0 && (
                              <div className="exam-topics">
                                <strong>Topics:</strong> {exam.topics.join(', ')}
                              </div>
                            )}
                          </div>
                          <span className={`exam-status ${exam.status}`}>
                            {exam.status?.replace('_', ' ') || 'not started'}
                          </span>
                        </div>
                        <div className="exam-actions">
                          {exam.hasPlan && exam.firstTaskId ? (
                            <Link 
                              href={`/tasks/${exam.firstTaskId}/work`}
                              className="btn-exam-action"
                              style={{
                                background: 'linear-gradient(135deg, var(--primary-purple) 0%, var(--primary-pink) 100%)',
                                color: 'white',
                                fontWeight: 600
                              }}
                            >
                              Start Studying
                            </Link>
                          ) : (
                            <Link 
                              href={`/exam-prep?courseId=${courseId}&examId=${exam.id}`}
                              className="btn-exam-action"
                            >
                              Create Study Plan
                            </Link>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="section-footer">
                    <Link 
                      href={`/exam-prep?courseId=${courseId}`}
                      className="btn-primary"
                    >
                      Add New Exam
                    </Link>
                  </div>
                </>
              ) : (
                <div className="tab-empty">
                  <div className="tab-empty-icon">📚</div>
                  <h3>No Exams Yet</h3>
                  <p>Exams will appear here once extracted from your syllabus, or you can add them manually.</p>
                  <Link 
                    href={`/exam-prep?courseId=${courseId}`}
                    className="btn-primary"
                  >
                    Add Your First Exam
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
