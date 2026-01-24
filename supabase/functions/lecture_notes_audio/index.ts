// Edge Function: lecture_notes_audio
// Processes audio recordings: transcribes with Whisper, saves transcript immediately,
// then generates organized notes. No timeout limits - perfect for long recordings.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

interface RequestBody {
  userId: string
  audio: string // base64 encoded audio
  saveOnlyTranscript?: boolean // If true, only save transcript, don't generate notes
  noteId?: string // If provided, update existing note instead of creating new
}

interface GeneratedNotes {
  title: string
  summary: string
  sections: Array<{ title: string; content: string[] }>
  keyTakeaways: string[]
  definitions: Array<{ term: string; definition: string }>
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
    const { userId, audio, saveOnlyTranscript, noteId } = body

    // Create service role client for database operations
    const dbSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // If noteId is provided, fetch existing transcript for retry
    let transcript = ""
    if (noteId && !audio) {
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
    } else if (!audio) {
      return new Response(
        JSON.stringify({ error: "Missing audio data or noteId for retry" }),
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
    if (!transcript && audio) {
      console.log("🎙️ Starting audio transcription...")

      // Convert base64 to Uint8Array for Deno
      const audioBytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0))
      const fileSizeMB = audioBytes.length / (1024 * 1024)
      console.log(`📊 Audio file size: ${fileSizeMB.toFixed(2)} MB`)

      // Create FormData for OpenAI Whisper API
      const formData = new FormData()
      const audioBlob = new Blob([audioBytes], { type: "audio/webm" })
      formData.append("file", audioBlob, "recording.webm")
      formData.append("model", "whisper-1")
      formData.append("language", "en")

      // Transcribe using Whisper API
      console.log("🔄 Calling Whisper API...")
      const transcriptionResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: formData,
      })

      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text()
        console.error("❌ Whisper API error:", errorText)
        throw new Error(`Whisper API failed: ${transcriptionResponse.status} ${errorText}`)
      }

      const transcriptionData = await transcriptionResponse.json()
      transcript = transcriptionData.text || ""

      if (!transcript) {
        throw new Error("Empty transcript received from Whisper")
      }

      console.log(`✅ Transcription complete: ${transcript.length} characters`)
    }

    // ALWAYS save transcript to database first
    console.log("💾 Saving transcript to database...")

    let savedNoteId = noteId

    if (noteId) {
      // Update existing note
      const { error: updateError } = await dbSupabase
        .from("lecture_notes")
        .update({
          original_content: transcript,
          processing_status: saveOnlyTranscript ? "pending" : "processing",
          error_message: null,
        })
        .eq("id", noteId)
        .eq("user_id", userId)

      if (updateError) {
        console.error("❌ Error updating transcript:", updateError)
        throw new Error("Failed to update transcript")
      }
      console.log("✅ Transcript updated in existing note")
    } else {
      // Create new note with transcript
      const { data: newNote, error: insertError } = await dbSupabase
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
          processing_status: saveOnlyTranscript ? "pending" : "processing",
        })
        .select()
        .single()

      if (insertError || !newNote) {
        console.error("❌ Error saving transcript:", insertError)
        throw new Error("Failed to save transcript")
      }

      savedNoteId = newNote.id
      console.log(`✅ Transcript saved to database with ID: ${savedNoteId}`)
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

    // Generate organized notes from transcript
    console.log("📝 Generating organized notes...")

    const notesPrompt = `You are an ELITE note-taker creating EXAM-READY study notes. Your notes should be so thorough that a student could learn the entire lecture from your notes alone.

CRITICAL DEPTH REQUIREMENTS:
1. **Examples are MANDATORY**: Every concept must include specific examples from the lecture
2. **Explain WHY and HOW**, not just WHAT
3. **Multi-sentence bullets**: Each bullet = 1-3 sentences with complete info
4. **Include ALL details**: Numbers, formulas, step-by-step processes
5. **Study-ready**: Detailed enough to ace the exam using only these notes

Return ONLY valid JSON:
{
  "title": "Lecture title",
  "summary": "Comprehensive 2-3 sentence overview",
  "sections": [
    {
      "title": "Section name",
      "content": [
        "Detailed multi-sentence bullet with examples and explanations",
        "Another comprehensive bullet with WHY and HOW, not just WHAT"
      ]
    }
  ],
  "definitions": [
    {"term": "Term", "definition": "Complete definition with context, examples, and why it matters"}
  ],
  "keyTakeaways": ["Comprehensive takeaway with reasoning and examples"]
}

ADDITIONAL CAPTURE REQUIREMENTS:
6. **Exact examples with real data**: Capture EXACT strings, numbers, arrays used in examples
7. **Homework/assignments**: Note any practice problems or homework mentioned
8. **Administrative info**: Office hours, due dates, next lecture topics
9. **Professor's tips**: Study advice, common mistakes, exam hints
10. **Decision frameworks**: "When to use X" or "How to identify Y problems"

Make these notes so comprehensive that students can ace exams AND complete homework using only these notes.`

    const notesResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-2024-07-18",
        messages: [
          { role: "system", content: notesPrompt },
          {
            role: "user",
            content: `Create organized notes from this lecture transcript:\n\n${transcript}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
    })

    if (!notesResponse.ok) {
      const errorText = await notesResponse.text()
      console.error("❌ Notes generation error:", errorText)
      throw new Error(`Notes generation failed: ${notesResponse.status} ${errorText}`)
    }

    const notesData = await notesResponse.json()
    const notesContent = notesData.choices[0]?.message?.content

    if (!notesContent) {
      throw new Error("Failed to generate notes")
    }

    const notes: GeneratedNotes = JSON.parse(notesContent)
    console.log("✅ Notes generated successfully")

    // Update the saved note with generated notes
    const { error: updateError } = await dbSupabase
      .from("lecture_notes")
      .update({
        title: notes.title,
        summary: notes.summary,
        sections: notes.sections,
        key_takeaways: notes.keyTakeaways,
        definitions: notes.definitions,
        processing_status: "completed",
        error_message: null,
      })
      .eq("id", savedNoteId)
      .eq("user_id", userId)

    if (updateError) {
      console.error("⚠️ Error updating notes:", updateError)
      // Still return notes to user even if DB update fails
    } else {
      console.log("✅ Notes saved to database")
    }

    return new Response(
      JSON.stringify({
        notes,
        transcript,
        noteId: savedNoteId,
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
        await dbSupabase
          .from("lecture_notes")
          .update({
            processing_status: "failed",
            error_message: error.message || "Failed to process audio",
          })
          .eq("id", noteId)
          .eq("user_id", body.userId)
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
