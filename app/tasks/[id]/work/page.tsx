'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import './work-session.css'

interface Task {
  id: string
  title: string
  notes: string | null
  estimated_minutes: number
  deliverable: string | null
  metric: string | null
  is_completed: boolean
  goal_id: string
  user_id: string
  total_time_worked_seconds?: number | null
}

interface Checkpoint {
  id: string
  content: string
  is_completed: boolean
  position: number
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface TimerState {
  timeRemaining: number // seconds
  totalTimeWorked: number // seconds
  continuousWorkTime: number // seconds since last break
  isRunning: boolean
  isOnBreak: boolean
  breakTimeRemaining: number // seconds
}

const WORK_INTERVAL = 25 * 60 // 25 minutes
const BREAK_DURATION = 5 * 60 // 5 minutes

export default function TaskWorkSessionPage() {
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [task, setTask] = useState<Task | null>(null)
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [showChat, setShowChat] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [showEndEarlyModal, setShowEndEarlyModal] = useState(false)
  const [endEarlyMode, setEndEarlyMode] = useState<'endTask' | 'leave'>('endTask')
  const [documentText, setDocumentText] = useState<string | null>(null)
  
  // Exam-related state
  const [isExamTask, setIsExamTask] = useState(false)
  const [examId, setExamId] = useState<string | null>(null)
  const [examTopic, setExamTopic] = useState<string | null>(null)
  const [examNotes, setExamNotes] = useState<string | null>(null)
  const [structuredNotes, setStructuredNotes] = useState<any>(null)
  const [loadingExamData, setLoadingExamData] = useState(false)
  const [generatingNotes, setGeneratingNotes] = useState(false)

  const [timerState, setTimerState] = useState<TimerState>({
    timeRemaining: 0,
    totalTimeWorked: 0,
    continuousWorkTime: 0,
    isRunning: false,
    isOnBreak: false,
    breakTimeRemaining: 0,
  })

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const hasPersistedTimerRef = useRef(false)
  const hasHydratedTimerRef = useRef(false)
  const timerStateRef = useRef<TimerState>(timerState) // Always keep latest timer state

  useEffect(() => {
    hasPersistedTimerRef.current = false
    hasHydratedTimerRef.current = false
    loadChatState()
    loadTask()
    return () => {
      // Save on unmount
      const currentTimer = timerStateRef.current
      if (currentTimer.timeRemaining > 0 || currentTimer.totalTimeWorked > 0) {
        localStorage.setItem(`timer_${taskId}`, JSON.stringify(currentTimer))
        console.log('Cleanup save:', currentTimer.timeRemaining, 'remaining')
      }
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [taskId])

  // Always keep ref in sync with state
  useEffect(() => {
    timerStateRef.current = timerState
  }, [timerState])

  useEffect(() => {
    if (!hasHydratedTimerRef.current) return
    saveTimerState()
  }, [timerState, taskId])

  useEffect(() => {
    const handleBeforeUnload = () => {
      // Use ref for latest state
      const currentTimer = timerStateRef.current
      if (currentTimer.timeRemaining > 0 || currentTimer.totalTimeWorked > 0) {
        localStorage.setItem(`timer_${taskId}`, JSON.stringify(currentTimer))
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [taskId])

  // Persist to DB every 30s, localStorage every 10s while running
  useEffect(() => {
    if (!timerState.isRunning) return
    
    // Save to localStorage every 10 seconds
    const localInterval = setInterval(() => {
      const current = timerStateRef.current
      localStorage.setItem(`timer_${taskId}`, JSON.stringify(current))
    }, 10000)
    
    // Save to DB every 30 seconds
    const dbInterval = setInterval(async () => {
      const currentWorked = timerStateRef.current.totalTimeWorked
      if (currentWorked > 0) {
        try {
          await supabase
            .from('task_items')
            .update({ total_time_worked_seconds: currentWorked })
            .eq('id', taskId)
        } catch (e) {
          console.error('DB persist error:', e)
        }
      }
    }, 30000)
    
    return () => {
      clearInterval(localInterval)
      clearInterval(dbInterval)
    }
  }, [timerState.isRunning, taskId, supabase])

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Load exam data if this is an exam task
  useEffect(() => {
    if (!task?.goal_id) return

    const checkAndLoadExamData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Check if this goal is an exam
        const { data: goalData, error: goalError } = await supabase
          .from('user_goals')
          .select('goal_type, exam_id, summary')
          .eq('id', task.goal_id)
          .maybeSingle()

        console.log('🔍 Checking if task is exam:', { goalId: task.goal_id, goalData, goalError })

        // Check if it's an exam task (by goal_type OR by summary containing "Exam:")
        const isExamGoal = goalData?.goal_type === 'exam' || (goalData?.summary && goalData.summary.toLowerCase().startsWith('exam:'))
        
        if (isExamGoal) {
          console.log('✅ Exam task detected:', { examId: goalData?.exam_id, goalType: goalData?.goal_type, summary: goalData?.summary })
          setIsExamTask(true)
          
          // Try to get exam_id from goal, or find exam by matching summary
          let examIdToUse = goalData?.exam_id
          
          if (!examIdToUse && goalData?.summary) {
            // Extract exam name from summary (e.g., "Exam: RAT Quiz #1" -> "RAT Quiz #1")
            const examNameMatch = goalData.summary.match(/Exam:\s*(.+)/i)
            if (examNameMatch) {
              const examName = examNameMatch[1].trim()
              // Try to find exam by name
              const { data: examMatch } = await supabase
                .from('course_exams')
                .select('id')
                .eq('user_id', user.id)
                .ilike('exam_name', `%${examName}%`)
                .limit(1)
                .maybeSingle()
              
              if (examMatch) {
                examIdToUse = examMatch.id
                console.log('✅ Found exam by name match:', examIdToUse)
              }
            }
          }
          
          if (examIdToUse) {
            setExamId(examIdToUse)
          }
          
          setLoadingExamData(true)

          // Get exam details to find the topic
          let examData = null
          if (examIdToUse) {
            const { data: exam } = await supabase
              .from('course_exams')
              .select('exam_name, topics')
              .eq('id', examIdToUse)
              .eq('user_id', user.id)
              .maybeSingle()
            
            examData = exam
          }

          // Extract topic from task title (multiple patterns)
          let topic = null
          const titlePatterns = [
            /Study:\s*(.+)/i,
            /Study\s+(.+)/i,
            /^(.+?)\s*-\s*Core\s+Concepts/i,
            /^(.+?)\s*-\s*Practice/i,
            /^(.+?)\s*:\s*Core/i
          ]
          
          for (const pattern of titlePatterns) {
            const match = task.title.match(pattern)
            if (match) {
              topic = match[1].trim()
              break
            }
          }
          
          // If no topic from title, try from exam topics or use task title
          if (!topic) {
            topic = examData?.topics?.[0] || task.title.replace(/^Study\s*/i, '').trim() || null
          }

          if (topic) {
            console.log('✅ Exam topic set:', topic)
            setExamTopic(topic)

              // Get documents for this exam (if examId is available)
              let documents = null
              if (examIdToUse) {
                const { data: docs } = await supabase
                  .from('exam_documents')
                  .select('document_name, extracted_text, topics')
                  .eq('exam_id', examIdToUse)
                  .eq('user_id', user.id)
                
                documents = docs
              }

              // Get relevant documents for this topic
              const relevantDocs = documents
                ?.filter(d => 
                  !d.topics || 
                  d.topics.length === 0 || 
                  d.topics.some((t: string) => 
                    t.toLowerCase().includes(topic.toLowerCase()) ||
                    topic.toLowerCase().includes(t.toLowerCase())
                  )
                ) || []

              // Prepare notes (chunk + summarize if needed)
              if (relevantDocs && relevantDocs.length > 0) {
                try {
                  const { data: { session } } = await supabase.auth.getSession()
                  if (session) {
                    // Prepare documents for API
                    const docsForAPI = relevantDocs.map(d => ({
                      name: d.document_name || 'Document',
                      text: d.extracted_text || '',
                    }))

                    // Call prepare-topic-notes API to chunk and summarize if needed
                    const prepareRes = await fetch('/api/exam/prepare-topic-notes', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`,
                      },
                      body: JSON.stringify({
                        documents: docsForAPI,
                        topic: topic,
                      }),
                    })

                    if (prepareRes.ok) {
                      const prepareData = await prepareRes.json()
                      const preparedNotes = prepareData.preparedNotes
                      setExamNotes(preparedNotes)
                      console.log(`📝 Notes prepared: ${prepareData.wasSummarized ? 'Summarized' : 'Used as-is'} (${prepareData.originalTokens} → ${prepareData.finalTokens} tokens)`)

                      // Generate structured notes if we have content
                      if (preparedNotes && preparedNotes.length > 100) {
                        setGeneratingNotes(true)
                        try {
                          const notesRes = await fetch('/api/exam/generate-notes', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              Authorization: `Bearer ${session.access_token}`,
                            },
                            body: JSON.stringify({
                              examId: examIdToUse,
                              topic: topic,
                              notes: preparedNotes, // Use prepared (possibly summarized) notes
                            }),
                          })

                          if (notesRes.ok) {
                            const notesData = await notesRes.json()
                            setStructuredNotes(notesData.notes)
                          }
                        } catch (error) {
                          console.error('Error generating structured notes:', error)
                        } finally {
                          setGeneratingNotes(false)
                        }
                      }
                    } else {
                      // Fallback: use documents as-is
                      const fallbackNotes = relevantDocs
                        .map(d => `[From ${d.document_name}]\n${d.extracted_text}`)
                        .join('\n\n---\n\n')
                      setExamNotes(fallbackNotes)
                    }
                  } else {
                    // Fallback: use documents as-is
                    const fallbackNotes = relevantDocs
                      .map(d => `[From ${d.document_name}]\n${d.extracted_text}`)
                      .join('\n\n---\n\n')
                    setExamNotes(fallbackNotes)
                  }
                } catch (error) {
                  console.error('Error preparing notes:', error)
                  // Fallback: use documents as-is
                  const fallbackNotes = relevantDocs
                    .map(d => `[From ${d.document_name}]\n${d.extracted_text}`)
                    .join('\n\n---\n\n')
                  setExamNotes(fallbackNotes)
                }
              } else {
                // No documents, but still show exam flow with task notes
                setExamNotes(task.notes || 'No notes available for this topic yet. Study materials will appear here once uploaded.')
              }
          } else {
            // Topic not found, but it's an exam task - still show exam flow
            console.warn('⚠️ Exam task but no topic found, using task title')
            setExamTopic(task.title.replace(/^Study\s*/i, '').trim() || 'Exam Topic')
            setExamNotes(task.notes || 'No notes available for this topic yet.')
          }
      } else {
        // Goal is exam type but no exam_id - still treat as exam
        console.log('⚠️ Exam goal but no exam_id, treating as exam task anyway')
        setIsExamTask(true)
        const topicFromTitle = task.title.match(/Study:\s*(.+)/i)?.[1]?.trim() || 
                              task.title.match(/Study\s+(.+)/i)?.[1]?.trim() ||
                              task.title.replace(/^Study\s*/i, '').trim()
        if (topicFromTitle) {
          setExamTopic(topicFromTitle)
          setExamNotes(task.notes || 'No notes available for this topic yet.')
        }
      }
      } catch (error) {
        console.error('Error loading exam data:', error)
      } finally {
        setLoadingExamData(false)
      }
    }

    if (task?.goal_id) {
      checkAndLoadExamData()
    }
  }, [task, supabase])

  const loadTask = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: taskData } = await supabase
        .from('task_items')
        .select('*')
        .eq('id', taskId)
        .single()

      setTask(taskData)

      const { data: checkpointsData } = await supabase
        .from('task_checklist_items')
        .select('*')
        .eq('task_id', taskId)
        .order('position', { ascending: true })

      setCheckpoints(checkpointsData || [])

      if (taskData?.goal_id) {
        const { data: documentsData } = await supabase
          .from('goal_documents')
          .select('extracted_text')
          .eq('goal_id', taskData.goal_id)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)

        setDocumentText(documentsData?.[0]?.extracted_text || null)
      }
      
      const savedTimer = localStorage.getItem(`timer_${taskId}`)
      console.log('Loading task - savedTimer:', savedTimer)
      console.log('Loading task - dbWorked:', taskData?.total_time_worked_seconds)
      
      if (taskData) {
        const estimatedSeconds = taskData.estimated_minutes * 60
        const dbWorked = taskData.total_time_worked_seconds || 0
        
        if (savedTimer) {
          hasPersistedTimerRef.current = true
          const parsed: TimerState = JSON.parse(savedTimer)
          const parsedWorked = parsed.totalTimeWorked || 0
          const totalWorked = Math.max(parsedWorked, dbWorked)
          
          // If saved timeRemaining is 0 but task isn't complete, use estimated time
          // This handles corrupted/old localStorage data
          let remaining = parsed.timeRemaining
          if (remaining <= 0 && totalWorked < estimatedSeconds) {
            remaining = Math.max(estimatedSeconds - totalWorked, 0)
          }
          console.log('Restoring from localStorage - remaining:', remaining, 'worked:', totalWorked)
          
          const newTimerState = {
            ...parsed,
            isRunning: false,
            totalTimeWorked: totalWorked,
            timeRemaining: remaining,
          }
          setTimerState(newTimerState)
          timerStateRef.current = newTimerState
        } else {
          // No saved timer - initialize from estimated time minus DB worked
          const remaining = Math.max(estimatedSeconds - dbWorked, 0)
          console.log('No saved timer - initializing with remaining:', remaining, 'dbWorked:', dbWorked)
          
          const newTimerState = {
            timeRemaining: remaining,
            totalTimeWorked: dbWorked,
            continuousWorkTime: 0,
            isRunning: false,
            isOnBreak: false,
            breakTimeRemaining: 0,
          }
          setTimerState(newTimerState)
          timerStateRef.current = newTimerState
        }
        hasHydratedTimerRef.current = true
      }
      
      setLoading(false)
    } catch (error) {
      console.error('Task load error:', error)
      setLoading(false)
    }
  }

  const loadChatState = () => {
    const savedChat = localStorage.getItem(`chat_${taskId}`)
    if (savedChat) {
      setMessages(JSON.parse(savedChat))
    }
  }

  const saveTimerState = () => {
    // Use ref to always get the latest state (important for cleanup/beforeunload)
    const currentTimer = timerStateRef.current
    if (currentTimer.timeRemaining > 0 || currentTimer.totalTimeWorked > 0) {
      localStorage.setItem(`timer_${taskId}`, JSON.stringify(currentTimer))
      console.log('Saved timer:', currentTimer.timeRemaining, 'remaining,', currentTimer.totalTimeWorked, 'worked')
    }
  }

  const persistTimeWorked = useCallback(async () => {
    if (!taskId) return
    const currentWorked = timerStateRef.current.totalTimeWorked
    if (currentWorked <= 0) return
    try {
      await supabase
        .from('task_items')
        .update({ total_time_worked_seconds: currentWorked })
        .eq('id', taskId)
      console.log('Persisted to DB:', currentWorked, 'seconds')
    } catch (error) {
      console.error('Persist time error:', error)
    }
  }, [supabase, taskId])

  const saveChatState = () => {
    localStorage.setItem(`chat_${taskId}`, JSON.stringify(messages))
  }

  useEffect(() => {
    saveChatState()
  }, [messages])

  const toggleTimer = () => {
    if (timerState.isRunning) {
      pauseTimer()
    } else {
      startTimer()
    }
  }

  const startTimer = () => {
    setTimerState(prev => ({ ...prev, isRunning: true }))
    
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    
    timerIntervalRef.current = setInterval(() => {
      setTimerState(prev => {
        let newState: TimerState
        
        if (prev.isOnBreak) {
          const newBreakTime = prev.breakTimeRemaining - 1
          if (newBreakTime <= 0) {
            playAlarm()
            newState = {
              ...prev,
              isOnBreak: false,
              breakTimeRemaining: 0,
              continuousWorkTime: 0,
            }
          } else {
            newState = { ...prev, breakTimeRemaining: newBreakTime }
          }
        } else {
          const newTimeRemaining = prev.timeRemaining - 1
          const newContinuousWorkTime = prev.continuousWorkTime + 1
          const newTotalTimeWorked = prev.totalTimeWorked + 1

          // Check if need break (every 25 minutes)
          if (newContinuousWorkTime >= WORK_INTERVAL) {
            playAlarm()
            newState = {
              ...prev,
              timeRemaining: newTimeRemaining,
              totalTimeWorked: newTotalTimeWorked,
              isOnBreak: true,
              breakTimeRemaining: BREAK_DURATION,
              isRunning: false,
            }
          } else if (newTimeRemaining <= 0) {
            playAlarm()
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
            newState = { ...prev, timeRemaining: 0, isRunning: false, totalTimeWorked: newTotalTimeWorked }
          } else {
            newState = {
              ...prev,
              timeRemaining: newTimeRemaining,
              continuousWorkTime: newContinuousWorkTime,
              totalTimeWorked: newTotalTimeWorked,
            }
          }
        }
        
        // Keep ref in sync on every tick
        timerStateRef.current = newState
        return newState
      })
    }, 1000)
  }

  const pauseTimer = () => {
    setTimerState(prev => {
      const newState = { ...prev, isRunning: false }
      // Update ref immediately so save gets latest
      timerStateRef.current = newState
      // Save to localStorage immediately
      localStorage.setItem(`timer_${taskId}`, JSON.stringify(newState))
      console.log('Pause - saved:', newState.timeRemaining, 'remaining')
      return newState
    })
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    persistTimeWorked()
  }

  const takeBreak = () => {
    setTimerState(prev => ({
      ...prev,
      isOnBreak: true,
      breakTimeRemaining: BREAK_DURATION,
      isRunning: true,
    }))
    startTimer()
  }

  const endBreak = () => {
    setTimerState(prev => ({
      ...prev,
      isOnBreak: false,
      breakTimeRemaining: 0,
      continuousWorkTime: 0,
      isRunning: false,
    }))
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    saveTimerState()
    persistTimeWorked()
  }

  const playAlarm = () => {
    if (typeof window === 'undefined') return
    
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      const ctx = audioContextRef.current
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.frequency.value = 800
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)

      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.5)
    } catch (error) {
      console.error('Audio error:', error)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const toggleCheckpoint = async (checkpointId: string, currentStatus: boolean) => {
    try {
      await supabase
        .from('task_checklist_items')
        .update({ is_completed: !currentStatus })
        .eq('id', checkpointId)

      setCheckpoints(prev =>
        prev.map(cp =>
          cp.id === checkpointId ? { ...cp, is_completed: !currentStatus } : cp
        )
      )
    } catch (error) {
      console.error('Checkpoint toggle error:', error)
    }
  }

  const sendMessage = async () => {
    if (!inputMessage.trim() || isSendingMessage) return

    const userMessage = inputMessage.trim()
    setInputMessage('')
    setIsSendingMessage(true)

    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }]
    setMessages(newMessages)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      const response = await fetch('/api/task-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          messages: newMessages,
          context: {
            task: {
              title: task?.title || 'Unknown task',
              description: task?.notes || '',
              deliverable: task?.deliverable || '',
              metric: task?.metric || '',
              estimatedMinutes: task?.estimated_minutes || 30,
            },
            checkpoints: checkpoints,
            timeRemaining: timerState.timeRemaining,
            totalTimeWorked: timerState.totalTimeWorked,
            documentText: documentText ? documentText.slice(0, 6000) : null,
            completedTasks: [],
            goal: null,
          },
        }),
      })

      const data = await response.json()
      
      if (data.reply) {
        setMessages([...newMessages, { role: 'assistant', content: data.reply }])
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages([...newMessages, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.' 
      }])
    } finally {
      setIsSendingMessage(false)
    }
  }

  const endTask = async () => {
    try {
      await persistTimeWorked()
      await supabase
        .from('task_items')
        .update({ is_completed: true, status: 'completed' })
        .eq('id', taskId)

      // Track task completion
      const { trackTaskCompleted } = await import('@/lib/utils/posthog-events')
      trackTaskCompleted(taskId, {
        checkpoints_completed: completedCount,
        total_checkpoints: totalCheckpoints,
        time_worked: timerStateRef.current.totalTimeWorked,
      })

      // Clear persisted state
      localStorage.removeItem(`timer_${taskId}`)
      localStorage.removeItem(`chat_${taskId}`)

      router.push('/dashboard')
    } catch (error) {
      console.error('End task error:', error)
    }
  }

  const leaveTaskEarly = () => {
    // Save current timer state using ref (always has latest)
    const currentTimer = timerStateRef.current
    if (currentTimer.timeRemaining > 0 || currentTimer.totalTimeWorked > 0) {
      localStorage.setItem(`timer_${taskId}`, JSON.stringify(currentTimer))
      console.log('Leave - saved:', currentTimer.timeRemaining, 'remaining,', currentTimer.totalTimeWorked, 'worked')
    }
    persistTimeWorked()
    router.push(`/tasks/${taskId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-primary-purple border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center text-white">
        <p>Task not found</p>
      </div>
    )
  }

  const completedCount = checkpoints.filter(cp => cp.is_completed).length
  const totalCheckpoints = checkpoints.length

  return (
    <>
      <div className="noise-bg"></div>

      <div className="work-session-container">
        {/* Header */}
        <div className="work-header">
          <button
            onClick={() => {
              setEndEarlyMode('leave')
              setShowEndEarlyModal(true)
            }}
            className="back-btn-small"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <h1 className="work-title">{task.title}</h1>
          <button
            onClick={() => {
              setEndEarlyMode('endTask')
              setShowEndEarlyModal(true)
            }}
            className="end-btn"
          >
            End Early
          </button>
        </div>

        {/* Main Content */}
        {isExamTask ? (
          <div style={{ 
            width: '100%', 
            maxWidth: '1400px', 
            margin: '0 auto', 
            padding: '0 2rem 2rem 2rem'
          }}>
            {/* Exam Notes Section - Full Width */}
            <div className="exam-notes-card" style={{ 
              marginBottom: '2rem',
              background: 'var(--card-bg)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '20px',
              padding: '2.5rem'
            }}>
                <div className="exam-notes-header" style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginBottom: '2rem',
                  paddingBottom: '1.5rem',
                  borderBottom: '1px solid var(--border-subtle)'
                }}>
                  <div>
                    <h2 style={{ 
                      fontSize: '2rem', 
                      fontWeight: 700, 
                      color: 'var(--text-primary)', 
                      margin: '0 0 0.5rem 0',
                      fontFamily: 'var(--font-syne), sans-serif'
                    }}>
                      {examTopic || task?.title || 'Exam Topic'}
                    </h2>
                    <p style={{ 
                      color: 'var(--text-secondary)', 
                      margin: 0,
                      fontSize: '1rem'
                    }}>
                      Focus on understanding the key concepts and preparing for your exam
                    </p>
                  </div>
                  <button
                    onClick={() => router.push(`/tasks/${taskId}`)}
                    className="back-btn-small"
                    style={{ 
                      margin: 0, 
                      padding: '0.625rem 1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '18px', height: '18px' }}>
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                    Back
                  </button>
                </div>
                {loadingExamData ? (
                  <div className="exam-notes-loading">
                    <div className="spinner" style={{ width: '24px', height: '24px' }}></div>
                    <p>Loading notes...</p>
                  </div>
                ) : generatingNotes ? (
                  <div className="exam-notes-loading">
                    <div className="spinner" style={{ width: '24px', height: '24px' }}></div>
                    <p>Generating structured notes...</p>
                  </div>
                ) : (
                  <>
                    <div className="exam-notes-content">
                      {/* Show relevant documents if available */}
                      {examId && (
                        <div style={{
                          marginBottom: '2rem',
                          padding: '1rem 1.5rem',
                          background: 'rgba(6, 182, 212, 0.08)',
                          border: '1px solid rgba(6, 182, 212, 0.2)',
                          borderRadius: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem'
                        }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '20px', height: '20px', color: 'var(--primary-cyan)' }}>
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                            <polyline points="10 9 9 9 8 9"/>
                          </svg>
                          <div>
                            <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.25rem' }}>
                              Relevant notes:
                            </strong>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
                              This topic is covered in your uploaded documents
                            </span>
                          </div>
                        </div>
                      )}
                      
                      <div className="exam-notes-text">
                        {structuredNotes ? (
                          <div style={{ 
                            lineHeight: '1.8',
                            color: 'var(--text-secondary)',
                            fontSize: '1rem',
                          }}>
                            <h4 style={{ 
                              color: 'var(--text-primary)', 
                              marginTop: 0, 
                              marginBottom: '1rem',
                              fontSize: '1.25rem',
                              fontWeight: 600
                            }}>
                              {structuredNotes.title || `Study Notes: ${examTopic}`}
                            </h4>
                            
                            {structuredNotes.summary && (
                              <div style={{ 
                                marginBottom: '1.5rem',
                                padding: '1rem',
                                background: 'rgba(6, 182, 212, 0.1)',
                                borderRadius: '6px',
                                borderLeft: '3px solid var(--primary-cyan)'
                              }}>
                                <strong>Overview:</strong> {structuredNotes.summary}
                              </div>
                            )}

                            {structuredNotes.sections && structuredNotes.sections.map((section: any, idx: number) => (
                              <div key={idx} style={{ marginBottom: '1.5rem' }}>
                                <h5 style={{ 
                                  color: 'var(--text-primary)', 
                                  marginBottom: '0.75rem',
                                  fontSize: '1.125rem',
                                  fontWeight: 600
                                }}>
                                  {section.title}
                                </h5>
                                <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                                  {section.content && section.content.map((point: string, pIdx: number) => (
                                    <li key={pIdx} style={{ marginBottom: '0.5rem', lineHeight: '1.6' }}>
                                      {point}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}

                            {structuredNotes.definitions && structuredNotes.definitions.length > 0 && (
                              <div style={{ marginTop: '2rem' }}>
                                <h5 style={{ 
                                  color: 'var(--text-primary)', 
                                  marginBottom: '1rem',
                                  fontSize: '1.125rem',
                                  fontWeight: 600
                                }}>
                                  Key Definitions
                                </h5>
                                {structuredNotes.definitions.map((def: any, idx: number) => (
                                  <div key={idx} style={{ 
                                    marginBottom: '1rem',
                                    padding: '0.75rem',
                                    background: 'rgba(139, 92, 246, 0.1)',
                                    borderRadius: '6px'
                                  }}>
                                    <strong>{def.term}:</strong> {def.definition}
                                  </div>
                                ))}
                              </div>
                            )}

                            {structuredNotes.keyTakeaways && structuredNotes.keyTakeaways.length > 0 && (
                              <div style={{ marginTop: '2rem' }}>
                                <h5 style={{ 
                                  color: 'var(--text-primary)', 
                                  marginBottom: '1rem',
                                  fontSize: '1.125rem',
                                  fontWeight: 600
                                }}>
                                  Key Takeaways
                                </h5>
                                <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                                  {structuredNotes.keyTakeaways.map((takeaway: string, idx: number) => (
                                    <li key={idx} style={{ marginBottom: '0.5rem' }}>
                                      {takeaway}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ) : examNotes ? (
                          <div style={{ 
                            lineHeight: '1.8',
                            color: 'var(--text-secondary)',
                            fontSize: '1rem',
                            padding: '2rem',
                            background: 'var(--bg-secondary)',
                            borderRadius: '12px',
                            whiteSpace: 'pre-wrap',
                            border: '1px solid var(--border-subtle)'
                          }}>
                            {examNotes}
                          </div>
                        ) : (
                          <div style={{ 
                            padding: '3rem 2rem',
                            textAlign: 'center',
                            background: 'var(--bg-secondary)',
                            borderRadius: '12px',
                            border: '1px solid var(--border-subtle)'
                          }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ 
                              width: '48px', 
                              height: '48px', 
                              color: 'var(--text-tertiary)',
                              margin: '0 auto 1rem',
                              opacity: 0.5
                            }}>
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                            </svg>
                            <p style={{ 
                              color: 'var(--text-secondary)',
                              margin: 0,
                              fontSize: '1rem'
                            }}>
                              No notes available for this topic yet. Study materials will appear here once uploaded.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    {(examId || isExamTask) && (examTopic || task?.title) && (
                      <div className="exam-notes-actions" style={{ 
                        marginTop: '3rem', 
                        textAlign: 'center', 
                        paddingTop: '2.5rem', 
                        borderTop: '1px solid var(--border-subtle)' 
                      }}>
                        <a
                          href={examId && examTopic ? `/exam/quiz/${examId}/${encodeURIComponent(examTopic)}` : '#'}
                          onClick={(e) => {
                            if (!examId || !examTopic) {
                              e.preventDefault()
                              alert('Quiz will be available once exam documents are uploaded and processed.')
                            }
                          }}
                          className="btn-quiz"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.75rem',
                            padding: '1.25rem 3rem',
                            fontSize: '1.125rem',
                            fontWeight: 700,
                            background: examId && examTopic 
                              ? 'linear-gradient(135deg, var(--primary-purple) 0%, var(--primary-pink) 100%)' 
                              : 'rgba(255, 255, 255, 0.05)',
                            color: examId && examTopic ? 'white' : 'var(--text-secondary)',
                            borderRadius: '14px',
                            textDecoration: 'none',
                            transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                            boxShadow: examId && examTopic 
                              ? '0 8px 24px -8px rgba(139, 92, 246, 0.5)' 
                              : 'none',
                            cursor: examId && examTopic ? 'pointer' : 'not-allowed',
                            opacity: examId && examTopic ? 1 : 0.5,
                            border: examId && examTopic ? 'none' : '1px solid var(--border-subtle)',
                            minWidth: '280px'
                          }}
                          onMouseEnter={(e) => {
                            if (examId && examTopic) {
                              e.currentTarget.style.transform = 'translateY(-3px)'
                              e.currentTarget.style.boxShadow = '0 12px 32px -8px rgba(139, 92, 246, 0.7)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (examId && examTopic) {
                              e.currentTarget.style.transform = 'translateY(0)'
                              e.currentTarget.style.boxShadow = '0 8px 24px -8px rgba(139, 92, 246, 0.5)'
                            }
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '22px', height: '22px' }}>
                            <path d="M9 11l3 3L22 4"/>
                            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                          </svg>
                          {examId && examTopic ? 'Start Quiz (10 Questions)' : 'Upload Documents to Enable Quiz'}
                        </a>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Left Column - Timer & Checkpoints */}
              <div className="work-left">
            {/* Timer Card */}
            <div className="timer-card">
              <div className="timer-display">
                {timerState.isOnBreak ? (
                  <>
                    <div className="timer-label">Break Time</div>
                    <div className="timer-time break">{formatTime(timerState.breakTimeRemaining)}</div>
                  </>
                ) : (
                  <>
                    <div className="timer-label">Time Remaining</div>
                    <div className="timer-time">{formatTime(timerState.timeRemaining)}</div>
                  </>
                )}
              </div>

              <div className="timer-controls">
                {timerState.isOnBreak ? (
                  <>
                    <button className="timer-btn primary" disabled>
                      On Break
                    </button>
                    <button onClick={endBreak} className="timer-btn secondary">
                      End Break
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={toggleTimer} className="timer-btn primary">
                      {timerState.isRunning ? 'Pause' : 'Start'}
                    </button>
                    <button onClick={takeBreak} className="timer-btn secondary">
                      Take Break
                    </button>
                  </>
                )}
              </div>

              <div className="timer-stats">
                <div className="stat">
                  <span className="stat-label">Worked</span>
                  <span className="stat-value">{formatTime(timerState.totalTimeWorked)}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Session</span>
                  <span className="stat-value">{formatTime(timerState.continuousWorkTime)}</span>
                </div>
              </div>
            </div>

            {/* Checkpoints */}
            {checkpoints.length > 0 && (
              <div className="checkpoints-card">
                <div className="checkpoints-header">
                  <h3>Checkpoints</h3>
                  <span className="progress-badge-small">
                    {completedCount}/{totalCheckpoints}
                  </span>
                </div>
                <div className="checkpoints-list-small">
                  {checkpoints.map((checkpoint) => (
                    <div
                      key={checkpoint.id}
                      className={`checkpoint-item-small ${checkpoint.is_completed ? 'completed' : ''}`}
                      onClick={() => toggleCheckpoint(checkpoint.id, checkpoint.is_completed)}
                    >
                      <div className="checkpoint-checkbox-small">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </div>
                      <div className="checkpoint-text-small">{checkpoint.content}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Chat (ONLY for non-exam tasks) */}
          <div className="work-right">
            {!showChat ? (
              <div className="orah-cta-card">
                <div className="orah-cta-content">
                  <div className="orah-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      <circle cx="9" cy="10" r="1" fill="currentColor"/>
                      <circle cx="15" cy="10" r="1" fill="currentColor"/>
                      <path d="M9 14a5 5 0 0 0 6 0" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <h3 className="orah-cta-title">Need Help?</h3>
                  <p className="orah-cta-text">
                    Get instant guidance, tips, and support from Orah AI while you work on this task.
                  </p>
                  <button onClick={() => setShowChat(true)} className="btn-work-with-orah">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <span>Work with Orah</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="chat-card">
              <div className="chat-header">
                <div className="chat-header-left">
                  <h3>Orah AI</h3>
                  <div className="chat-status">
                    <div className="status-dot"></div>
                    Online
                  </div>
                </div>
                <button onClick={() => setShowChat(false)} className="chat-close-btn">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              <div className="chat-messages">
                {messages.length === 0 && (
                  <div className="chat-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <p>Ask me anything about this task!</p>
                  </div>
                )}
                {messages.map((msg, idx) => (
                  <div key={idx} className={`chat-message ${msg.role}`}>
                    <div className="message-content">{msg.content}</div>
                  </div>
                ))}
                {isSendingMessage && (
                  <div className="chat-message assistant">
                    <div className="message-content typing">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="chat-input-container">
                <input
                  type="text"
                  className="chat-input"
                  placeholder="Type your message..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  disabled={isSendingMessage}
                />
                <button
                  onClick={sendMessage}
                  className="chat-send-btn"
                  disabled={isSendingMessage || !inputMessage.trim()}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </div>
            )}
          </div>
            </>
          )}
        </div>
      </div>

      {/* End Early Modal */}
      {showEndEarlyModal && (
        <div className="modal-overlay" onClick={() => setShowEndEarlyModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{endEarlyMode === 'endTask' ? 'End Task Early?' : 'Leave Work Session?'}</h2>
            <p>
              {endEarlyMode === 'endTask'
                ? 'Are you sure you want to end this task? Your progress will be saved.'
                : 'Your timer will continue from where you left off when you return.'}
            </p>
            <div className="modal-actions">
              <button onClick={() => setShowEndEarlyModal(false)} className="btn-cancel">
                Cancel
              </button>
              {endEarlyMode === 'endTask' ? (
                <button onClick={endTask} className="btn-confirm">
                  End Task
                </button>
              ) : (
                <button onClick={leaveTaskEarly} className="btn-confirm">
                  Go Back
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
