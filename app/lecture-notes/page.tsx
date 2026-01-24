'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Navigation from '@/components/layout/Navigation'
import './lecture-notes.css'

type Mode = 'choose' | 'type' | 'record' | 'result'

interface GeneratedNotes {
  title: string
  summary: string
  sections: { title: string; content: string[] }[]
  keyTakeaways: string[]
  definitions: { term: string; definition: string }[]
}

interface QaMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function LectureNotesPage() {
  const router = useRouter()
  const supabase = createClient()
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const [mode, setMode] = useState<Mode>('choose')
  const [roughNotes, setRoughNotes] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [generatedNotes, setGeneratedNotes] = useState<GeneratedNotes | null>(null)
  const [savedNotes, setSavedNotes] = useState<any[]>([])
  const [showSavedNotes, setShowSavedNotes] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [showQa, setShowQa] = useState(false)
  const [qaMessages, setQaMessages] = useState<QaMessage[]>([])
  const [qaInput, setQaInput] = useState('')
  const [isAsking, setIsAsking] = useState(false)

  // Load saved notes on mount
  useEffect(() => {
    const loadNotes = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      
      setUserId(user.id)

      const { data, error } = await supabase
        .from('lecture_notes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (data && !error) {
        setSavedNotes(data)
      }
    }

    loadNotes()
  }, [router, supabase])

  const saveNotesToDatabase = async (notes: GeneratedNotes, sourceType: 'typed' | 'recorded', originalContent: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('lecture_notes')
        .insert({
          user_id: user.id,
          title: notes.title,
          summary: notes.summary,
          sections: notes.sections,
          key_takeaways: notes.keyTakeaways,
          definitions: notes.definitions,
          source_type: sourceType,
          original_content: originalContent,
        })
        .select()
        .single()

      if (error) {
        console.error('Error saving notes:', error)
        return
      }

      console.log('✅ Notes saved to database')
      if (data?.id) {
        setActiveNoteId(data.id)
        setQaMessages([])
        setShowQa(false)
      }
      
      // Refresh saved notes list
      const { data: updatedNotes } = await supabase
        .from('lecture_notes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (updatedNotes) {
        setSavedNotes(updatedNotes)
      }
    } catch (error) {
      console.error('Error saving notes:', error)
    }
  }

  const loadNoteQa = async (noteId: string) => {
    const { data, error } = await supabase
      .from('lecture_notes_qa')
      .select('question, answer, created_at')
      .eq('note_id', noteId)
      .order('created_at', { ascending: true })

    if (!error && data) {
      const history: QaMessage[] = []
      data.forEach((item) => {
        history.push({ role: 'user' as const, content: item.question })
        history.push({ role: 'assistant' as const, content: item.answer })
      })
      setQaMessages(history)
    }
  }

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isRecording])

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach((track) => track.stop())
        await processRecording(audioBlob)
      }

      mediaRecorder.start()
      setIsRecording(true)
      setRecordingTime(0)
    } catch (error) {
      console.error('Error starting recording:', error)
      alert('Failed to access microphone. Please check permissions.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const processRecording = async (audioBlob: Blob) => {
    setIsProcessing(true)

    try {
      if (!userId) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }
        setUserId(user.id)
      }

      // Convert audio to base64
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(audioBlob)
      })

      const base64 = await base64Promise
      const base64Data = base64.split(',')[1]

      // Send to Supabase Edge Function for transcription and note generation
      // Edge function has no timeout limits - perfect for long recordings
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Not authenticated')
      }

      const res = await fetch('/api/lecture-notes/audio-edge', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ 
          audio: base64Data,
          userId: userId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        // If we have a transcript and can retry, show it
        if (data.transcript && data.canRetry) {
          // Transcript was saved, but note generation failed
          alert(`Transcript saved successfully, but note generation failed. You can retry from your saved notes. Error: ${data.details || 'Unknown error'}`)
          // Refresh notes list to show the failed one
          const { data: updatedNotes } = await supabase
            .from('lecture_notes')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
          if (updatedNotes) {
            setSavedNotes(updatedNotes)
          }
          setMode('choose')
          return
        }
        throw new Error(data.details || 'Failed to process recording')
      }

      // Success - notes generated
      if (data.notes) {
        setGeneratedNotes(data.notes)
        if (data.noteId) {
          setActiveNoteId(data.noteId)
        }
        setMode('result')
      } else {
        // Transcript saved but notes not generated yet (shouldn't happen, but handle it)
        alert('Transcript saved. Generating notes...')
        setMode('choose')
      }
    } catch (error: any) {
      console.error('Error processing recording:', error)
      alert(`Failed to process recording: ${error.message || 'Unknown error'}. Your transcript may have been saved - check your saved notes.`)
      setMode('choose')
    } finally {
      setIsProcessing(false)
    }
  }

  const handlePolishNotes = async () => {
    if (!roughNotes.trim()) return

    setIsProcessing(true)

    try {
      const res = await fetch('/api/lecture-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: roughNotes.trim(),
          courseName: 'Lecture Notes',
        }),
      })

      if (!res.ok) throw new Error('Failed to polish notes')

      const data = await res.json()
      setGeneratedNotes(data.notes)
      
      // Save to database
      await saveNotesToDatabase(data.notes, 'typed', roughNotes)
      
      setMode('result')
    } catch (error) {
      console.error('Error polishing notes:', error)
      alert('Failed to polish notes. Please try again.')
    } finally {
      setIsProcessing(false)
    }
  }

  const loadSavedNote = (note: any) => {
    setGeneratedNotes({
      title: note.title,
      summary: note.summary,
      sections: note.sections,
      keyTakeaways: note.key_takeaways,
      definitions: note.definitions,
    })
    setActiveNoteId(note.id)
    setShowQa(false)
    setQaMessages([])
    setMode('result')
  }

  useEffect(() => {
    if (showQa && activeNoteId) {
      loadNoteQa(activeNoteId)
    }
  }, [showQa, activeNoteId])

  const retryNoteGeneration = async (noteId: string) => {
    if (!userId) return

    setIsProcessing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Not authenticated')
      }

      const res = await fetch('/api/lecture-notes/retry', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ noteId, userId }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.details || 'Failed to retry note generation')
      }

      // Update the note in the list
      const { data: updatedNotes } = await supabase
        .from('lecture_notes')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (updatedNotes) {
        setSavedNotes(updatedNotes)
      }

      // Load the newly generated note
      if (data.notes) {
        setGeneratedNotes(data.notes)
        setActiveNoteId(noteId)
        setMode('result')
      } else {
        alert('Notes generated successfully! Refresh to see them.')
        setMode('choose')
      }
    } catch (error: any) {
      console.error('Error retrying note generation:', error)
      alert(`Failed to retry: ${error.message || 'Unknown error'}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const sendQaQuestion = async () => {
    if (!qaInput.trim() || !activeNoteId || isAsking) return

    const question = qaInput.trim()
    setQaInput('')
    setIsAsking(true)

    const userMessage: QaMessage = { role: 'user' as const, content: question }
    const nextMessages = [...qaMessages, userMessage]
    setQaMessages(nextMessages)

    try {
      const res = await fetch('/api/lecture-notes/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId: activeNoteId, question }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to answer question')
      }

      const assistantMessage: QaMessage = { role: 'assistant' as const, content: data.reply }
      setQaMessages([...nextMessages, assistantMessage])
    } catch (error: any) {
      const errorMessage: QaMessage = {
        role: 'assistant' as const,
        content: error?.message || 'Sorry, I could not answer that right now.',
      }
      setQaMessages([...nextMessages, errorMessage])
    } finally {
      setIsAsking(false)
    }
  }

  // Choose mode screen
  if (mode === 'choose') {
    return (
      <>
        <div className="noise-bg"></div>
        <Navigation />
        <div className="container">
          <div className="page-header">
            <div className="header-top">
              <div>
                <h1 className="page-title">Lecture Notes</h1>
                <p className="page-subtitle">
                  {savedNotes.length > 0
                    ? `${savedNotes.length} saved note${savedNotes.length !== 1 ? 's' : ''}`
                    : 'Choose how you want to create your notes'}
                </p>
              </div>
              <Link href="/academic-hub" className="btn-back">
                Back
              </Link>
            </div>
          </div>

          {/* Processing/Pending Lectures Section */}
          {savedNotes.filter((n) => n.processing_status === 'processing' || n.processing_status === 'pending').length > 0 && (
            <div style={{ marginBottom: '3rem' }}>
              <h2
                style={{
                  fontFamily: 'Syne, sans-serif',
                  fontSize: '1.5rem',
                  fontWeight: '700',
                  marginBottom: '1.5rem',
                  color: 'var(--primary-cyan)',
                }}
              >
                Processing ({savedNotes.filter((n) => n.processing_status === 'processing' || n.processing_status === 'pending').length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {savedNotes
                  .filter((note) => note.processing_status === 'processing' || note.processing_status === 'pending')
                  .map((note) => (
                    <div
                      key={note.id}
                      className="text-card"
                      style={{
                        padding: '1.5rem',
                        borderColor: 'var(--primary-cyan)',
                        background: 'rgba(6, 182, 212, 0.05)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div style={{ flex: 1 }}>
                          <h3
                            style={{
                              fontFamily: 'Syne, sans-serif',
                              fontSize: '1.25rem',
                              fontWeight: '600',
                              marginBottom: '0.5rem',
                            }}
                          >
                            {note.title || 'Processing...'}
                          </h3>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', marginBottom: '0.5rem' }}>
                            {note.processing_status === 'processing' 
                              ? 'Generating notes from transcript...' 
                              : 'Transcript saved. Ready to generate notes.'}
                          </p>
                          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                            {new Date(note.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}{' '}
                            • {note.source_type === 'recorded' ? '🎙️ Recorded' : '✍️ Typed'}
                          </p>
                        </div>
                        {note.processing_status === 'pending' && (
                          <button
                            className="btn-polish"
                            onClick={async (e) => {
                              e.stopPropagation()
                              await retryNoteGeneration(note.id)
                            }}
                            style={{
                              background: 'var(--primary-cyan)',
                              color: 'white',
                              padding: '0.5rem 1rem',
                              fontSize: '0.875rem',
                            }}
                          >
                            Generate Notes
                          </button>
                        )}
                        {note.processing_status === 'processing' && (
                          <div className="spinner" style={{ width: '20px', height: '20px', border: '2px solid rgba(6, 182, 212, 0.3)', borderTopColor: 'var(--primary-cyan)' }}></div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
              <div
                style={{
                  height: '1px',
                  background: 'var(--border-subtle)',
                  margin: '3rem 0',
                }}
              ></div>
            </div>
          )}

          {/* Failed Lectures Section */}
          {savedNotes.filter((n) => n.processing_status === 'failed').length > 0 && (
            <div style={{ marginBottom: '3rem' }}>
              <h2
                style={{
                  fontFamily: 'Syne, sans-serif',
                  fontSize: '1.5rem',
                  fontWeight: '700',
                  marginBottom: '1.5rem',
                  color: 'var(--primary-red)',
                }}
              >
                Failed to Process ({savedNotes.filter((n) => n.processing_status === 'failed').length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {savedNotes
                  .filter((note) => note.processing_status === 'failed')
                  .map((note) => (
                    <div
                      key={note.id}
                      className="text-card"
                      style={{
                        padding: '1.5rem',
                        borderColor: 'var(--primary-red)',
                        background: 'rgba(239, 68, 68, 0.05)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div style={{ flex: 1 }}>
                          <h3
                            style={{
                              fontFamily: 'Syne, sans-serif',
                              fontSize: '1.25rem',
                              fontWeight: '600',
                              marginBottom: '0.5rem',
                            }}
                          >
                            {note.title || 'Failed Lecture'}
                          </h3>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', marginBottom: '0.5rem' }}>
                            {note.error_message || 'Failed to generate notes from transcript'}
                          </p>
                          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                            {new Date(note.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}{' '}
                            • {note.source_type === 'recorded' ? '🎙️ Recorded' : '✍️ Typed'}
                            {note.retry_count > 0 && ` • Retried ${note.retry_count} time${note.retry_count !== 1 ? 's' : ''}`}
                          </p>
                        </div>
                        <button
                          className="btn-polish"
                          onClick={async (e) => {
                            e.stopPropagation()
                            await retryNoteGeneration(note.id)
                          }}
                          style={{
                            background: 'var(--primary-red)',
                            color: 'white',
                            padding: '0.5rem 1rem',
                            fontSize: '0.875rem',
                          }}
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
              <div
                style={{
                  height: '1px',
                  background: 'var(--border-subtle)',
                  margin: '3rem 0',
                }}
              ></div>
            </div>
          )}

          {/* Saved Notes List */}
          {savedNotes.filter((n) => n.processing_status === 'completed' || !n.processing_status).length > 0 && (
            <div style={{ marginBottom: '3rem' }}>
              <h2
                style={{
                  fontFamily: 'Syne, sans-serif',
                  fontSize: '1.5rem',
                  fontWeight: '700',
                  marginBottom: '1.5rem',
                }}
              >
                Your Saved Notes
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {savedNotes
                  .filter((note) => note.processing_status === 'completed' || !note.processing_status)
                  .map((note) => (
                    <div
                      key={note.id}
                      className="text-card"
                      style={{ cursor: 'pointer', padding: '1.5rem' }}
                      onClick={() => loadSavedNote(note)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div style={{ flex: 1 }}>
                          <h3
                            style={{
                              fontFamily: 'Syne, sans-serif',
                              fontSize: '1.25rem',
                              fontWeight: '600',
                              marginBottom: '0.5rem',
                            }}
                          >
                            {note.title}
                          </h3>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
                            {note.summary.substring(0, 150)}
                            {note.summary.length > 150 ? '...' : ''}
                          </p>
                          <p style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                            {new Date(note.created_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}{' '}
                            • {note.source_type === 'recorded' ? '🎙️ Recorded' : '✍️ Typed'}
                          </p>
                        </div>
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          style={{ width: '20px', height: '20px', color: 'var(--text-tertiary)' }}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    </div>
                  ))}
              </div>
              <div
                style={{
                  height: '1px',
                  background: 'var(--border-subtle)',
                  margin: '3rem 0',
                }}
              ></div>
            </div>
          )}

          {/* Create New Notes Options */}
          <h2
            style={{
              fontFamily: 'Syne, sans-serif',
              fontSize: '1.5rem',
              fontWeight: '700',
              marginBottom: '1.5rem',
            }}
          >
            Create New Notes
          </h2>
          <div className="options-grid">
            {/* Type Notes Option */}
            <div className="option-card" onClick={() => setMode('type')}>
              <div className="option-icon">✍️</div>
              <h2 className="option-title">Type Rough Notes</h2>
              <p className="option-description">
                Type or paste your rough lecture notes, and I'll organize and polish them for you
              </p>
            </div>

            {/* Record Audio Option */}
            <div className="option-card" onClick={() => setMode('record')}>
              <div className="option-icon">🎙️</div>
              <h2 className="option-title">Record Lecture</h2>
              <p className="option-description">
                Record your lecture with your microphone and I'll transcribe and create organized notes
              </p>
            </div>
          </div>
        </div>
      </>
    )
  }

  // Recording mode
  if (mode === 'record') {
    if (!isRecording && !isProcessing) {
      // Ready to start recording
      return (
        <>
          <div className="noise-bg"></div>
          <Navigation />
          <div className="container">
            <div className="page-header">
              <div className="header-top">
                <div>
                  <h1 className="page-title">Record Lecture</h1>
                  <p className="page-subtitle">Click the button below to start recording</p>
                </div>
                <button onClick={() => setMode('choose')} className="btn-back">
                  Back
                </button>
              </div>
            </div>

            <div className="recording-interface">
              <div className="recording-card">
                <div className="recording-visualizer">
                  <div
                    className="recording-circle"
                    style={{
                      background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(168, 85, 247, 0.2))',
                      border: '3px solid var(--primary-cyan)',
                      animation: 'none',
                    }}
                  >
                    🎙️
                  </div>
                </div>
                <button className="btn-polish" onClick={startRecording}>
                  <span>Start Recording</span>
                  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </>
      )
    }

    if (isRecording) {
      // Currently recording
      return (
        <>
          <div className="noise-bg"></div>
          <Navigation />
          <div className="container">
            <div className="page-header">
              <div className="header-top">
                <div>
                  <h1 className="page-title">Recording...</h1>
                  <p className="page-subtitle">Speak clearly into your microphone</p>
                </div>
              </div>
            </div>

            <div className="recording-interface">
              <div className="recording-card">
                <div className="recording-visualizer">
                  <div className="recording-circle">🎙️</div>
                </div>
                <div className="recording-time">{formatRecordingTime(recordingTime)}</div>
                <div className="recording-controls">
                  <button className="btn-stop-recording" onClick={stopRecording}>
                    Stop Recording
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )
    }

    // Processing recording
      return (
        <>
          <div className="noise-bg"></div>
          <Navigation />
          <div className="container">
            <div className="recording-interface">
            <div className="recording-card">
              <div className="recording-visualizer">
                <div
                  className="recording-circle"
                  style={{
                    background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(168, 85, 247, 0.2))',
                    border: '3px solid var(--primary-cyan)',
                  }}
                >
                  <div className="spinner" style={{ width: '60px', height: '60px', border: '4px solid rgba(6, 182, 212, 0.3)', borderTopColor: 'var(--primary-cyan)' }}></div>
                </div>
              </div>
              <h2 className="option-title">Processing Recording...</h2>
              <p className="option-description">Transcribing and generating your notes</p>
            </div>
          </div>
        </div>
      </>
    )
  }

  // Type notes mode
  if (mode === 'type') {
    return (
      <>
        <div className="noise-bg"></div>
        <Navigation />
        <div className="container">
          <div className="page-header">
            <div className="header-top">
              <div>
                <h1 className="page-title">Type Your Notes</h1>
                <p className="page-subtitle">I'll organize and polish them for you</p>
              </div>
              <button onClick={() => setMode('choose')} className="btn-back">
                Back
              </button>
            </div>
          </div>

          <div className="text-interface">
            <div className="text-card">
              <div className="textarea-wrapper">
                <textarea
                  className="notes-textarea"
                  placeholder={`Type or paste your rough lecture notes here...

For example:
- prof talked about neural networks
- supervised learning uses labeled data
- backpropagation adjusts weights
- overfitting happens when model too complex
- regularization helps prevent overfitting`}
                  value={roughNotes}
                  onChange={(e) => setRoughNotes(e.target.value)}
                  disabled={isProcessing}
                />
                <div className="char-count">{roughNotes.length.toLocaleString()} characters</div>
              </div>

              <button
                className={`btn-polish ${isProcessing ? 'loading' : ''}`}
                onClick={handlePolishNotes}
                disabled={!roughNotes.trim() || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <span className="spinner"></span>
                    <span>Polishing your notes...</span>
                  </>
                ) : (
                  <>
                    <span>Polish My Notes</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7" />
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

  // Result mode
  if (mode === 'result' && generatedNotes) {
    return (
      <>
        <div className="noise-bg"></div>
        <Navigation />
        <div className="container">
          <div className="page-header">
            <div className="header-top">
              <div>
                <h1 className="page-title">Your Polished Notes</h1>
                <p className="page-subtitle">{generatedNotes.title}</p>
              </div>
              <button onClick={() => setMode('choose')} className="btn-back">
                New Notes
              </button>
            </div>
          </div>

          <div className="ask-lecture-cta">
            <button
              className="btn-ask-lecture"
              onClick={() => setShowQa((prev) => !prev)}
              disabled={!activeNoteId}
            >
              Ask anything about the lecture
            </button>
            <p className="ask-lecture-subtitle">
              Answers are grounded only in your lecture transcript.
            </p>
          </div>

          {showQa && (
            <div className="qa-panel">
              <div className="qa-messages">
                {qaMessages.length === 0 && (
                  <div className="qa-empty">
                    Ask a question and I will answer only from your transcript.
                  </div>
                )}
                {qaMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`qa-message ${message.role}`}
                  >
                    {message.content}
                  </div>
                ))}
              </div>
              <div className="qa-input-row">
                <textarea
                  className="qa-input"
                  placeholder="Ask a question about this lecture..."
                  value={qaInput}
                  onChange={(e) => setQaInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendQaQuestion()
                    }
                  }}
                  rows={2}
                />
                <button
                  className="qa-send"
                  onClick={sendQaQuestion}
                  disabled={!qaInput.trim() || isAsking}
                >
                  {isAsking ? 'Asking...' : 'Ask'}
                </button>
              </div>
            </div>
          )}

          <div className="text-interface">
            {/* Summary */}
            <div className="text-card" style={{ marginBottom: '1.5rem' }}>
              <h2
                style={{
                  fontFamily: 'Syne, sans-serif',
                  fontSize: '1.5rem',
                  fontWeight: '700',
                  marginBottom: '1rem',
                }}
              >
                Summary
              </h2>
              <p style={{ color: 'var(--text-secondary)', lineHeight: '1.7' }}>
                {generatedNotes.summary}
              </p>
            </div>

            {/* Sections */}
            {generatedNotes.sections.map((section, index) => (
              <div key={index} className="text-card" style={{ marginBottom: '1.5rem' }}>
                <h2
                  style={{
                    fontFamily: 'Syne, sans-serif',
                    fontSize: '1.5rem',
                    fontWeight: '700',
                    marginBottom: '1rem',
                  }}
                >
                  {section.title}
                </h2>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {section.content.map((point, pIndex) => (
                    <li
                      key={pIndex}
                      style={{
                        display: 'flex',
                        gap: '0.75rem',
                        marginBottom: '0.75rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <span style={{ color: 'var(--primary-cyan)' }}>•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* Key Takeaways */}
            {generatedNotes.keyTakeaways.length > 0 && (
              <div
                className="text-card"
                style={{
                  marginBottom: '1.5rem',
                  background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.1), rgba(168, 85, 247, 0.1))',
                  borderColor: 'rgba(6, 182, 212, 0.3)',
                }}
              >
                <h2
                  style={{
                    fontFamily: 'Syne, sans-serif',
                    fontSize: '1.5rem',
                    fontWeight: '700',
                    marginBottom: '1rem',
                  }}
                >
                  Key Takeaways
                </h2>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {generatedNotes.keyTakeaways.map((takeaway, index) => (
                    <li
                      key={index}
                      style={{
                        display: 'flex',
                        gap: '0.75rem',
                        marginBottom: '0.75rem',
                      }}
                    >
                      <span style={{ color: 'var(--primary-green)' }}>✓</span>
                      <span>{takeaway}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Definitions */}
            {generatedNotes.definitions.length > 0 && (
              <div className="text-card" style={{ marginBottom: '1.5rem' }}>
                <h2
                  style={{
                    fontFamily: 'Syne, sans-serif',
                    fontSize: '1.5rem',
                    fontWeight: '700',
                    marginBottom: '1rem',
                  }}
                >
                  Key Definitions
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {generatedNotes.definitions.map((def, index) => (
                    <div key={index}>
                      <h3
                        style={{
                          fontWeight: '600',
                          color: 'var(--primary-cyan)',
                          marginBottom: '0.25rem',
                        }}
                      >
                        {def.term}
                      </h3>
                      <p style={{ color: 'var(--text-secondary)' }}>{def.definition}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                className="btn-polish"
                onClick={() => {
                  setMode('choose')
                  setGeneratedNotes(null)
                  setRoughNotes('')
                  setRecordingTime(0)
                  setActiveNoteId(null)
                  setShowQa(false)
                  setQaMessages([])
                }}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  flex: '1',
                }}
              >
                View All Notes
              </button>
              <button
                className="btn-polish"
                onClick={() => router.push('/dashboard')}
                style={{ flex: '1' }}
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  return null
}
