'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import '@/app/styles/academic-form.css'
import '../assistant/assistant-chat.css'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

const extractDateLines = (text: string) => {
  if (!text) return []
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const monthRegex =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
  const monthDayRegex =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?\b/i
  const dayMonthRegex =
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
  const numericDateRegex = /\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/

  const dateLines = lines.filter((line) => {
    if (numericDateRegex.test(line)) return true
    if (!monthRegex.test(line)) return false
    return monthDayRegex.test(line) || dayMonthRegex.test(line)
  })

  return Array.from(new Set(dateLines)).slice(0, 40)
}

const normalizeDateLine = (line: string, timezone: string) => {
  const monthMap: Record<string, number> = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  }

  const now = new Date()
  const currentYear = now.getFullYear()

  const monthDayMatch = line.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/i
  )

  if (monthDayMatch) {
    const monthKey = monthDayMatch[1].toLowerCase()
    const day = parseInt(monthDayMatch[2], 10)
    let year = monthDayMatch[3] ? parseInt(monthDayMatch[3], 10) : currentYear

    if (!monthDayMatch[3]) {
      const monthIndex = monthMap[monthKey]
      if (monthIndex < now.getMonth() - 1) {
        year += 1
      }
      const date = new Date(year, monthIndex, day)
      return { line, date, timezone }
    }

    const date = new Date(year, monthMap[monthKey], day)
    return { line, date, timezone }
  }

  const numericMatch = line.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/)
  if (numericMatch) {
    const month = parseInt(numericMatch[1], 10) - 1
    const day = parseInt(numericMatch[2], 10)
    let year = numericMatch[3]
      ? parseInt(numericMatch[3].length === 2 ? `20${numericMatch[3]}` : numericMatch[3], 10)
      : currentYear

    if (!numericMatch[3] && month < now.getMonth() - 1) {
      year += 1
    }

    const date = new Date(year, month, day)
    return { line, date, timezone }
  }

  return null
}

const formatYmd = (date: Date) => {
  const yyyy = date.getFullYear()
  const mm = `${date.getMonth() + 1}`.padStart(2, '0')
  const dd = `${date.getDate()}`.padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const detectAssignmentScale = (text: string) => {
  const wordCount = text.split(/\s+/).filter(Boolean).length
  const largeKeywords = /(project|research|capstone|thesis|report|presentation|prototype|case study|paper|final)\b/i
  const mediumKeywords = /(essay|analysis|lab|design|write[-\s]?up|deliverable|proposal)\b/i

  if (largeKeywords.test(text) || wordCount > 1200) return 'large'
  if (mediumKeywords.test(text) || wordCount > 500) return 'medium'
  return 'small'
}

export default function AssignmentHelperPage() {
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
  const [assignmentScale, setAssignmentScale] = useState<'small' | 'medium' | 'large'>('small')

  const totalQuestions = 2
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [hoursPerDay, setHoursPerDay] = useState<number | null>(null)
  const dueDateRef = useRef<string | null>(null)
  const hoursPerDayRef = useRef<number | null>(null)

  const buildInitialMessages = (): Message[] => [
    {
      role: 'assistant',
      content: "Perfect! I've read your assignment and understand what needs to be done.",
    },
    {
      role: 'assistant',
      content: "Just two quick questions:\n\nWhen would you like to complete this assignment?",
    },
  ]

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
          academic_type: 'assignment',
          title: 'Assignment Helper Document',
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
        sessionStorage.setItem('pendingGoalDocumentType', 'assignment')
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
        setAssignmentScale(detectAssignmentScale(content))
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
        setAssignmentScale(detectAssignmentScale(content))
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
      setAssignmentScale(detectAssignmentScale(content))
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
  const handleQuickReply = (reply: string, value?: any) => {
    if (loading) return
    
    // Set both state and ref immediately
    if (questionCount === 1 && typeof value === 'string') {
      setDueDate(value)
      dueDateRef.current = value
    } else if (questionCount === 2 && typeof value === 'number') {
      setHoursPerDay(value)
      hoursPerDayRef.current = value
    }
    
    sendMessage(reply)
  }

  const sendMessage = async (messageText?: string) => {
    const textToSend = messageText || input.trim()
    if (!textToSend || loading) return

    // Parse date from user input (question 1)
    if (questionCount === 1) {
      // Try to parse a date from the response
      const dateMatch = textToSend.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/)
      if (dateMatch) {
        const month = parseInt(dateMatch[1])
        const day = parseInt(dateMatch[2])
        const year = dateMatch[3] ? parseInt(dateMatch[3]) : new Date().getFullYear()
        const fullYear = year < 100 ? 2000 + year : year
        setDueDate(`${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
      }
    }

    // Parse hours from user input (question 2)
    if (questionCount === 2) {
      const hoursMatch = textToSend.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i) || textToSend.match(/^(\d+(?:\.\d+)?)$/)
      if (hoursMatch) {
        setHoursPerDay(parseFloat(hoursMatch[1]))
      }
    }

    const newMessages: Message[] = [...messages, { role: 'user', content: textToSend }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    await new Promise((resolve) => setTimeout(resolve, 800))

    const newQuestionCount = questionCount + 1
    let assistantMessage = ''

    if (questionCount === 1) {
      assistantMessage = 'Great! How many hours per day can you dedicate to working on this assignment?'
    } else if (questionCount === 2) {
      // Get the latest values from refs
      const finalDueDate = dueDateRef.current
      const finalHoursPerDay = hoursPerDayRef.current

      if (!finalDueDate || !finalHoursPerDay) {
        console.error('Missing data after Q2:', { finalDueDate, finalHoursPerDay })
        alert('Please answer all questions using the buttons.')
        setLoading(false)
        return
      }

      assistantMessage = "Perfect! I'm now creating your assignment breakdown with specific, actionable tasks. This will just take a moment..."
      setQuestionCount(newQuestionCount)
      setMessages([...newMessages, { role: 'assistant', content: assistantMessage }])
      setLoading(false)

      setTimeout(() => {
        handleCreatePlan(newMessages, finalDueDate, finalHoursPerDay)
      }, 1500)
      return
    }

    setQuestionCount(newQuestionCount)
    setMessages([...newMessages, { role: 'assistant', content: assistantMessage }])
    setLoading(false)
  }

  const handleCreatePlan = async (conversationMessages: Message[], planDueDate: string, planHoursPerDay: number) => {
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

      console.log('Creating assignment plan:', { planDueDate, planHoursPerDay })

      const creationTimestamp = Date.now().toString()
      sessionStorage.setItem('newGoalCreationTimestamp', creationTimestamp)

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

      // Use the NEW simplified assignment helper API with passed parameters
      fetch('/api/assignment-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId,
          timezone,
          assignmentContent: extractedContent,
          dueDate: planDueDate,
          hoursPerDay: planHoursPerDay
        }),
      }).catch((e) => {
        console.error('Background plan creation error:', e)
      })

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
                <div className="header-subtitle">Planning your assignment</div>
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
                  {msg.role === 'assistant' && idx === messages.length - 1 && !loading && (
                    <>
                      {questionCount === 1 && (
                        <div className="quick-replies">
                          <button
                            className="quick-reply-btn"
                            onClick={() => {
                              const date = new Date()
                              date.setDate(date.getDate() + 3)
                              const formatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                              setDueDate(formatted)
                              dueDateRef.current = formatted
                              handleQuickReply('In 3 days', formatted)
                            }}
                          >
                            In 3 days
                          </button>
                          <button
                            className="quick-reply-btn"
                            onClick={() => {
                              const date = new Date()
                              date.setDate(date.getDate() + 7)
                              const formatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                              setDueDate(formatted)
                              dueDateRef.current = formatted
                              handleQuickReply('In 1 week', formatted)
                            }}
                          >
                            In 1 week
                          </button>
                          <button
                            className="quick-reply-btn"
                            onClick={() => {
                              const date = new Date()
                              date.setDate(date.getDate() + 14)
                              const formatted = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                              setDueDate(formatted)
                              dueDateRef.current = formatted
                              handleQuickReply('In 2 weeks', formatted)
                            }}
                          >
                            In 2 weeks
                          </button>
                        </div>
                      )}
                      {questionCount === 2 && (
                        <div className="quick-replies">
                          <button
                            className="quick-reply-btn"
                            onClick={() => {
                              setHoursPerDay(1)
                              hoursPerDayRef.current = 1
                              handleQuickReply('1 hour', 1)
                            }}
                          >
                            1 hour/day
                          </button>
                          <button
                            className="quick-reply-btn"
                            onClick={() => {
                              setHoursPerDay(2)
                              hoursPerDayRef.current = 2
                              handleQuickReply('2 hours', 2)
                            }}
                          >
                            2 hours/day
                          </button>
                          <button
                            className="quick-reply-btn"
                            onClick={() => {
                              setHoursPerDay(3)
                              hoursPerDayRef.current = 3
                              handleQuickReply('3 hours', 3)
                            }}
                          >
                            3 hours/day
                          </button>
                        </div>
                      )}
                      {questionCount === 3 && (
                        <div className="quick-replies">
                          <button
                            className="quick-reply-btn"
                            onClick={() => handleQuickReply('2-4 hours total')}
                          >
                            2-4 hours
                          </button>
                          <button
                            className="quick-reply-btn"
                            onClick={() => handleQuickReply('5-8 hours total')}
                          >
                            5-8 hours
                          </button>
                          <button
                            className="quick-reply-btn"
                            onClick={() => handleQuickReply('9-15 hours total')}
                          >
                            9-15 hours
                          </button>
                          <button
                            className="quick-reply-btn"
                            onClick={() => handleQuickReply('15+ hours total')}
                          >
                            15+ hours
                          </button>
                        </div>
                      )}
                      {questionCount === 4 && (
                        <div className="quick-replies">
                          <button
                            className="quick-reply-btn"
                            onClick={() => handleQuickReply('In 3 days')}
                          >
                            In 3 days
                          </button>
                          <button
                            className="quick-reply-btn"
                            onClick={() => handleQuickReply('In 1 week')}
                          >
                            In 1 week
                          </button>
                          <button
                            className="quick-reply-btn"
                            onClick={() => handleQuickReply('In 2 weeks')}
                          >
                            In 2 weeks
                          </button>
                          <button
                            className="quick-reply-btn"
                            onClick={() => handleQuickReply('In 1 month')}
                          >
                            In 1 month
                          </button>
                        </div>
                      )}
                    </>
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
            <div className="header-icon">📝</div>
            <h1 className="page-title">Assignment Helper</h1>
            <p className="page-subtitle">Upload your assignment to create a completion plan</p>
          </div>
          <Link href="/academic-hub" className="btn-back">
            Back
          </Link>
        </div>

        {/* Main Content */}
        <div className="main-content">
          {/* Upload Section */}
          <div className="section">
            <h2 className="section-title">Upload Assignment</h2>

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
            <h2 className="section-title">Paste Assignment Text</h2>

            <div className="textarea-wrapper">
              <textarea
                className="syllabus-textarea"
                placeholder={`Paste your assignment requirements here...

For example:
• Assignment: Research Paper on Machine Learning
• Requirements: 10 pages, APA format
• Topics: Neural networks, deep learning applications
• Due Date: February 15, 2026`}
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
