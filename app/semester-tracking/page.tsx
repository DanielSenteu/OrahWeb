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

export default function SemesterTrackingPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Upload phase state
  const [file, setFile] = useState<File | null>(null)
  const [textContent, setTextContent] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  // Chat phase state
  const [showChat, setShowChat] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [extractedContent, setExtractedContent] = useState('')
  const [questionCount, setQuestionCount] = useState(0)
  const [creatingPlan, setCreatingPlan] = useState(false)
  
  // User preferences
  const [preferredTime, setPreferredTime] = useState<string | null>(null)
  const [focusDuration, setFocusDuration] = useState<number | null>(null)
  const [focusDaysPerWeek, setFocusDaysPerWeek] = useState<number | null>(null)

  const totalQuestions = 4

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

  const saveDocument = async (
    content: string,
    sourceType: 'pdf' | 'image' | 'text',
    fileName?: string
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('goal_documents')
        .insert({
          user_id: user.id,
          goal_id: null,
          academic_type: 'semester',
          title: 'Semester Tracking Document',
          file_name: fileName || null,
          source_type: sourceType,
          original_content: content,
          extracted_text: content,
        })
        .select('id')
        .single()

      if (error) {
        console.error('Document save error:', error)
        return
      }

      if (typeof window !== 'undefined' && data?.id) {
        sessionStorage.setItem('pendingGoalDocumentId', data.id)
        sessionStorage.setItem('pendingGoalDocumentType', 'semester')
      }
    } catch (error) {
      console.error('Document save error:', error)
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // File upload handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      setFile(droppedFile)
      setTextContent('')
      
      // Auto-submit when file is dropped
      setIsUploading(true)

      try {
        let content = ''

        const reader = new FileReader()
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(droppedFile)
        })

        const base64 = await base64Promise
        const base64Data = base64.split(',')[1]

        if (droppedFile.type.startsWith('image/')) {
          const res = await fetch('/api/vision/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Data }),
          })

          if (!res.ok) throw new Error('Failed to extract text from image')
          const data = await res.json()
          content = data.text
        } else if (droppedFile.type === 'application/pdf') {
          const res = await fetch('/api/pdf/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pdf: base64Data }),
          })

          if (!res.ok) throw new Error('Failed to extract text from PDF')
          const data = await res.json()
          content = data.text
        }

        setExtractedContent(content)
        await saveDocument(
          content,
          droppedFile.type === 'application/pdf' ? 'pdf' : 'image',
          droppedFile.name
        )

        const initialMessages = buildInitialMessages()

        setMessages(initialMessages)
        setQuestionCount(1)
        setShowChat(true)
      } catch (error) {
        console.error('Error processing file:', error)
        alert('Failed to process file. Please try again.')
        setFile(null)
      } finally {
        setIsUploading(false)
      }
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setTextContent('')
      
      // Auto-submit when file is selected
      setIsUploading(true)

      try {
        let content = ''

        const reader = new FileReader()
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(selectedFile)
        })

        const base64 = await base64Promise
        const base64Data = base64.split(',')[1]

        if (selectedFile.type.startsWith('image/')) {
          const res = await fetch('/api/vision/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Data }),
          })

          if (!res.ok) throw new Error('Failed to extract text from image')
          const data = await res.json()
          content = data.text
        } else if (selectedFile.type === 'application/pdf') {
          const res = await fetch('/api/pdf/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pdf: base64Data }),
          })

          if (!res.ok) throw new Error('Failed to extract text from PDF')
          const data = await res.json()
          content = data.text
        }

        setExtractedContent(content)
        await saveDocument(
          content,
          selectedFile.type === 'application/pdf' ? 'pdf' : 'image',
          selectedFile.name
        )

        const initialMessages = buildInitialMessages()

        setMessages(initialMessages)
        setQuestionCount(1)
        setShowChat(true)
      } catch (error) {
        console.error('Error processing file:', error)
        alert('Failed to process file. Please try again.')
        setFile(null)
      } finally {
        setIsUploading(false)
      }
    }
  }

  const handleRemoveFile = () => {
    setFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const handleSubmit = async () => {
    if (!textContent.trim()) return

    setIsUploading(true)

    try {
      const content = textContent.trim()
      setExtractedContent(content)
      await saveDocument(content, 'text')

      const initialMessages = buildInitialMessages()

      setMessages(initialMessages)
      setQuestionCount(1)
      setShowChat(true)
    } catch (error) {
      console.error('Error processing text:', error)
      alert('Failed to process content. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  // Chat handlers
  const handleQuickReply = (reply: string, value?: string | number) => {
    if (loading) return
    
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
    if (!textToSend || loading) return

    const newMessages: Message[] = [...messages, { role: 'user', content: textToSend }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

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
      setLoading(false)

      setTimeout(() => {
        handleCreatePlan(newMessages)
      }, 1500)
      return
    }

    setQuestionCount(newQuestionCount)
    setMessages([...newMessages, { role: 'assistant', content: assistantMessage }])
    setLoading(false)
  }

  const handleCreatePlan = async (conversationMessages: Message[]) => {
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

      // Store timestamp for loading page
      const creationTimestamp = Date.now().toString()
      sessionStorage.setItem('newGoalCreationTimestamp', creationTimestamp)

      // Track goal creation
      const { trackGoalCreated } = await import('@/lib/utils/posthog-events')
      trackGoalCreated('semester', {
        has_file: !!extractedContent,
        preferred_time: preferredTime,
        focus_duration: focusDuration,
        days_per_week: focusDaysPerWeek,
      })

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

      // Use the NEW simplified semester planner API
      // Pass syllabus + user preferences
      fetch('/api/semester-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId,
          timezone,
          syllabusContent: extractedContent,
          metadata: {
            courseName: null,
            courseCode: null,
            semesterEndDate: null,
            preferredTime: preferredTime || 'afternoon',
            focusDuration: focusDuration || 45,
            daysPerWeek: focusDaysPerWeek || 3,
          },
        }),
      }).catch((e) => {
        console.error('Background plan creation error:', e)
      })

      // Navigate to loading screen
      router.push('/plan-loading')
    } catch (error) {
      console.error('Error creating plan:', error)
      alert('Failed to create plan. Please try again.')
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

  // Render chat interface
  if (showChat) {
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
                <div className="header-subtitle">Planning your semester</div>
                {loading && (
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
                  {msg.role === 'assistant' && idx === messages.length - 1 && !loading && questionCount === 1 && (
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
                  {msg.role === 'assistant' && idx === messages.length - 1 && !loading && questionCount === 2 && (
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
                  {msg.role === 'assistant' && idx === messages.length - 1 && !loading && questionCount === 3 && (
                    <div className="quick-replies">
                      <button className="quick-reply-btn" onClick={() => handleQuickReply('2 days per week', 2)}>
                        2 days
                      </button>
                      <button className="quick-reply-btn" onClick={() => handleQuickReply('3 days per week', 3)}>
                        3 days
                      </button>
                      <button className="quick-reply-btn" onClick={() => handleQuickReply('4 days per week', 4)}>
                        4 days
                      </button>
                      <button className="quick-reply-btn" onClick={() => handleQuickReply('5 days per week', 5)}>
                        5 days
                      </button>
                    </div>
                  )}

                  {/* Question 4: Semester goal */}
                  {msg.role === 'assistant' && idx === messages.length - 1 && !loading && questionCount === 4 && (
                    <div className="quick-replies">
                      <button className="quick-reply-btn" onClick={() => handleQuickReply("Get straight A's")}>
                        Get A's
                      </button>
                      <button className="quick-reply-btn" onClick={() => handleQuickReply('Improve my GPA')}>
                        Improve GPA
                      </button>
                      <button className="quick-reply-btn" onClick={() => handleQuickReply('Stay on top of deadlines')}>
                        Stay organized
                      </button>
                      <button className="quick-reply-btn" onClick={() => handleQuickReply('Learn and understand deeply')}>
                        Deep learning
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="message assistant" id="typingMessage">
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
              <textarea
                id="messageInput"
                className="message-input"
                placeholder="Type your message..."
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onInput={handleTextareaInput}
                onKeyDown={handleKeyPress}
                disabled={loading || creatingPlan}
              />
              <button
                className="send-btn"
                id="sendBtn"
                onClick={() => sendMessage()}
                disabled={loading || !input.trim() || creatingPlan}
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

  // Render upload interface
  return (
    <>
      <div className="noise-bg"></div>
      <Navigation />
      <div className="container">
        {/* Header */}
        <div className="page-header">
          <div className="header-content">
            <div className="header-icon">📚</div>
            <h1 className="page-title">Semester Tracking</h1>
            <p className="page-subtitle">Upload your syllabus to create a complete semester plan</p>
          </div>
          <Link href="/academic-hub" className="btn-back">
            Back
          </Link>
        </div>

        {/* Main Content */}
        <div className="main-content">
          {/* Upload Section */}
          <div className="section">
            <h2 className="section-title">Upload Syllabus</h2>

            {/* Upload Zone */}
            <div
              className={`upload-zone ${isDragging ? 'dragover' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{ display: file ? 'none' : 'block' }}
            >
              <div className="upload-icon">📁</div>
              <div className="upload-text">Click to upload or drag and drop</div>
              <div className="upload-hint">Images (PNG, JPG, WEBP) or PDF • Max 10MB</div>
              <input
                ref={fileInputRef}
                type="file"
                className="file-input"
                accept="image/*,.pdf"
                onChange={handleFileSelect}
              />
            </div>

            {/* Uploaded File Display */}
            <div className={`uploaded-file ${file ? 'visible' : ''}`}>
              <div className="file-icon">📄</div>
              <div className="file-info">
                <div className="file-name">{file?.name || 'File.pdf'}</div>
                <div className="file-size">{file ? formatFileSize(file.size) : '0 MB'}</div>
              </div>
              <button className="btn-remove" onClick={handleRemoveFile}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="divider">
            <span className="divider-text">or</span>
          </div>

          {/* Text Section */}
          <div className="section">
            <h2 className="section-title">Paste Syllabus Text</h2>

            <div className="textarea-wrapper">
              <textarea
                className="syllabus-textarea"
                placeholder={`Paste your syllabus information here...

For example:
• Course: CMPT 310 - Artificial Intelligence
• Assignment 1 due: January 15, 2026
• Midterm: February 20, 2026
• Final Project: March 30, 2026`}
                value={textContent}
                onChange={(e) => {
                  setTextContent(e.target.value)
                  if (e.target.value.trim() && file) {
                    setFile(null)
                  }
                }}
                disabled={!!file}
              />
              <div className="char-count">
                <span>{textContent.length.toLocaleString()}</span> characters
              </div>
            </div>
          </div>

          {/* Submit Section */}
          <div className="submit-section">
            <button
              className={`btn-submit ${isUploading ? 'loading' : ''}`}
              onClick={handleSubmit}
              disabled={(!file && !textContent.trim()) || isUploading}
            >
              {isUploading ? (
                <>
                  <span className="spinner"></span>
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>{file ? 'Continue with File' : textContent.trim() ? 'Continue with Text' : 'Continue'}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
