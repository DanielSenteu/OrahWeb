# Async Job Queue - Complete Implementation

## ✅ What's Been Created

1. **Worker Edge Function** - `supabase/functions/lecture_notes_worker/index.ts`
   - Processes jobs in background
   - Updates progress (0-100%)
   - Handles transcription and note generation

2. **Implementation Guides** - Step-by-step instructions

## 📋 Implementation Steps

### Step 1: Run Database Schema (REQUIRED)

Run `LONG_LECTURE_PROCESSING_SCHEMA.sql` in Supabase SQL Editor to create:
- `lecture_processing_jobs` table
- `lecture_audio_chunks` table  
- `lecture_transcript_chunks` table

### Step 2: Update Main Edge Function

**File:** `supabase/functions/lecture_notes_audio/index.ts`

**Find this section (around line 406-733):**
```typescript
// Generate organized notes from transcript
console.log("📝 Generating organized notes...")
// ... all note generation code ...
```

**Replace with:**
```typescript
// Create processing job (async)
console.log("📋 Creating processing job...")

const { data: job, error: jobError } = await dbSupabase
  .from("lecture_processing_jobs")
  .insert({
    note_id: savedNoteId,
    user_id: userId,
    status: "pending",
    progress: 0,
    metadata: {
      audio_url: audioUrl || null,
      has_transcript: !!transcript,
    },
  })
  .select()
  .single()

if (jobError || !job) {
  throw new Error(`Failed to create processing job: ${jobError?.message || "Unknown error"}`)
}

console.log(`✅ Job created: ${job.id}`)

// Return job ID immediately - worker will process in background
return new Response(
  JSON.stringify({
    jobId: job.id,
    noteId: savedNoteId,
    status: "pending",
    message: "Processing started. Your notes will be ready shortly.",
  }),
  {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  }
)
```

**Remove:**
- All `generateNotesForChunk` calls
- All `chunkTranscript` calls
- All `mergeNotes` calls
- All GPT API calls for note generation
- The final `return new Response` with notes

### Step 3: Deploy Worker Edge Function

1. Go to Supabase Dashboard → Edge Functions
2. Create new function: `lecture_notes_worker`
3. Copy code from `supabase/functions/lecture_notes_worker/index.ts`
4. Paste and deploy

### Step 4: Create API Route to Trigger Worker

**File:** `app/api/lecture-notes/process-job/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'

const WORKER_URL = process.env.NEXT_PUBLIC_EDGE_FUNCTION_LECTURE_NOTES_WORKER || 
                   'https://ffudidfxurrjcjredfjg.supabase.co/functions/v1/lecture_notes_worker'

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json()

    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing jobId' },
        { status: 400 }
      )
    }

    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': request.headers.get('authorization') || '',
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({ jobId }),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error || 'Worker error', details: data },
        { status: res.status }
      )
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Process job error:', error)
    return NextResponse.json(
      { error: 'Server error', details: error?.message },
      { status: 500 }
    )
  }
}
```

### Step 5: Update Frontend to Poll for Status

**File:** `app/lecture-notes/page.tsx`

After calling the audio-edge API, instead of waiting for notes:

1. **Get jobId from response**
2. **Start polling:**
```typescript
const pollJobStatus = async (jobId: string) => {
  const interval = setInterval(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    // Get job status
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
    if (job.status === 'pending') {
      await fetch('/api/lecture-notes/process-job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ jobId }),
      })
    }

    // If completed, load notes
    if (job.status === 'completed') {
      clearInterval(interval)
      // Load the note and show it
      const { data: note } = await supabase
        .from('lecture_notes')
        .select('*')
        .eq('id', job.note_id)
        .single()
      
      if (note) {
        setGeneratedNotes({
          title: note.title,
          summary: note.summary,
          sections: note.sections,
          keyTakeaways: note.key_takeaways,
          definitions: note.definitions,
        })
        setMode('result')
      }
    }

    // If failed, show error
    if (job.status === 'failed') {
      clearInterval(interval)
      toast.error(`Processing failed: ${job.error_message || 'Unknown error'}`)
      setMode('choose')
    }
  }, 2000) // Poll every 2 seconds

  // Cleanup after 10 minutes
  setTimeout(() => clearInterval(interval), 10 * 60 * 1000)
}
```

## 🎯 Flow

1. User stops recording
2. Main Edge Function creates job → Returns jobId immediately ✅
3. Frontend starts polling
4. Frontend triggers worker if status = "pending"
5. Worker processes:
   - Transcribes (10-50% progress)
   - Generates notes (50-90% progress)
   - Saves notes (90-100% progress)
6. Frontend sees "completed" → Shows notes

## ✅ Benefits

- ✅ No timeouts (worker runs as long as needed)
- ✅ User can leave and come back
- ✅ Real-time progress updates
- ✅ Better error handling
- ✅ Can retry failed jobs

## 🚀 Next Steps

1. Run `LONG_LECTURE_PROCESSING_SCHEMA.sql`
2. Update main Edge Function (create jobs)
3. Deploy worker Edge Function
4. Create API route
5. Update frontend to poll
6. Test!
