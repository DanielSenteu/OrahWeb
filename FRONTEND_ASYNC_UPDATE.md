# Frontend Update for Async Processing

## 📍 File to Update
`app/lecture-notes/page.tsx`

## 🔧 Changes Needed

### 1. Add State Variables (around line 50)

Add these new state variables:
```typescript
const [processingJobId, setProcessingJobId] = useState<string | null>(null)
const [processingProgress, setProcessingProgress] = useState<number>(0)
const [processingStatus, setProcessingStatus] = useState<string>('')
```

### 2. Add Polling Function (after `processRecording` function)

Add this new function:
```typescript
const pollJobStatus = async (jobId: string, noteId: string) => {
  const maxAttempts = 300 // 10 minutes max (poll every 2 seconds)
  let attempts = 0
  let pollInterval: NodeJS.Timeout | null = null

  const poll = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Get job status from database
      const { data: job, error } = await supabase
        .from('lecture_processing_jobs')
        .select('*')
        .eq('id', jobId)
        .single()

      if (error || !job) {
        console.error('Error fetching job status:', error)
        return
      }

      // Update UI with progress
      setProcessingProgress(job.progress || 0)
      setProcessingStatus(job.status)

      // If pending, trigger worker
      if (job.status === 'pending' && attempts === 0) {
        // Trigger worker on first poll
        try {
          await fetch('/api/lecture-notes/process-job', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ jobId }),
          })
        } catch (err) {
          console.error('Error triggering worker:', err)
        }
      }

      // If completed, load notes
      if (job.status === 'completed') {
        if (pollInterval) clearInterval(pollInterval)
        
        // Load the note from database
        const { data: note, error: noteError } = await supabase
          .from('lecture_notes')
          .select('*')
          .eq('id', noteId)
          .single()

        if (noteError || !note) {
          console.error('Error loading note:', noteError)
          toast.error('Notes generated but failed to load. Please refresh.')
          setMode('choose')
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
      }

      // If failed, show error
      if (job.status === 'failed') {
        if (pollInterval) clearInterval(pollInterval)
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
        if (pollInterval) clearInterval(pollInterval)
        toast.error('Processing timed out. Please check your saved notes.')
        setMode('choose')
        setProcessingJobId(null)
      }
    } catch (error) {
      console.error('Error polling job status:', error)
    }
  }

  // Poll immediately, then every 2 seconds
  poll()
  pollInterval = setInterval(poll, 2000)

  // Cleanup after 10 minutes
  setTimeout(() => {
    if (pollInterval) clearInterval(pollInterval)
  }, 10 * 60 * 1000)
}
```

### 3. Update `processRecording` Function (around line 527)

**Find this:**
```typescript
const data = await res.json()

if (!res.ok) {
  // error handling...
}

// Success - notes generated
if (data.notes) {
  setGeneratedNotes(data.notes)
  // ...
}
```

**Replace with:**
```typescript
const data = await res.json()

if (!res.ok) {
  // error handling...
}

// NEW: Handle async job processing
if (data.jobId) {
  console.log(`📋 Job created: ${data.jobId}`)
  setProcessingJobId(data.jobId)
  setProcessingProgress(0)
  setProcessingStatus('pending')
  
  // Start polling for job status
  await pollJobStatus(data.jobId, data.noteId)
  return
}

// FALLBACK: Handle immediate notes (if still supported)
if (data.notes) {
  setGeneratedNotes(data.notes)
  if (data.noteId) {
    setActiveNoteId(data.noteId)
  }
  setMode('result')
}
```

### 4. Update Processing UI (in recording mode section)

Add progress display when processing:
```typescript
{isProcessing && processingJobId && (
  <div style={{ marginTop: '1rem', textAlign: 'center' }}>
    <div style={{ marginBottom: '0.5rem' }}>
      <div style={{ 
        width: '100%', 
        height: '8px', 
        background: 'var(--border-subtle)', 
        borderRadius: '4px',
        overflow: 'hidden'
      }}>
        <div style={{
          width: `${processingProgress}%`,
          height: '100%',
          background: 'var(--primary-cyan)',
          transition: 'width 0.3s ease'
        }}></div>
      </div>
    </div>
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
      {processingStatus === 'pending' && 'Starting processing...'}
      {processingStatus === 'transcribing' && `Transcribing audio... ${processingProgress}%`}
      {processingStatus === 'generating_notes' && `Generating notes... ${processingProgress}%`}
      {processingStatus === 'chunking_transcript' && `Processing long transcript... ${processingProgress}%`}
      {processingStatus === 'merging' && `Finalizing notes... ${processingProgress}%`}
      {!processingStatus && `Processing... ${processingProgress}%`}
    </p>
  </div>
)}
```

## ✅ After These Changes

The flow will work correctly:
1. Job created → Returns immediately
2. Frontend polls → Shows progress
3. Worker processes → Updates database
4. Frontend sees completion → Shows notes
