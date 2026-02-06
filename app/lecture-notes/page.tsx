'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Navigation from '@/components/layout/Navigation'
import toast from 'react-hot-toast'
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
  const recordingIdRef = useRef<string | null>(null)
  const lastUploadTimeRef = useRef<number>(0)
  const chunkIndexRef = useRef<number>(0)
  const periodicSaveIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const periodicUploadIntervalRef = useRef<NodeJS.Timeout | null>(null)

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
  const [processingJobId, setProcessingJobId] = useState<string | null>(null)
  const [processingProgress, setProcessingProgress] = useState<number>(0)
  const [processingStatus, setProcessingStatus] = useState<string>('')
  const [lastSaveTime, setLastSaveTime] = useState<number | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // 3-hour recording limit (in seconds)
  const MAX_RECORDING_TIME = 3 * 60 * 60 // 10800 seconds = 3 hours
  
  // Periodic save intervals
  const CHUNK_SAVE_INTERVAL = 30 * 1000 // Save chunks to IndexedDB every 30 seconds
  const STORAGE_UPLOAD_INTERVAL = 5 * 60 * 1000 // Upload partial to Storage every 5 minutes

  // Load saved notes and check for incomplete recordings on mount
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

      // Check for incomplete recordings in IndexedDB
      try {
        const { getIncompleteRecordings } = await import('@/lib/utils/recording-storage')
        const incomplete = await getIncompleteRecordings(user.id)
        
        if (incomplete.length > 0) {
          const latest = incomplete.sort((a, b) => b.startTime - a.startTime)[0]
          const shouldResume = confirm(
            `Found an incomplete recording from ${new Date(latest.startTime).toLocaleString()}.\n\n` +
            `Duration: ${Math.floor(latest.duration / 60)} minutes\n\n` +
            `Would you like to resume and process it?`
          )
          
          if (shouldResume) {
            await resumeRecording(latest.id)
          }
        }
      } catch (error) {
        console.error('Error checking for incomplete recordings:', error)
      }
    }

    loadNotes()

    // Track page view
    const trackPageView = async () => {
      const { trackPageView: track } = await import('@/lib/utils/posthog-events')
      track('lecture_notes', {})
    }
    trackPageView()
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
        
        // Track lecture note creation
        const { trackLectureNoteCreated } = await import('@/lib/utils/posthog-events')
        trackLectureNoteCreated({
          source_type: sourceType,
          has_sections: notes.sections.length > 0,
          key_takeaways_count: notes.keyTakeaways.length,
          definitions_count: notes.definitions.length,
        })
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
        setRecordingTime((prev) => {
          const newTime = prev + 1
          // Auto-stop at 3-hour limit
          if (newTime >= MAX_RECORDING_TIME) {
            // Stop recording automatically when limit is reached
            if (mediaRecorderRef.current) {
              console.log('⏱️ 3-hour recording limit reached. Stopping automatically...')
              mediaRecorderRef.current.stop()
              setIsRecording(false)
            }
            return MAX_RECORDING_TIME
          }
          return newTime
        })
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isRecording])

  const formatRecordingTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const formatTimeRemaining = (seconds: number) => {
    const remaining = MAX_RECORDING_TIME - seconds
    const hours = Math.floor(remaining / 3600)
    const mins = Math.floor((remaining % 3600) / 60)
    const secs = remaining % 60
    
    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`
    }
    if (mins > 0) {
      return `${mins}m ${secs}s`
    }
    return `${secs}s`
  }

  const startRecording = async () => {
    try {
      if (!userId) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }
        setUserId(user.id)
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      
      // Generate unique recording ID
      const recordingId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      recordingIdRef.current = recordingId
      chunkIndexRef.current = 0
      lastUploadTimeRef.current = Date.now()

      // Initialize IndexedDB and save metadata
      const { initRecordingDB, saveMetadata } = await import('@/lib/utils/recording-storage')
      await initRecordingDB()
      await saveMetadata({
        id: recordingId,
        userId: userId!,
        startTime: Date.now(),
        duration: 0,
        chunksCount: 0,
        lastSaved: Date.now(),
      })

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
          
          // Save chunk to IndexedDB immediately
          try {
            const { saveChunk, saveMetadata, getMetadata } = await import('@/lib/utils/recording-storage')
            await saveChunk(recordingId, event.data, chunkIndexRef.current)
            chunkIndexRef.current++
            
            // Update metadata
            const metadata = await getMetadata(recordingId)
            if (metadata) {
              metadata.chunksCount = chunkIndexRef.current
              metadata.duration = recordingTime
              metadata.lastSaved = Date.now()
              await saveMetadata(metadata)
              setLastSaveTime(Date.now())
            }
          } catch (error) {
            console.error('Error saving chunk to IndexedDB:', error)
            // Continue recording even if IndexedDB save fails
          }
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach((track) => track.stop())
        
        // Clean up intervals
        if (periodicSaveIntervalRef.current) {
          clearInterval(periodicSaveIntervalRef.current)
        }
        if (periodicUploadIntervalRef.current) {
          clearInterval(periodicUploadIntervalRef.current)
        }
        
        await processRecording(audioBlob, recordingId)
      }

      // Start recording with timeslice to get chunks every 30 seconds
      mediaRecorder.start(30000) // 30 seconds
      setIsRecording(true)
      setRecordingTime(0)

      // Set up periodic upload to Storage (every 5 minutes)
      periodicUploadIntervalRef.current = setInterval(async () => {
        try {
          await uploadPartialRecording(recordingId)
        } catch (error) {
          console.error('Error uploading partial recording:', error)
        }
      }, STORAGE_UPLOAD_INTERVAL)

    } catch (error) {
      console.error('Error starting recording:', error)
      alert('Failed to access microphone. Please check permissions.')
    }
  }

  // Upload partial recording to Storage as backup
  const uploadPartialRecording = async (recordingId: string) => {
    if (!userId || !recordingIdRef.current) return

    try {
      const { getChunks, getMetadata } = await import('@/lib/utils/recording-storage')
      const chunks = await getChunks(recordingId)
      
      if (chunks.length === 0) return

      // Combine chunks into single blob
      const partialBlob = new Blob(chunks, { type: 'audio/webm' })
      
      // Create or get noteId for this recording
      const metadata = await getMetadata(recordingId)
      let noteId = metadata?.noteId

      if (!noteId) {
        // Create placeholder note if doesn't exist
        const { data: newNote, error: createError } = await supabase
          .from('lecture_notes')
          .insert({
            user_id: userId,
            title: 'Lecture Recording (In Progress...)',
            summary: 'Recording in progress...',
            sections: [],
            key_takeaways: [],
            definitions: [],
            source_type: 'recorded',
            original_content: '',
            processing_status: 'pending',
          })
          .select()
          .single()

        if (newNote && !createError) {
          noteId = newNote.id
          // Update metadata with noteId
          if (metadata) {
            metadata.noteId = noteId
            const { saveMetadata } = await import('@/lib/utils/recording-storage')
            await saveMetadata(metadata)
          }
        }
      }

      if (noteId) {
        const fileName = `${userId}/${noteId}_partial.webm`
        
        // Upload partial recording to Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('lecture-recordings')
          .upload(fileName, partialBlob, {
            contentType: 'audio/webm',
            upsert: true, // Overwrite previous partial
          })

        if (!uploadError) {
          console.log('✅ Partial recording uploaded to Storage:', uploadData.path)
          lastUploadTimeRef.current = Date.now()
          setLastSaveTime(Date.now())
        }
      }
    } catch (error) {
      console.error('Error uploading partial recording:', error)
    }
  }

  // Resume incomplete recording
  const resumeRecording = async (recordingId: string) => {
    try {
      const { getChunks, getMetadata, deleteRecording } = await import('@/lib/utils/recording-storage')
      const chunks = await getChunks(recordingId)
      const metadata = await getMetadata(recordingId)

      if (!chunks || chunks.length === 0 || !metadata) {
        alert('No recording data found to resume.')
        return
      }

      // Combine chunks into single blob
      const audioBlob = new Blob(chunks, { type: 'audio/webm' })
      
      // Process the recording
      await processRecording(audioBlob, recordingId)
      
      // Clean up IndexedDB after successful processing
      await deleteRecording(recordingId)
    } catch (error) {
      console.error('Error resuming recording:', error)
      alert('Failed to resume recording. Please try again.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Clean up intervals
      if (periodicSaveIntervalRef.current) {
        clearInterval(periodicSaveIntervalRef.current)
      }
      if (periodicUploadIntervalRef.current) {
        clearInterval(periodicUploadIntervalRef.current)
      }
      
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const processRecording = async (audioBlob: Blob, recordingId?: string) => {
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

      // Step 1: Create a placeholder note in database first (to get noteId)
      const { data: newNote, error: createError } = await supabase
        .from('lecture_notes')
        .insert({
          user_id: userId,
          title: 'Lecture Recording (Uploading...)',
          summary: 'Uploading audio file...',
          sections: [],
          key_takeaways: [],
          definitions: [],
          source_type: 'recorded',
          original_content: '',
          processing_status: 'pending',
        })
        .select()
        .single()

      if (createError || !newNote) {
        throw new Error(`Failed to create note: ${createError?.message || 'Unknown error'}`)
      }

      const noteId = newNote.id
      const fileName = `${userId}/${noteId}.webm`

      // Step 2: Upload audio file directly to Supabase Storage
      // This happens immediately - no timeout issues, handles large files
      console.log('📤 Uploading audio to Storage...')
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('lecture-recordings')
        .upload(fileName, audioBlob, {
          contentType: 'audio/webm',
          upsert: false, // Don't overwrite if exists
        })

      if (uploadError) {
        // Clean up the note if upload fails
        await supabase.from('lecture_notes').delete().eq('id', noteId)
        throw new Error(`Failed to upload audio: ${uploadError.message}`)
      }

      console.log('✅ Audio uploaded to Storage:', uploadData.path)

      // Step 3: Update note with audio_url
      const { error: updateError } = await supabase
        .from('lecture_notes')
        .update({
          audio_url: uploadData.path,
          processing_status: 'processing',
        })
        .eq('id', noteId)

      if (updateError) {
        console.error('Warning: Failed to update audio_url:', updateError)
        // Continue anyway - we have the path from upload
      }

      // Step 4: Send Storage path to Edge Function for processing
      // Edge function will download from Storage and process
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        throw new Error('Not authenticated')
      }

      console.log('🔄 Starting audio processing...')
      const res = await fetch('/api/lecture-notes/audio-edge', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ 
          audioUrl: uploadData.path, // Pass Storage path instead of base64
          userId: userId,
          noteId: noteId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        // If we have a transcript and can retry, show it
        if (data.transcript && data.canRetry) {
          // Transcript was saved, but note generation failed
          toast.error(`Transcript saved successfully, but note generation failed. You can retry from your saved notes. Error: ${data.details || 'Unknown error'}`)
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

      // NEW: Handle async job processing (jobId response)
      if (data.jobId) {
        console.log(`📋 Job created: ${data.jobId}`)
        setProcessingJobId(data.jobId)
        setProcessingProgress(0)
        setProcessingStatus('pending')
        
        // Clean up recording data
        if (recordingId) {
          try {
            const { deleteRecording } = await import('@/lib/utils/recording-storage')
            await deleteRecording(recordingId)
          } catch (error) {
            console.error('Error cleaning up recording data:', error)
          }
        }
        
        // Start polling for job status
        await pollJobStatus(data.jobId, data.noteId)
        return
      }

      // FALLBACK: Handle immediate notes (if still supported for backwards compatibility)
      if (data.notes) {
        setGeneratedNotes(data.notes)
        if (data.noteId) {
          setActiveNoteId(data.noteId)
          
          // Mark recording as complete in IndexedDB and clean up
          if (recordingId) {
            try {
              const { markRecordingComplete, deleteRecording } = await import('@/lib/utils/recording-storage')
              await markRecordingComplete(recordingId, data.noteId)
              // Clean up IndexedDB after successful processing
              await deleteRecording(recordingId)
            } catch (error) {
              console.error('Error cleaning up recording data:', error)
            }
          }
        }
        setMode('result')
      } else {
        // No jobId and no notes - something went wrong
        toast.error('Processing started but no job ID received. Please check your saved notes.')
        setMode('choose')
      }
    } catch (error: any) {
      console.error('Error processing recording:', error)
      toast.error(`Failed to process recording: ${error.message || 'Unknown error'}. Your audio file may have been saved - check your saved notes.`)
      setMode('choose')
    } finally {
      setIsProcessing(false)
      // Reset recording ID
      recordingIdRef.current = null
    }
  }

  // Poll job status and trigger worker if needed
  const pollJobStatus = async (jobId: string, noteId: string) => {
    const maxAttempts = 300 // 10 minutes max (poll every 2 seconds)
    let attempts = 0
    let workerTriggered = false

    const poll = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
          return
        }

        // Get job status from database
        const { data: job, error } = await supabase
          .from('lecture_processing_jobs')
          .select('*')
          .eq('id', jobId)
          .single()

        if (error || !job) {
          console.error('Error fetching job status:', error)
          // If job not found after a few attempts, stop polling
          if (attempts > 5) {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
            toast.error('Job not found. Please check your saved notes.')
            setMode('choose')
            setProcessingJobId(null)
          }
          attempts++
          return
        }

        // Update UI with progress
        setProcessingProgress(job.progress || 0)
        setProcessingStatus(job.status || '')

        // If pending, trigger worker (only once)
        if (job.status === 'pending' && !workerTriggered) {
          workerTriggered = true
          console.log('🚀 Triggering worker for job:', jobId)
          try {
            const workerRes = await fetch('/api/lecture-notes/process-job', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ jobId }),
            })

            if (!workerRes.ok) {
              const workerData = await workerRes.json()
              console.error('Error triggering worker:', workerData)
              // Don't stop polling - worker might still process
            } else {
              console.log('✅ Worker triggered successfully')
            }
          } catch (err) {
            console.error('Error triggering worker:', err)
            // Don't stop polling - worker might still process
          }
        }

        // If completed, load notes
        if (job.status === 'completed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          
          console.log('✅ Job completed, loading notes...')
          
          // Load the note from database
          const { data: note, error: noteError } = await supabase
            .from('lecture_notes')
            .select('*')
            .eq('id', noteId)
            .single()

          if (noteError || !note) {
            console.error('Error loading note:', noteError)
            toast.error('Notes generated but failed to load. Please refresh the page.')
            setMode('choose')
            setProcessingJobId(null)
            setProcessingProgress(0)
            setProcessingStatus('')
            return
          }

          // Show notes
          setGeneratedNotes({
            title: note.title,
            summary: note.summary,
            sections: note.sections,
            keyTakeaways: note.key_takeaways,
            definitions: note.definitions,
          })
          setActiveNoteId(noteId)
          setMode('result')
          setProcessingJobId(null)
          setProcessingProgress(0)
          setProcessingStatus('')
          toast.success('Notes generated successfully!')
        }

        // If failed, show error
        if (job.status === 'failed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          
          toast.error(`Processing failed: ${job.error_message || 'Unknown error'}. You can retry from saved notes.`)
          setMode('choose')
          setProcessingJobId(null)
          setProcessingProgress(0)
          setProcessingStatus('')
          
          // Refresh notes list
          const { data: updatedNotes } = await supabase
            .from('lecture_notes')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
          if (updatedNotes) {
            setSavedNotes(updatedNotes)
          }
        }

        attempts++
        if (attempts >= maxAttempts) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          toast.error('Processing is taking longer than expected. Please check your saved notes.')
          setMode('choose')
          setProcessingJobId(null)
          setProcessingProgress(0)
          setProcessingStatus('')
        }
      } catch (error) {
        console.error('Error polling job status:', error)
        // Continue polling on error (might be temporary)
      }
    }

    // Poll immediately, then every 2 seconds
    poll()
    pollIntervalRef.current = setInterval(poll, 2000)

    // Cleanup after 10 minutes (safety limit)
    setTimeout(() => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }, 10 * 60 * 1000)
  }

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [])

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
      toast.error('Failed to polish notes. Please try again.')
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

      // Handle async job processing (if retry creates a new job)
      if (data.jobId) {
        console.log(`📋 Retry job created: ${data.jobId}`)
        setProcessingJobId(data.jobId)
        setProcessingProgress(0)
        setProcessingStatus('pending')
        await pollJobStatus(data.jobId, noteId)
        return
      }

      // Load the newly generated note (if notes returned immediately)
      if (data.notes) {
        setGeneratedNotes(data.notes)
        setActiveNoteId(noteId)
        setMode('result')
        toast.success('Notes generated successfully!')
      } else {
        toast.success('Processing started. Your notes will be ready shortly.')
        setMode('choose')
      }
    } catch (error: any) {
      console.error('Error retrying note generation:', error)
      toast.error(`Failed to retry: ${error.message || 'Unknown error'}`)
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
                  <p className="page-subtitle">Click the button below to start recording (up to 3 hours)</p>
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
                {recordingTime >= MAX_RECORDING_TIME - 300 && (
                  <div style={{
                    color: recordingTime >= MAX_RECORDING_TIME - 60 ? 'var(--primary-red)' : 'var(--primary-yellow)',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    marginTop: '0.5rem',
                    textAlign: 'center',
                  }}>
                    {recordingTime >= MAX_RECORDING_TIME - 60 
                      ? `⚠️ Recording will stop automatically in ${formatTimeRemaining(recordingTime)}`
                      : `⏱️ ${formatTimeRemaining(recordingTime)} remaining (3-hour limit)`}
                  </div>
                )}
                {recordingTime < MAX_RECORDING_TIME - 300 && (
                  <div style={{
                    color: 'var(--text-tertiary)',
                    fontSize: '0.875rem',
                    marginTop: '0.5rem',
                    textAlign: 'center',
                  }}>
                    Max recording time: 3 hours
                  </div>
                )}
                {/* Save status indicator */}
                <div style={{
                  color: 'var(--primary-green)',
                  fontSize: '0.75rem',
                  marginTop: '0.5rem',
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.25rem',
                }}>
                  <span>💾</span>
                  <span>
                    Auto-saving every 30s • Last backup: {lastSaveTime 
                      ? `${Math.floor((Date.now() - lastSaveTime) / 1000)}s ago`
                      : 'Just now'}
                  </span>
                </div>
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
                    <p className="option-description">
                      {processingStatus === 'pending' && 'Starting processing...'}
                      {processingStatus === 'transcribing' && `Transcribing audio... ${processingProgress}%`}
                      {processingStatus === 'generating_notes' && `Generating notes... ${processingProgress}%`}
                      {processingStatus === 'chunking_transcript' && `Processing long transcript... ${processingProgress}%`}
                      {processingStatus === 'merging' && `Finalizing notes... ${processingProgress}%`}
                      {!processingStatus && 'Transcribing and generating your notes'}
                    </p>
                    
                    {/* Progress Bar */}
                    {processingJobId && (
                      <div style={{ marginTop: '1.5rem', width: '100%', maxWidth: '400px', margin: '1.5rem auto 0' }}>
                        <div style={{ 
                          width: '100%', 
                          height: '8px', 
                          background: 'var(--border-subtle)', 
                          borderRadius: '4px',
                          overflow: 'hidden',
                          marginBottom: '0.5rem'
                        }}>
                          <div style={{
                            width: `${processingProgress}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, var(--primary-cyan), var(--primary-purple))',
                            transition: 'width 0.3s ease',
                            borderRadius: '4px'
                          }}></div>
                        </div>
                        <p style={{ 
                          color: 'var(--text-secondary)', 
                          fontSize: '0.875rem',
                          textAlign: 'center',
                          marginTop: '0.5rem'
                        }}>
                          {processingProgress}% complete
                        </p>
                      </div>
                    )}
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
