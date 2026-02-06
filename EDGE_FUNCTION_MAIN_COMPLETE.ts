// Edge Function: lecture_notes_audio
// Creates processing jobs for async background processing
// Returns immediately with job ID - worker processes in background

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || ""
const ASSEMBLYAI_API_KEY = Deno.env.get("ASSEMBLYAI_API_KEY") || ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

interface RequestBody {
  userId: string
  audioUrl?: string // Supabase Storage path (preferred)
  audio?: string // base64 encoded audio (fallback for backwards compatibility)
  saveOnlyTranscript?: boolean // If true, only save transcript, don't generate notes
  noteId?: string // If provided, update existing note instead of creating new
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    })
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    // Verify user with user's token
    const userSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: authError,
    } = await userSupabase.auth.getUser(authHeader.replace("Bearer ", ""))

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const body: RequestBody = await req.json()
    const { userId, audioUrl, audio, saveOnlyTranscript, noteId } = body

    // Create service role client for database operations
    const dbSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // If noteId is provided, fetch existing transcript for retry
    let transcript = ""
    if (noteId && !audioUrl && !audio) {
      // Retry case: fetch existing transcript
      const { data: existingNote, error: fetchError } = await dbSupabase
        .from("lecture_notes")
        .select("original_content")
        .eq("id", noteId)
        .eq("user_id", userId)
        .single()

      if (fetchError || !existingNote || !existingNote.original_content) {
        return new Response(
          JSON.stringify({ error: "Note not found or no transcript available" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      }

      transcript = existingNote.original_content
      console.log(`🔄 Retry: Using existing transcript (${transcript.length} characters)`)
    } else if (!audioUrl && !audio) {
      return new Response(
        JSON.stringify({ error: "Missing audioUrl, audio data, or noteId for retry" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!userId || userId !== user.id) {
      return new Response(
        JSON.stringify({ error: "Invalid userId" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    // Only transcribe if we don't have a transcript (not a retry)
    if (!transcript && (audioUrl || audio)) {
      console.log("🎙️ Starting audio transcription...")

      let fileSizeMB: number = 0
      let publicAudioUrl: string = ""

      if (audioUrl) {
        // Get file info to check size
        try {
          const { data: fileData } = await dbSupabase.storage
            .from("lecture-recordings")
            .download(audioUrl)
          
          if (fileData) {
            fileSizeMB = fileData.size / (1024 * 1024)
          }
        } catch (e) {
          console.log("⚠️ Could not determine file size, proceeding anyway")
          fileSizeMB = 0
        }

        // Create signed URL for AssemblyAI to access (valid for 1 hour)
        // AssemblyAI needs a publicly accessible URL to fetch the audio
        const { data: signedUrlData, error: signedUrlError } = await dbSupabase.storage
          .from("lecture-recordings")
          .createSignedUrl(audioUrl, 3600) // 1 hour expiry

        if (signedUrlError || !signedUrlData) {
          throw new Error(`Failed to create signed URL: ${signedUrlError?.message || "No data"}`)
        }

        publicAudioUrl = signedUrlData.signedUrl
        console.log(`📊 Audio file size: ${fileSizeMB.toFixed(2)} MB`)
        console.log(`🔗 Created signed URL for AssemblyAI (valid for 1 hour)`)
      } else if (audio) {
        // Fallback: For base64, we'll use Whisper (smaller files only)
        console.log("📥 Using base64 audio (fallback mode - using Whisper)")
        const audioBytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0))
        fileSizeMB = audioBytes.length / (1024 * 1024)
        console.log(`📊 Audio file size: ${fileSizeMB.toFixed(2)} MB`)

        // Use Whisper for base64 (smaller files)
        if (fileSizeMB > 25) {
          throw new Error(
            `Audio file is too large (${fileSizeMB.toFixed(2)}MB). ` +
            `Please use Storage upload for large files (AssemblyAI handles any size).`
          )
        }

        const audioBlob = new Blob([audioBytes], { type: "audio/webm" })
        const formData = new FormData()
        formData.append("file", audioBlob, "recording.webm")
        formData.append("model", "whisper-1")
        formData.append("language", "en")

        const transcriptionResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: formData,
        })

        if (!transcriptionResponse.ok) {
          const errorText = await transcriptionResponse.text()
          throw new Error(`Whisper API failed: ${transcriptionResponse.status} ${errorText}`)
        }

        const transcriptionData = await transcriptionResponse.json()
        transcript = transcriptionData.text || ""

        if (!transcript) {
          throw new Error("Empty transcript received from Whisper")
        }

        console.log(`✅ Transcription complete: ${transcript.length} characters`)
      } else {
        throw new Error("No audio source provided")
      }

      // Use AssemblyAI for Storage URLs (handles large files automatically)
      if (publicAudioUrl) {
        console.log("🔄 Using AssemblyAI for transcription (handles large files automatically)...")
        
        if (!ASSEMBLYAI_API_KEY) {
          throw new Error("ASSEMBLYAI_API_KEY not configured. Please add it to your environment variables.")
        }

        // Submit transcription job to AssemblyAI
        const submitResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
          method: "POST",
          headers: {
            authorization: ASSEMBLYAI_API_KEY,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            audio_url: publicAudioUrl,
            language_detection: true,
            speech_model: "universal-3-pro",
            punctuate: true,
            format_text: true,
          }),
        })

        if (!submitResponse.ok) {
          const errorText = await submitResponse.text()
          console.error("❌ AssemblyAI submission error:", errorText)
          throw new Error(`AssemblyAI submission failed: ${submitResponse.status} ${errorText}`)
        }

        const submitData = await submitResponse.json()
        const transcriptId = submitData.id

        if (!transcriptId) {
          throw new Error("Failed to get transcript ID from AssemblyAI")
        }

        console.log(`📋 Transcription job submitted: ${transcriptId}`)

        // Poll for completion (AssemblyAI processes quickly - usually 2-5 minutes)
        let attempts = 0
        const maxAttempts = 120 // 10 minutes max (poll every 5 seconds)
        let isComplete = false

        while (!isComplete && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds

          const statusResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
            headers: {
              authorization: ASSEMBLYAI_API_KEY,
            },
          })

          if (!statusResponse.ok) {
            throw new Error(`Failed to check transcription status: ${statusResponse.status}`)
          }

          const statusData = await statusResponse.json()
          const status = statusData.status

          console.log(`📊 Transcription status: ${status} (attempt ${attempts + 1}/${maxAttempts})`)

          if (status === "completed") {
            transcript = statusData.text || ""
            if (!transcript) {
              throw new Error("Empty transcript received from AssemblyAI")
            }
            isComplete = true
            console.log(`✅ Transcription complete: ${transcript.length} characters`)
          } else if (status === "error") {
            throw new Error(`AssemblyAI transcription failed: ${statusData.error || "Unknown error"}`)
          }

          attempts++
        }

        if (!isComplete) {
          throw new Error("Transcription timed out. Please try again or check AssemblyAI dashboard.")
        }
      }
    }

    // ALWAYS save transcript to database first
    console.log("💾 Saving transcript to database...")

    let savedNoteId = noteId

    if (noteId) {
      // Update existing note
      const updateData: Record<string, unknown> = {
        original_content: transcript,
      }

      // Only add processing_status if column exists
      try {
        updateData.processing_status = saveOnlyTranscript ? "pending" : "pending"
        updateData.error_message = null
      } catch {
        // Column doesn't exist yet
      }

      const { error: updateError } = await dbSupabase
        .from("lecture_notes")
        .update(updateData)
        .eq("id", noteId)
        .eq("user_id", userId)

      if (updateError) {
        // If error is about missing column, try without processing_status
        if (updateError.code === "PGRST204" && updateError.message?.includes("processing_status")) {
          console.log("⚠️ processing_status column not found, updating without it (run migration)")
          const { error: fallbackError } = await dbSupabase
            .from("lecture_notes")
            .update({
              original_content: transcript,
            })
            .eq("id", noteId)
            .eq("user_id", userId)

          if (fallbackError) {
            console.error("❌ Error updating transcript:", fallbackError)
            throw new Error("Failed to update transcript. Please run the database migration: LECTURE_NOTES_SCHEMA_UPDATE.sql")
          }
          console.log("✅ Transcript updated in existing note (without processing_status - migration needed)")
        } else {
          console.error("❌ Error updating transcript:", updateError)
          throw new Error(`Failed to update transcript: ${updateError.message}`)
        }
      } else {
        console.log("✅ Transcript updated in existing note")
      }
    } else {
      // Create new note with transcript
      const insertData: Record<string, unknown> = {
        user_id: userId,
        title: "Lecture Recording (Processing...)",
        summary: "Transcript saved. Generating notes...",
        sections: [],
        key_takeaways: [],
        definitions: [],
        source_type: "recorded",
        original_content: transcript,
      }

      // Only add processing_status if column exists
      try {
        insertData.processing_status = saveOnlyTranscript ? "pending" : "pending"
      } catch {
        // Column doesn't exist yet - will be added by migration
      }

      const { data: newNote, error: insertError } = await dbSupabase
        .from("lecture_notes")
        .insert(insertData)
        .select()
        .single()

      if (insertError) {
        // If error is about missing column, try without processing_status
        if (insertError.code === "PGRST204" && insertError.message?.includes("processing_status")) {
          console.log("⚠️ processing_status column not found, inserting without it (run migration)")
          const { data: fallbackNote, error: fallbackError } = await dbSupabase
            .from("lecture_notes")
            .insert({
              user_id: userId,
              title: "Lecture Recording (Processing...)",
              summary: "Transcript saved. Generating notes...",
              sections: [],
              key_takeaways: [],
              definitions: [],
              source_type: "recorded",
              original_content: transcript,
            })
            .select()
            .single()

          if (fallbackError || !fallbackNote) {
            console.error("❌ Error saving transcript:", fallbackError)
            throw new Error("Failed to save transcript. Please run the database migration: LECTURE_NOTES_SCHEMA_UPDATE.sql")
          }

          savedNoteId = fallbackNote.id
          console.log(`✅ Transcript saved to database with ID: ${savedNoteId} (without processing_status - migration needed)`)
        } else {
          console.error("❌ Error saving transcript:", insertError)
          throw new Error(`Failed to save transcript: ${insertError.message}`)
        }
      } else if (!newNote) {
        throw new Error("Failed to save transcript: No note returned")
      } else {
        savedNoteId = newNote.id
        console.log(`✅ Transcript saved to database with ID: ${savedNoteId}`)
      }
    }

    // If only saving transcript, return early
    if (saveOnlyTranscript) {
      return new Response(
        JSON.stringify({
          transcript,
          noteId: savedNoteId,
          message: "Transcript saved. You can retry note generation later.",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      )
    }

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
    } catch {
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
  } catch (error: any) {
    console.error("❌ Audio processing error:", error)

    // Try to update database with error status if we have noteId
    try {
      const body: RequestBody = await req.json().catch(() => ({}))
      const noteId = body.noteId
      if (noteId && body.userId) {
        const dbSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        const updateData: Record<string, unknown> = {
          processing_status: "failed",
          error_message: error.message || "Failed to process audio",
        }

        const { error: updateError } = await dbSupabase
          .from("lecture_notes")
          .update(updateData)
          .eq("id", noteId)
          .eq("user_id", body.userId)

        // If column doesn't exist, skip the update (not critical)
        if (updateError && updateError.code === "PGRST204") {
          console.log("⚠️ processing_status column not found, skipping status update (run migration)")
        } else if (updateError) {
          console.error("Error updating failed status:", updateError)
        }
      }
    } catch (dbError) {
      console.error("Error updating failed status:", dbError)
    }

    return new Response(
      JSON.stringify({
        error: "Failed to process audio",
        details: error.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    )
  }
})
