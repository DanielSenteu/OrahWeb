# Main Edge Function - Exact Code Replacement

## 📍 Location
**File:** `supabase/functions/lecture_notes_audio/index.ts`

## 🔍 Find This Section (around line 406-733)

Look for this comment:
```typescript
// Generate organized notes from transcript
console.log("📝 Generating organized notes...")
```

## ❌ DELETE Everything From Here Until The Final Return

Delete from line 406 all the way down to (but NOT including) the `catch (error: any)` block around line 734.

**Specifically DELETE:**
- All note generation code (lines 406-438)
- All helper functions:
  - `generateNotesForChunk` function (lines 441-513)
  - `chunkTranscript` function (lines 516-578)
  - `getOverlapSentences` function (lines 580-592)
  - `mergeNotes` function (lines 595-666)
- The final notes update code (lines 668-718)
- The return statement with notes (lines 720-733)

## ✅ REPLACE With This Code

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

    // Update note status to pending
    try {
      await dbSupabase
        .from("lecture_notes")
        .update({
          processing_status: "pending",
        })
        .eq("id", savedNoteId)
    } catch (e) {
      // Column might not exist yet - that's okay
      console.log("⚠️ Could not update processing_status (column may not exist)")
    }

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

## 📝 Summary

**What you're doing:**
1. Remove all note generation code (400+ lines)
2. Replace with job creation code (~40 lines)
3. Return job ID immediately instead of waiting for notes

**Result:**
- Function returns in <1 second instead of 5-11 minutes
- Worker processes in background
- Frontend polls for status

## ✅ After Replacement

Your function should flow like this:
1. Authenticate user
2. Transcribe audio (if needed)
3. Save transcript
4. **Create job** ← NEW CODE HERE
5. **Return job ID** ← NEW CODE HERE
6. `catch` block for errors

The helper functions (`generateNotesForChunk`, `chunkTranscript`, `mergeNotes`, etc.) are **NOT needed** in the main function anymore - they're in the worker!
