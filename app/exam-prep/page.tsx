'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Navigation from '@/components/layout/Navigation'
import '@/app/styles/academic-form.css'
import '../assistant/assistant-chat.css'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

export default function ExamPrepPage() {
  const router = useRouter()
  const supabase = createClient()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Let's create your exam study plan! I'll help you prepare chapter by chapter.",
    },
    {
      role: 'assistant',
      content: "First, what course is this exam for? (e.g., 'CMPT 310' or 'Introduction to AI')",
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [questionCount, setQuestionCount] = useState(1)
  const [creatingPlan, setCreatingPlan] = useState(false)

  // User data
  const [courseName, setCourseName] = useState('')
  const [totalChapters, setTotalChapters] = useState<number | null>(null)
  const [weakChapters, setWeakChapters] = useState('')
  const [weakTopics, setWeakTopics] = useState('')
  const [hoursPerDay, setHoursPerDay] = useState<number | null>(null)
  const [hasFile, setHasFile] = useState<boolean | null>(null)
  const [studyMaterials, setStudyMaterials] = useState('')
  const [examDate, setExamDate] = useState('')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)

  // Refs for latest values
  const courseNameRef = useRef('')
  const totalChaptersRef = useRef<number | null>(null)
  const weakChaptersRef = useRef('')
  const weakTopicsRef = useRef('')
  const hoursPerDayRef = useRef<number | null>(null)
  const studyMaterialsRef = useRef('')
  const examDateRef = useRef('')

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleQuickReply = (reply: string, value?: any) => {
    if (loading) return

    // Set state and ref based on current question
    if (questionCount === 2 && typeof value === 'number') {
      setTotalChapters(value)
      totalChaptersRef.current = value
    } else if (questionCount === 5 && typeof value === 'number') {
      setHoursPerDay(value)
      hoursPerDayRef.current = value
    } else if (questionCount === 6 && typeof value === 'boolean') {
      setHasFile(value)
    } else if (questionCount === 8 && typeof value === 'string') {
      setExamDate(value)
      examDateRef.current = value
    }

    sendMessage(reply)
  }

  const sendMessage = async (messageText?: string) => {
    const textToSend = messageText || input.trim()
    if (!textToSend || loading) return

    const newMessages: Message[] = [...messages, { role: 'user', content: textToSend }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    await new Promise((resolve) => setTimeout(resolve, 800))

    const newQuestionCount = questionCount + 1
    let assistantMessage = ''

    if (questionCount === 1) {
      // After course name
      setCourseName(textToSend)
      courseNameRef.current = textToSend
      assistantMessage = 'Got it! How many chapters or units do you need to study for this exam?'
    } else if (questionCount === 2) {
      // After total chapters
      assistantMessage = 'Which chapters or units need extra practice? (e.g., "Chapters 3, 5, 7" or "None")'
    } else if (questionCount === 3) {
      // After weak chapters
      setWeakChapters(textToSend)
      weakChaptersRef.current = textToSend
      assistantMessage = 'Which specific topics are you struggling with most? (e.g., "Recursion, Graph algorithms" or "None")'
    } else if (questionCount === 4) {
      // After weak topics
      setWeakTopics(textToSend)
      weakTopicsRef.current = textToSend
      assistantMessage = 'How many hours per day can you dedicate to studying?'
    } else if (questionCount === 5) {
      // After hours per day
      assistantMessage = 'Do you have any study materials, notes, or guides you want to upload?'
    } else if (questionCount === 6) {
      // After file question
      if (textToSend.toLowerCase().includes('yes')) {
        setHasFile(true)
        assistantMessage = 'Great! Please upload your file or paste your study materials/summary below.'
      } else {
        setHasFile(false)
        assistantMessage = 'No problem! Please write a brief summary of what you need to study (topics, chapters, key concepts).'
      }
    } else if (questionCount === 7) {
      // After materials
      setStudyMaterials(textToSend)
      studyMaterialsRef.current = textToSend
      assistantMessage = 'Perfect! Last question: When is your exam?'
    } else if (questionCount === 8) {
      // After exam date - create plan
      const finalCourseName = courseNameRef.current
      const finalTotalChapters = totalChaptersRef.current
      const finalWeakChapters = weakChaptersRef.current
      const finalWeakTopics = weakTopicsRef.current
      const finalHoursPerDay = hoursPerDayRef.current
      const finalStudyMaterials = studyMaterialsRef.current
      const finalExamDate = examDateRef.current

      if (!finalCourseName || !finalTotalChapters || !finalHoursPerDay || !finalExamDate) {
        console.error('Missing data:', { finalCourseName, finalTotalChapters, finalHoursPerDay, finalExamDate })
        alert('Please answer all required questions.')
        setLoading(false)
        return
      }

      assistantMessage = "Awesome! I'm creating your personalized exam study plan with focus on your weak topics. This will just take a moment..."
      setQuestionCount(newQuestionCount)
      setMessages([...newMessages, { role: 'assistant', content: assistantMessage }])
      setLoading(false)

      setTimeout(() => {
        handleCreatePlan(finalCourseName, finalTotalChapters, finalWeakChapters, finalWeakTopics, finalHoursPerDay, finalStudyMaterials, finalExamDate)
      }, 1500)
      return
    }

    setQuestionCount(newQuestionCount)
    setMessages([...newMessages, { role: 'assistant', content: assistantMessage }])
    setLoading(false)
  }

  const handleCreatePlan = async (
    course: string,
    chapters: number,
    weakChapters: string,
    weakTopics: string,
    hours: number,
    materials: string,
    exam: string
  ) => {
    setCreatingPlan(true)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const userId = sessionData.session?.user?.id

      if (!token || !userId) {
        alert('You must be logged in.')
        router.push('/login')
        return
      }

      const creationTimestamp = Date.now().toString()
      sessionStorage.setItem('newGoalCreationTimestamp', creationTimestamp)

      // Track goal creation
      const { trackGoalCreated } = await import('@/lib/utils/posthog-events')
      trackGoalCreated('exam', {
        course,
        chapters: chapters,
        hours_per_day: hours,
        has_materials: !!materials,
      })

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

      fetch('/api/exam-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId,
          timezone,
          courseName: course,
          totalChapters: chapters,
          weakChapters: weakChapters,
          weakTopics: weakTopics,
          hoursPerDay: hours,
          examDate: exam,
          studyMaterials: materials
        }),
      }).catch((e) => {
        console.error('Background plan creation error:', e)
      })

      router.push('/plan-loading')
    } catch (error) {
      console.error('Error creating plan:', error)
      alert('Failed to create plan.')
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingFile(true)
    setUploadedFile(file)

    try {
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const base64 = await base64Promise
      const base64Data = base64.split(',')[1]

      let extractedText = ''

      if (file.type.startsWith('image/')) {
        const res = await fetch('/api/vision/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Data }),
        })
        if (res.ok) {
          const data = await res.json()
          extractedText = data.text || data.extractedText || ''
        }
      } else if (file.type === 'application/pdf') {
        const res = await fetch('/api/pdf/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdf: base64Data }),
        })
        if (res.ok) {
          const data = await res.json()
          extractedText = data.text || ''
        }
      }

      if (extractedText) {
        setStudyMaterials(extractedText)
        studyMaterialsRef.current = extractedText
        setInput(`Uploaded: ${file.name} (${extractedText.length} characters extracted)`)
      } else {
        alert('Failed to extract text from file.')
      }
    } catch (error) {
      console.error('File upload error:', error)
      alert('Failed to process file.')
    } finally {
      setUploadingFile(false)
    }
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
              <h1>Chat with Orah</h1>
              <div className="header-subtitle">Creating your exam study plan</div>
              {loading && (
                <div className="typing-indicator active">
                  <span>Orah is typing...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {questionCount <= 8 && (
          <div className="progress-indicator">Question {questionCount} of 8</div>
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

                {/* Quick replies */}
                {msg.role === 'assistant' && idx === messages.length - 1 && !loading && (
                  <>
                    {/* Q2: Total chapters */}
                    {questionCount === 2 && (
                      <div className="quick-replies">
                        {[3, 5, 8, 10, 12, 15].map(num => (
                          <button
                            key={num}
                            className="quick-reply-btn"
                            onClick={() => handleQuickReply(`${num} chapters`, num)}
                          >
                            {num} chapters
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Q5: Hours per day */}
                    {questionCount === 5 && (
                      <div className="quick-replies">
                        <button className="quick-reply-btn" onClick={() => handleQuickReply('1 hour', 1)}>1 hour/day</button>
                        <button className="quick-reply-btn" onClick={() => handleQuickReply('2 hours', 2)}>2 hours/day</button>
                        <button className="quick-reply-btn" onClick={() => handleQuickReply('3 hours', 3)}>3 hours/day</button>
                        <button className="quick-reply-btn" onClick={() => handleQuickReply('4 hours', 4)}>4 hours/day</button>
                      </div>
                    )}

                    {/* Q6: Has file */}
                    {questionCount === 6 && (
                      <div className="quick-replies">
                        <button className="quick-reply-btn" onClick={() => handleQuickReply('Yes, I have materials', true)}>Yes</button>
                        <button className="quick-reply-btn" onClick={() => handleQuickReply('No, I will write a summary', false)}>No</button>
                      </div>
                    )}

                    {/* Q8: Exam date */}
                    {questionCount === 8 && (
                      <div className="quick-replies">
                        {['3 days', '1 week', '2 weeks', '1 month'].map(period => {
                          const days = period === '3 days' ? 3 : period === '1 week' ? 7 : period === '2 weeks' ? 14 : 30
                          return (
                            <button
                              key={period}
                              className="quick-reply-btn"
                              onClick={() => {
                                const date = new Date()
                                date.setDate(date.getDate() + days)
                                const formatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                                setExamDate(formatted)
                                examDateRef.current = formatted
                                handleQuickReply(`In ${period}`, formatted)
                              }}
                            >
                              In {period}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="message assistant">
              <div className="message-avatar">O</div>
              <div className="message-content">
                <div className="typing-bubble">
                  <div className="typing-dots">
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          <div className="input-wrapper">
            {questionCount === 7 && hasFile === true && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <button
                  className="upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile || !!uploadedFile}
                  style={{
                    padding: '0.75rem 1.25rem',
                    background: uploadedFile ? 'rgba(16, 185, 129, 0.2)' : 'rgba(168, 85, 247, 0.15)',
                    border: '1px solid ' + (uploadedFile ? 'rgba(16, 185, 129, 0.4)' : 'rgba(168, 85, 247, 0.3)'),
                    borderRadius: '10px',
                    color: uploadedFile ? '#10B981' : '#A855F7',
                    fontWeight: 600,
                    cursor: uploadedFile ? 'default' : 'pointer',
                    marginRight: '0.75rem'
                  }}
                >
                  {uploadingFile ? 'Uploading...' : uploadedFile ? `✓ ${uploadedFile.name}` : '📎 Upload File'}
                </button>
              </>
            )}
            <textarea
              className="message-input"
              placeholder={questionCount === 7 ? (hasFile === true ? 'File uploaded - click send' : 'Type your summary...') : 'Type your message...'}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onInput={handleTextareaInput}
              onKeyDown={handleKeyPress}
              disabled={loading || creatingPlan || uploadingFile}
            />
            <button
              className="send-btn"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim() || creatingPlan || uploadingFile}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
