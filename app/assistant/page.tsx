'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import './assistant-chat.css'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

export default function AssistantPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hey, I'm Orah. Tell me your goal and I’ll help you break it into steps, schedule tasks, and keep you on track.",
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [creatingPlan, setCreatingPlan] = useState(false)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      const token = data.session?.access_token || null
      const uid = data.session?.user?.id || null
      setSessionToken(token)
      setUserId(uid)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      setSessionToken(session?.access_token ?? null)
      setUserId(session?.user?.id ?? null)
    })

    return () => {
      active = false
      subscription?.subscription?.unsubscribe()
    }
  }, [supabase])

  const send = async (messageText?: string) => {
    const textToSend = messageText || input.trim()
    if (!textToSend || loading) return
    
    const newMessages = [...messages, { role: 'user', content: textToSend }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/orah-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      if (!res.ok) {
        throw new Error('Failed to reach Orah. Please try again.')
      }
      const data = await res.json()
      if (!data?.reply) {
        throw new Error('Empty response from Orah.')
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
    } catch (e: any) {
      setError(e.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const lastAssistantMessage = messages
    .slice()
    .reverse()
    .find((m) => m.role === 'assistant')?.content

  const canEndConversation =
    !!lastAssistantMessage && lastAssistantMessage.trim().toUpperCase() === 'END_CONVERSATION'

  const handleCreatePlan = async () => {
    // Always re-fetch session to ensure we have a fresh token
    const fresh = await supabase.auth.getSession()
    const token = fresh.data.session?.access_token || sessionToken
    const uid = fresh.data.session?.user?.id || userId

    console.log('Auth check:', { 
      hasSession: !!fresh.data.session, 
      hasToken: !!token, 
      hasUid: !!uid,
      tokenPreview: token?.substring(0, 20) 
    })

    if (!token || !uid) {
      // Show more specific error
      const errorMsg = !token 
        ? 'No session token found. Please log in again.' 
        : 'No user ID found. Please log in again.'
      setError(errorMsg)
      console.error('Auth failed:', errorMsg, { fresh: fresh.data })
      // Redirect to login
      setTimeout(() => router.push('/login'), 2000)
      return
    }

    setSessionToken(token)
    setUserId(uid)
    setCreatingPlan(true)
    setError(null)

    // Store timestamp so loading screen knows to wait for NEW goal
    const creationTimestamp = new Date().toISOString()
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('newGoalCreationTimestamp', creationTimestamp)
    }

    // Start the edge function call in the background (don't wait)
    fetch('/api/create-plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages,
        userId: uid,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    }).catch(e => {
      console.error('Background plan creation error:', e)
    })

    // Immediately navigate to loading screen (don't wait for completion)
    router.push('/plan-loading')
  }

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleQuickReply = (reply: string) => {
    if (loading) return
    send(reply)
  }

  const handleTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement
    target.style.height = 'auto'
    target.style.height = target.scrollHeight + 'px'
  }

  return (
    <>
      {/* Background */}
      <div className="noise-bg"></div>

      {/* Chat Container */}
      <div className="chat-container">
        {/* Header */}
        <div className="chat-header">
          <div className="header-content">
            <div className="orah-avatar">O</div>
            <div className="header-text">
              <h1>Chat with Orah</h1>
              <div className="header-subtitle">
                {canEndConversation ? 'Ready to create your plan' : 'Planning your goals'}
              </div>
              {loading && (
                <div className="typing-indicator active">
                  <span>Orah is typing...</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Messages */}
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
              </div>
            </div>
          ))}

          {/* Typing Indicator */}
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

          {/* Error Message */}
          {error && (
            <div className="message assistant">
              <div className="message-avatar">O</div>
              <div className="message-content">
                <div className="message-bubble" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                  ⚠️ {error}
                </div>
              </div>
            </div>
          )}

          {/* Create Plan Button */}
          {canEndConversation && (
            <div className="message assistant">
              <div className="message-avatar">O</div>
              <div className="message-content">
                <div className="message-bubble">
                  Perfect! I have all the information I need. Ready to create your personalized plan?
                </div>
                <div className="quick-replies">
                  <button
                    className="quick-reply-btn"
                    onClick={handleCreatePlan}
                    disabled={creatingPlan}
                  >
                    {creatingPlan ? 'Creating your plan...' : 'Create my plan'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
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
              onKeyDown={handleKey}
              disabled={loading || canEndConversation}
            />
            <button
              className="send-btn"
              id="sendBtn"
              onClick={send}
              disabled={loading || !input.trim() || canEndConversation}
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

