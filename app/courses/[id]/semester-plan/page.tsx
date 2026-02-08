'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/layout/Navigation'
import '@/app/styles/academic-form.css'
import '@/app/assistant/assistant-chat.css'
import './semester-plan.css'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

export default function CourseSemesterPlanPage() {
  const router = useRouter()
  const params = useParams()
  const courseId = params.id as string
  const supabase = createClient()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Course and syllabus state
  const [course, setCourse] = useState<{ id: string; course_name: string; syllabus_text: string | null } | null>(null)
  const [loading, setLoading] = useState(true)

  // Chat phase state
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [questionCount, setQuestionCount] = useState(0)
  const [creatingPlan, setCreatingPlan] = useState(false)
  
  // User preferences
  const [preferredTime, setPreferredTime] = useState<string | null>(null)
  const [focusDuration, setFocusDuration] = useState<number | null>(null)
  const [focusDaysPerWeek, setFocusDaysPerWeek] = useState<number | null>(null)

  const totalQuestions = 4

  useEffect(() => {
    loadCourse()
  }, [courseId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chatLoading])

  const loadCourse = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data, error } = await supabase
        .from('courses')
        .select('id, course_name, syllabus_text')
        .eq('id', courseId)
        .eq('user_id', user.id)
        .single()

      if (error || !data) {
        console.error('Error loading course:', error)
        router.push('/courses')
        return
      }

      setCourse(data)

      // If syllabus exists, start the chat immediately
      if (data.syllabus_text) {
        const initialMessages = buildInitialMessages()
        setMessages(initialMessages)
        setQuestionCount(1)
      }

      setLoading(false)
    } catch (error) {
      console.error('Error loading course:', error)
      setLoading(false)
    }
  }

  const buildInitialMessages = (): Message[] => {
    return [
      {
        role: 'assistant',
        content: "Perfect! I've read your syllabus. I'll extract all your classes, tutorials, assignments, quizzes, midterms, and exams with their exact dates and times.",
      },
      {
        role: 'assistant',
        content: "To create the best plan for you, I need a few quick details.\n\nFirst, what time of day do you work best?",
      },
    ]
  }

  // Chat handlers
  const handleQuickReply = (reply: string, value?: string | number) => {
    if (chatLoading) return
    
    // Set the appropriate state based on current question
    if (questionCount === 1) {
      // Time of day preference
      setPreferredTime(value as string || reply.toLowerCase())
    } else if (questionCount === 2) {
      // Focus duration
      const minutes = typeof value === 'number' ? value : parseInt(reply) || 45
      setFocusDuration(minutes)
    } else if (questionCount === 3) {
      // Days per week
      const days = typeof value === 'number' ? value : parseInt(reply) || 3
      setFocusDaysPerWeek(days)
    }
    
    sendMessage(reply)
  }

  const sendMessage = async (messageText?: string) => {
    const textToSend = messageText || input.trim()
    if (!textToSend || chatLoading) return

    const newMessages: Message[] = [...messages, { role: 'user', content: textToSend }]
    setMessages(newMessages)
    setInput('')
    setChatLoading(true)

    await new Promise((resolve) => setTimeout(resolve, 800))

    const newQuestionCount = questionCount + 1
    let assistantMessage = ''

    if (questionCount === 1) {
      // After time of day question, ask about focus duration
      assistantMessage = "How long can you typically focus in one study session?"
    } else if (questionCount === 2) {
      // After focus duration, ask about days per week
      assistantMessage = "How many days per week do you want to dedicate to studying for this course? (This doesn't include your class days)"
    } else if (questionCount === 3) {
      // After days per week, ask about semester goal (just for motivation)
      assistantMessage = "Last one! What's your main goal for this semester?"
    } else if (questionCount === 4) {
      // After goal, create the plan
      assistantMessage = "Awesome! I'm now extracting all events from your syllabus and creating your personalized semester plan. This will just take a moment..."
      setQuestionCount(newQuestionCount)
      setMessages([...newMessages, { role: 'assistant', content: assistantMessage }])
      setChatLoading(false)

      setTimeout(() => {
        handleCreatePlan(newMessages)
      }, 1500)
      return
    }

    setQuestionCount(newQuestionCount)
    setMessages([...newMessages, { role: 'assistant', content: assistantMessage }])
    setChatLoading(false)
  }

  const handleCreatePlan = async (conversationMessages: Message[]) => {
    if (!course) return
    
    setCreatingPlan(true)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const userId = sessionData.session?.user?.id

      if (!token || !userId) {
        alert('You must be logged in to create a plan.')
        router.push('/login')
        return
      }

      const timezone = typeof window !== 'undefined' 
        ? Intl.DateTimeFormat().resolvedOptions().timeZone 
        : 'UTC'

      // Call course semester plan API
      const res = await fetch('/api/courses/semester-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          courseId,
          userId,
          timezone,
          syllabusContent: course.syllabus_text,
          metadata: {
            preferredTime: preferredTime || 'afternoon',
            focusDuration: focusDuration || 45,
            daysPerWeek: focusDaysPerWeek || 3,
          },
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create plan')
      }

      const data = await res.json()

      // Track goal creation
      const { trackGoalCreated } = await import('@/lib/utils/posthog-events')
      await trackGoalCreated('semester', {
        has_file: !!course.syllabus_text,
        preferred_time: preferredTime,
        focus_duration: focusDuration,
        days_per_week: focusDaysPerWeek,
      })

      // Small delay to ensure PostHog event is sent
      await new Promise(resolve => setTimeout(resolve, 200))

      // Navigate to course dashboard
      router.push(`/courses/${courseId}`)
    } catch (error: any) {
      console.error('Error creating plan:', error)
      alert(error.message || 'Failed to create plan. Please try again.')
      setCreatingPlan(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement
    target.style.height = 'auto'
    target.style.height = target.scrollHeight + 'px'
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
        <div className="semester-plan-container">
          <div className="semester-plan-error">
            <h2>Course not found</h2>
            <button onClick={() => router.push('/courses')} className="btn-primary">
              Back to Courses
            </button>
          </div>
        </div>
      </>
    )
  }

  if (!course.syllabus_text) {
    return (
      <>
        <Navigation />
        <div className="semester-plan-container">
          <div className="semester-plan-error">
            <h2>No syllabus found</h2>
            <p>Please upload a syllabus first to create a semester plan.</p>
            <button onClick={() => router.push(`/courses/${courseId}/syllabus`)} className="btn-primary">
              Upload Syllabus
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="noise-bg"></div>
      <Navigation />
      <div className="chat-container">
        <div className="chat-header">
          <div className="header-content">
            <div className="orah-avatar">O</div>
            <div className="header-text">
              <h1>Create Semester Plan</h1>
              <div className="header-subtitle">For {course.course_name}</div>
              {chatLoading && (
                <div className="typing-indicator active">
                  <span>Orah is typing...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {questionCount <= totalQuestions && (
          <div className="progress-indicator">
            Question {questionCount} of {totalQuestions}
          </div>
        )}

        <div className="messages-container" id="messagesContainer">
          {messages.map((msg, idx) => (
            <div key={idx} className={`message ${msg.role}`}>
              <div className="message-avatar">
                {msg.role === 'assistant' ? (
                  'O'
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                )}
              </div>
              <div className="message-content">
                <div className="message-bubble">{msg.content}</div>
                
                {/* Question 1: Time of day */}
                {msg.role === 'assistant' && idx === messages.length - 1 && !chatLoading && questionCount === 1 && (
                  <div className="quick-replies">
                    <button className="quick-reply-btn" onClick={() => handleQuickReply('Mornings (6am-12pm)', 'morning')}>
                      Mornings
                    </button>
                    <button className="quick-reply-btn" onClick={() => handleQuickReply('Afternoons (12pm-6pm)', 'afternoon')}>
                      Afternoons
                    </button>
                    <button className="quick-reply-btn" onClick={() => handleQuickReply('Evenings (6pm-12am)', 'evening')}>
                      Evenings
                    </button>
                    <button className="quick-reply-btn" onClick={() => handleQuickReply('Late nights (12am-6am)', 'night')}>
                      Late nights
                    </button>
                  </div>
                )}

                {/* Question 2: Focus duration */}
                {msg.role === 'assistant' && idx === messages.length - 1 && !chatLoading && questionCount === 2 && (
                  <div className="quick-replies">
                    <button className="quick-reply-btn" onClick={() => handleQuickReply('25-30 minutes (Pomodoro)', 25)}>
                      25-30 min
                    </button>
                    <button className="quick-reply-btn" onClick={() => handleQuickReply('45-60 minutes', 45)}>
                      45-60 min
                    </button>
                    <button className="quick-reply-btn" onClick={() => handleQuickReply('90+ minutes (Deep work)', 90)}>
                      90+ min
                    </button>
                  </div>
                )}

                {/* Question 3: Days per week */}
                {msg.role === 'assistant' && idx === messages.length - 1 && !chatLoading && questionCount === 3 && (
                  <div className="quick-replies">
                    <button className="quick-reply-btn" onClick={() => handleQuickReply('2-3 days', 2)}>
                      2-3 days
                    </button>
                    <button className="quick-reply-btn" onClick={() => handleQuickReply('4-5 days', 4)}>
                      4-5 days
                    </button>
                    <button className="quick-reply-btn" onClick={() => handleQuickReply('6-7 days', 6)}>
                      6-7 days
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {creatingPlan && (
          <div className="creating-plan-overlay">
            <div className="creating-plan-content">
              <div className="spinner" style={{ width: '40px', height: '40px' }}></div>
              <p>Creating your personalized semester plan...</p>
            </div>
          </div>
        )}

        {questionCount <= totalQuestions && !creatingPlan && (
          <div className="input-container">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              onInput={handleTextareaInput}
              placeholder="Type your answer..."
              className="chat-input"
              rows={1}
              disabled={chatLoading}
            />
            <button
              onClick={() => sendMessage()}
              className="send-button"
              disabled={!input.trim() || chatLoading}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        )}
      </div>
    </>
  )
}
