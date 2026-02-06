# Updating Main Edge Function for Async Processing

## Key Changes Needed

Replace the note generation section (after saving transcript) with job creation:

### Current Flow (Synchronous):
```typescript
// Save transcript
// Generate notes (waits 5-11 minutes)
// Save notes
// Return results
```

### New Flow (Async):
```typescript
// Save transcript
// Create job in lecture_processing_jobs table
// Return job ID immediately
// Worker processes in background
```

## Code to Replace

Find this section (around line 406-750):
```typescript
// Generate organized notes from transcript
console.log("📝 Generating organized notes...")
// ... all the note generation code ...
```

Replace with:
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

## What Gets Removed

Remove all the note generation code:
- `generateNotesForChunk` function calls
- `chunkTranscript` function calls  
- `mergeNotes` function calls
- All the GPT API calls for note generation

The worker Edge Function will handle all of this.

## What Stays

Keep:
- Authentication
- Audio transcription (if needed)
- Transcript saving
- Job creation
- Return job ID
