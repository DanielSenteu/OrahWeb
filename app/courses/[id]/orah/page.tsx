'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Navigation from '@/components/layout/Navigation'
import { OrahMessage, MarkdownMessage, downloadCheatsheetPDF, OrahErrorBoundary } from '../orah-components'
import '../course-dashboard.css'
import './orah-fullpage.css'

interface Course {
  id: string
  course_name: string
  color: string
  syllabus_text: string | null
}

const CHIPS = [
  "What's missing from this course?",
  "Make a cheatsheet",
  "Create a practice quiz",
  "Draw a concept map",
  "Add a study task",
  "Show my full schedule",
]

export default function OrahFullPage() {
  const router = useRouter()
  const params = useParams()
  const courseId = params.id as string
  const supabase = createClient()

  const [course, setCourse] = useState<Course | null>(null)
  const [loading, setLoading] = useState(true)
  const [orahMessages, setOrahMessages] = useState<OrahMessage[]>([])
  const [orahInput, setOrahInput] = useState('')
  const [orahLoading, setOrahLoading] = useState(false)
  const orahEndRef = useRef<HTMLDivElement>(null)
  const orahInputRef = useRef<HTMLTextAreaElement>(null)
  const streamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    loadCourse()
    return () => { if (streamTimerRef.current) clearTimeout(streamTimerRef.current) }
  }, [courseId])

  useEffect(() => { orahEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [orahMessages, orahLoading])

  useEffect(() => {
    if (orahMessages.length === 0 && course) {
      setOrahMessages([{
        role: 'assistant',
        content: `Hey! I'm **Orah**, your AI for **${course.course_name}**.\n\nI have full access to your recordings, transcripts, schedule, and course data. Ask me anything — I can make cheatsheets, solve math, draw diagrams, create quizzes, build study plans, and more.`,
      }])
    }
  }, [course])

  const loadCourse = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase
        .from('courses')
        .select('id, course_name, color, syllabus_text')
        .eq('id', courseId)
        .eq('user_id', user.id)
        .single()
      if (data) setCourse(data)
      else router.push('/courses')
    } catch { router.push('/courses') }
    finally { setLoading(false) }
  }

  const streamIntoMessage = useCallback((fullText: string, msgIndex: number, extras: Partial<OrahMessage>, onDone?: () => void) => {
    const tokens = fullText.split(/(\s+)/)
    let pos = 0
    const CHUNK = 4
    const DELAY = 16
    const tick = () => {
      if (pos >= tokens.length) {
        setOrahMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, ...extras, content: fullText } : m))
        onDone?.()
        return
      }
      const chunk = tokens.slice(pos, pos + CHUNK).join('')
      setOrahMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, content: m.content + chunk } : m))
      pos += CHUNK
      streamTimerRef.current = setTimeout(tick, DELAY)
    }
    tick()
  }, [])

  const sendOrahMessage = async (text?: string) => {
    const msg = text || orahInput.trim()
    if (!msg || orahLoading) return

    const newMessages: OrahMessage[] = [...orahMessages, { role: 'user', content: msg }]
    setOrahMessages(newMessages)
    setOrahInput('')
    if (orahInputRef.current) orahInputRef.current.style.height = 'auto'
    setOrahLoading(true)

    try {
      const res = await fetch('/api/course-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          courseId,
          courseName: course?.course_name,
          syllabus: course?.syllabus_text ?? null,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()

      const reply: string = data.reply || 'Sorry, I had trouble replying.'
      const extras: Partial<OrahMessage> = {
        isCheatsheet: data.isCheatsheet,
        cheatsheetTitle: data.cheatsheetTitle,
        isMath: data.isMath,
        taskCreated: data.taskCreated ?? undefined,
      }

      const msgIndex = newMessages.length
      setOrahMessages(prev => [...prev, { role: 'assistant', content: '' }])
      setOrahLoading(false)
      streamIntoMessage(reply, msgIndex, extras)
    } catch {
      setOrahLoading(false)
      setOrahMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble connecting. Try again.' }])
    }
  }

  const courseColor = course?.color || '#6366f1'

  if (loading) {
    return (
      <>
        <Navigation />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <div className="spinner" style={{ width: '40px', height: '40px' }} />
        </div>
      </>
    )
  }

  if (!course) return null

  return (
    <>
      <Navigation />
      <div className="orah-fp-wrapper">

        {/* Header */}
        <div className="orah-fp-header" style={{ borderBottom: `1.5px solid ${courseColor}33` }}>
          <button className="orah-fp-back" onClick={() => router.push(`/courses/${courseId}`)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back to Course
          </button>
          <div className="orah-fp-brand">
            <div className="orah-fp-icon" style={{ background: `${courseColor}22`, color: courseColor }}>O</div>
            <div>
              <div className="orah-fp-name">Orah</div>
              <div className="orah-fp-course">{course.course_name}</div>
            </div>
          </div>
          <div className="orah-fp-caps">
            {['Recordings', 'Transcripts', 'Schedule', 'Cheatsheets', 'Math', 'Diagrams', 'Quizzes', 'HTML'].map(cap => (
              <span key={cap} className="orah-cap-tag">{cap}</span>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="orah-fp-messages">
          {orahMessages.map((m, idx) => (
            <div key={idx} className={`orah-msg orah-msg--${m.role} orah-fp-msg`}>
              {m.role === 'assistant' && (
                <div className="orah-msg-avatar" style={{ color: courseColor }}>O</div>
              )}
              <div className={`orah-msg-bubble${m.isMath ? ' orah-msg-bubble--math' : ''}`}>
                {m.role === 'assistant'
                  ? <OrahErrorBoundary><MarkdownMessage content={m.content} isMath={m.isMath} /></OrahErrorBoundary>
                  : <span>{m.content}</span>
                }

                {m.taskCreated && (
                  <div className="orah-task-created">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    <span>Task added: <strong>{m.taskCreated.title}</strong> on {m.taskCreated.date}</span>
                  </div>
                )}

                {m.isCheatsheet && m.content.length > 20 && (
                  <button
                    className="orah-pdf-btn"
                    style={{ borderColor: `${courseColor}55`, color: courseColor }}
                    onClick={() => downloadCheatsheetPDF(m.cheatsheetTitle || 'Cheatsheet', m.content)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download PDF
                  </button>
                )}
              </div>
            </div>
          ))}

          {orahMessages.length === 1 && !orahLoading && (
            <div className="orah-suggestions orah-fp-suggestions">
              {CHIPS.map(chip => (
                <button
                  key={chip}
                  className="orah-chip"
                  style={{ borderColor: `${courseColor}44`, color: courseColor }}
                  onClick={() => sendOrahMessage(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {orahLoading && (
            <div className="orah-msg orah-msg--assistant orah-fp-msg">
              <div className="orah-msg-avatar" style={{ color: courseColor }}>O</div>
              <div className="orah-msg-bubble orah-typing"><span /><span /><span /></div>
            </div>
          )}
          <div ref={orahEndRef} />
        </div>

        {/* Input */}
        <div className="orah-fp-input-area" style={{ borderTop: `1.5px solid ${courseColor}22` }}>
          <div className="orah-input-row">
            <textarea
              ref={orahInputRef}
              className="orah-input orah-fp-textarea"
              placeholder="Ask Orah anything about this course…"
              value={orahInput}
              rows={1}
              onChange={e => {
                setOrahInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendOrahMessage() }
              }}
            />
            <button
              className="orah-send"
              style={{ background: courseColor }}
              onClick={() => sendOrahMessage()}
              disabled={orahLoading || !orahInput.trim()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          <p className="orah-disclaimer">Orah can make mistakes. Verify important information.</p>
        </div>

      </div>
    </>
  )
}
