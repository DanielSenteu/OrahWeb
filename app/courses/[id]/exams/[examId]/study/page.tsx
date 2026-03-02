'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Navigation from '@/components/layout/Navigation'
import '../study-dashboard.css'

interface Exam {
  id: string
  exam_name: string
  exam_date: string | null
  topics: string[] | null
}

interface Task {
  id: string
  title: string
  day_number: number
  scheduled_date_key: string
  is_completed: boolean
  estimated_minutes: number
}

interface DayGroup {
  dayNumber: number
  dateKey: string
  dateLabel: string
  tasks: Task[]
}

function extractTopicFromTitle(title: string): string {
  const patterns = [
    /Study:\s*(.+)/i,
    /Study\s+(.+)/i,
    /^(.+?)\s*-\s*Core\s+Concepts/i,
    /^(.+?)\s*-\s*Practice/i,
    /^(.+?)\s*:\s*Core/i,
  ]
  for (const pattern of patterns) {
    const match = title.match(pattern)
    if (match) return match[1].trim()
  }
  return title.replace(/^Study\s*/i, '').trim() || 'General'
}

export default function ExamStudyDashboardPage() {
  const router = useRouter()
  const params = useParams()
  const courseId = params.id as string
  const examId = params.examId as string
  const supabase = createClient()

  const [exam, setExam] = useState<Exam | null>(null)
  const [courseName, setCourseName] = useState<string>('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedDay, setExpandedDay] = useState<number | null>(null)
  const [topicNotes, setTopicNotes] = useState<Record<string, { loading?: boolean; data?: any; error?: string }>>({})
  const [generatingTopic, setGeneratingTopic] = useState<string | null>(null)

  useEffect(() => {
    if (courseId && examId) loadData()
  }, [courseId, examId])

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: course } = await supabase
        .from('courses')
        .select('course_name')
        .eq('id', courseId)
        .eq('user_id', user.id)
        .single()
      if (course) setCourseName(course.course_name)

      const { data: examData, error: examErr } = await supabase
        .from('course_exams')
        .select('id, exam_name, exam_date, topics')
        .eq('id', examId)
        .eq('user_id', user.id)
        .single()

      if (examErr || !examData) {
        router.push(`/courses/${courseId}`)
        return
      }
      setExam(examData)

      const { data: goal } = await supabase
        .from('user_goals')
        .select('id')
        .eq('user_id', user.id)
        .eq('exam_id', examId)
        .maybeSingle()

      let goalId = goal?.id
      if (!goalId) {
        const { data: fallback } = await supabase
          .from('user_goals')
          .select('id')
          .eq('user_id', user.id)
          .ilike('summary', `%${examData.exam_name}%`)
          .maybeSingle()
        goalId = fallback?.id
      }

      if (!goalId) {
        setTasks([])
        setLoading(false)
        return
      }

      const { data: tasksData } = await supabase
        .from('task_items')
        .select('id, title, day_number, scheduled_date_key, is_completed, estimated_minutes')
        .eq('goal_id', goalId)
        .eq('user_id', user.id)
        .order('day_number', { ascending: true })

      setTasks(tasksData || [])
    } catch (error) {
      console.error('Error loading exam study data:', error)
      router.push(`/courses/${courseId}`)
    } finally {
      setLoading(false)
    }
  }

  const groupTasksByDay = (): DayGroup[] => {
    const groups: Record<string, Task[]> = {}
    for (const task of tasks) {
      const key = `${task.day_number}|${task.scheduled_date_key}`
      if (!groups[key]) groups[key] = []
      groups[key].push(task)
    }
    return Object.entries(groups)
      .map(([key, dayTasks]) => {
        const [dayNumStr, dateKey] = key.split('|')
        const dayNumber = parseInt(dayNumStr, 10)
        const date = dateKey ? new Date(dateKey + 'T12:00:00') : new Date()
        const today = new Date()
        const isToday = date.toDateString() === today.toDateString()
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        const isTomorrow = date.toDateString() === tomorrow.toDateString()
        let dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
        if (isToday) dateLabel = 'Today · ' + dateLabel
        else if (isTomorrow) dateLabel = 'Tomorrow · ' + dateLabel
        return { dayNumber, dateKey, dateLabel, tasks: dayTasks }
      })
      .sort((a, b) => a.dayNumber - b.dayNumber)
  }

  async function loadNotesForTopic(topic: string) {
    if (topicNotes[topic]?.data) return

    setTopicNotes(prev => ({ ...prev, [topic]: { loading: true } }))
    setGeneratingTopic(topic)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch('/api/exam/topic-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ examId, topic }),
      })

      const data = await res.json()

      if (!res.ok) {
        setTopicNotes(prev => ({ ...prev, [topic]: { error: data.error || 'Failed to load notes' } }))
        return
      }

      setTopicNotes(prev => ({
        ...prev,
        [topic]: { data: { structuredNotes: data.structuredNotes, preparedNotes: data.preparedNotes } },
      }))
    } catch (error: any) {
      setTopicNotes(prev => ({ ...prev, [topic]: { error: error.message || 'Failed to load notes' } }))
    } finally {
      setGeneratingTopic(null)
    }
  }

  const dayGroups = groupTasksByDay()

  if (loading) {
    return (
      <>
        <Navigation />
        <div className="study-dashboard-loading">
          <div className="spinner" />
          <p>Loading your study plan...</p>
        </div>
      </>
    )
  }

  if (!exam) return null

  return (
    <>
      <Navigation />
      <div className="study-dashboard">
        <div className="study-dashboard-header">
          <Link href={`/courses/${courseId}`} className="study-back-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Course
          </Link>
          <div className="study-title-section">
            <h1 className="study-title">{exam.exam_name}</h1>
            <p className="study-meta">
              {courseName && courseName + ' · '}
              {exam.exam_date
                ? 'Exam: ' + new Date(exam.exam_date).toLocaleDateString('en-US', {
                    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                  })
                : 'Study Plan'}
            </p>
          </div>
        </div>

        <div className="study-days">
          {dayGroups.length === 0 ? (
            <div className="study-empty">
              <p>No study tasks yet. Create a study plan from the exam prep flow.</p>
              <Link href={`/exam-prep?courseId=${courseId}&examId=${examId}`} className="btn-primary">
                Create Study Plan
              </Link>
            </div>
          ) : (
            dayGroups.map((day) => (
              <div
                key={`${day.dayNumber}-${day.dateKey}`}
                className={`study-day-card ${expandedDay === day.dayNumber ? 'expanded' : ''}`}
              >
                <div
                  className="study-day-header"
                  onClick={() => setExpandedDay(expandedDay === day.dayNumber ? null : day.dayNumber)}
                >
                  <div className="study-day-badge">Day {day.dayNumber}</div>
                  <span className="study-day-date">{day.dateLabel}</span>
                  <div className="study-day-stats">
                    {day.tasks.filter(t => t.is_completed).length} / {day.tasks.length} completed
                  </div>
                  <svg className="study-day-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>

                {expandedDay === day.dayNumber && (
                  <div className="study-day-content">
                    {day.tasks.map((task) => {
                      const topic = extractTopicFromTitle(task.title)
                      const notesState = topicNotes[topic]
                      const isGenerating = generatingTopic === topic

                      return (
                        <div key={task.id} className="study-task-card">
                          <div className="study-task-header">
                            <div>
                              <h3 className="study-task-title">{task.title}</h3>
                              <span className="study-task-meta">
                                ~{task.estimated_minutes} min
                                {task.is_completed && ' · Done'}
                              </span>
                            </div>
                            <div className="study-task-actions">
                              <button
                                className="btn-notes"
                                onClick={(e) => { e.stopPropagation(); loadNotesForTopic(topic) }}
                                disabled={isGenerating}
                              >
                                {isGenerating ? '...' : notesState?.data ? 'Notes' : 'View Notes'}
                              </button>
                              <Link
                                href={`/exam/quiz/${examId}/${encodeURIComponent(topic)}`}
                                className="btn-quiz"
                              >
                                Take Quiz
                              </Link>
                              <Link href={`/tasks/${task.id}/work`} className="btn-work">
                                Work on Task
                              </Link>
                            </div>
                          </div>

                          {notesState?.data && (
                            <div className="study-notes-panel">
                              <div className="notes-content">
                                {notesState.data.structuredNotes && (
                                  <>
                                    <h4>{notesState.data.structuredNotes.title || 'Notes: ' + topic}</h4>
                                    {notesState.data.structuredNotes.summary && (
                                      <div className="notes-summary">
                                        <strong>Overview:</strong> {notesState.data.structuredNotes.summary}
                                      </div>
                                    )}
                                    {notesState.data.structuredNotes.sections?.map((section: any, idx: number) => (
                                      <div key={idx} className="notes-section">
                                        <h5>{section.title}</h5>
                                        <ul>
                                          {section.content?.map((point: string, pIdx: number) => (
                                            <li key={pIdx}>{point}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    ))}
                                    {notesState.data.structuredNotes.definitions?.length > 0 && (
                                      <div className="notes-definitions">
                                        <h5>Key Definitions</h5>
                                        {notesState.data.structuredNotes.definitions.map((def: any, idx: number) => (
                                          <div key={idx} className="definition-item">
                                            <strong>{def.term}:</strong> {def.definition}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                          {notesState?.error && (
                            <div className="study-notes-error">{notesState.error}</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
