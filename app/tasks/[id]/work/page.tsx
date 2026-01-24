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
        <div className="work-content">
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

          {/* Right Column - Chat */}
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
