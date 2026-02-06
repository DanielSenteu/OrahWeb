// Edge Function: lecture_notes_audio
// Processes audio recordings: transcribes with Whisper, saves transcript immediately,
// then generates organized notes. No timeout limits - perfect for long recordings.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || ""
const ASSEMBLYAI_API_KEY = Deno.env.get("ASSEMBLYAI_API_KEY") || ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
// SUPABASE_ANON_KEY not needed for this function

interface RequestBody {
  userId: string
  audioUrl?: string // Supabase Storage path (preferred)
  audio?: string // base64 encoded audio (fallback for backwards compatibility)
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
      let estimatedDurationMinutes: number = 0
      const DURATION_THRESHOLD_MINUTES = 5 // Use AssemblyAI for recordings ≥ 5 minutes

      if (audioUrl) {
        // Get file info to check size
        try {
          const { data: fileData } = await dbSupabase.storage
            .from("lecture-recordings")
            .download(audioUrl)
          
          if (fileData) {
            fileSizeMB = fileData.size / (1024 * 1024)
            // Estimate duration: ~1MB per minute for typical webm audio
            estimatedDurationMinutes = fileSizeMB
          }
        } catch {
          console.log("⚠️ Could not determine file size, proceeding anyway")
          fileSizeMB = 0
          estimatedDurationMinutes = 0
        }

        // Route based on estimated duration
        if (estimatedDurationMinutes >= DURATION_THRESHOLD_MINUTES) {
          // Use AssemblyAI for longer recordings (≥ 5 minutes)
          console.log(`📊 Audio file size: ${fileSizeMB.toFixed(2)} MB (estimated ~${estimatedDurationMinutes.toFixed(1)} minutes)`)
          console.log(`🔄 Using AssemblyAI for transcription (≥ ${DURATION_THRESHOLD_MINUTES} minutes)...`)

          if (!ASSEMBLYAI_API_KEY) {
            throw new Error("ASSEMBLYAI_API_KEY not configured. Please add it to your environment variables.")
          }

          // Create signed URL for AssemblyAI to access (valid for 1 hour)
          const { data: signedUrlData, error: signedUrlError } = await dbSupabase.storage
            .from("lecture-recordings")
            .createSignedUrl(audioUrl, 3600) // 1 hour expiry

          if (signedUrlError || !signedUrlData) {
            throw new Error(`Failed to create signed URL: ${signedUrlError?.message || "No data"}`)
          }

          publicAudioUrl = signedUrlData.signedUrl
          console.log(`🔗 Created signed URL for AssemblyAI (valid for 1 hour)`)
        } else {
          // Use Whisper for shorter recordings (< 5 minutes)
          console.log(`📊 Audio file size: ${fileSizeMB.toFixed(2)} MB (estimated ~${estimatedDurationMinutes.toFixed(1)} minutes)`)
          console.log(`🎤 Using Whisper for transcription (< ${DURATION_THRESHOLD_MINUTES} minutes - faster for short clips)...`)

          // Download file for Whisper
          const { data: fileData, error: downloadError } = await dbSupabase.storage
            .from("lecture-recordings")
            .download(audioUrl)

          if (downloadError || !fileData) {
            throw new Error(`Failed to download audio: ${downloadError?.message || "No data"}`)
          }

          // Check Whisper's 25MB limit
          if (fileSizeMB > 25) {
            throw new Error(
              `Audio file is too large for Whisper (${fileSizeMB.toFixed(2)}MB). ` +
              `Please use a shorter recording or the system will automatically use AssemblyAI for longer files.`
            )
          }

          const audioBlob = await fileData.blob()
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
        }
      } else if (audio) {
        // Fallback: For base64, estimate and route accordingly
        console.log("📥 Using base64 audio")
        const audioBytes = Uint8Array.from(atob(audio), (c) => c.charCodeAt(0))
        fileSizeMB = audioBytes.length / (1024 * 1024)
        estimatedDurationMinutes = fileSizeMB // ~1MB per minute estimate
        console.log(`📊 Audio file size: ${fileSizeMB.toFixed(2)} MB (estimated ~${estimatedDurationMinutes.toFixed(1)} minutes)`)

        // Route based on estimated duration
        if (estimatedDurationMinutes >= DURATION_THRESHOLD_MINUTES) {
          // For base64, if it's long, we need to upload to Storage first for AssemblyAI
          // Or fall back to Whisper if under 25MB
          if (fileSizeMB > 25) {
            throw new Error(
              `Audio file is too large (${fileSizeMB.toFixed(2)}MB). ` +
              `Please use Storage upload for large files.`
            )
          }
          // Use Whisper even if long (since base64, we can't easily use AssemblyAI)
          console.log(`⚠️ Base64 audio is long but using Whisper (base64 mode)`)
        }

        // Use Whisper for base64 (smaller files or fallback)
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

      // Use AssemblyAI for longer recordings (if we have a signed URL)
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
            speech_models: ["universal-3-pro"], // Best quality for English
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
        updateData.processing_status = saveOnlyTranscript ? "pending" : "processing"
        updateData.error_message = null
      } catch (e) {
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
      // Try with processing_status first, fallback to without if column doesn't exist
      const insertData: any = {
        user_id: userId,
        title: "Lecture Recording (Processing...)",
        summary: "Transcript saved. Generating notes...",
        sections: [],
        key_takeaways: [],
        definitions: [],
        source_type: "recorded",
        original_content: transcript,
      }

      // Only add processing_status if column exists (will be added via migration)
      // If migration hasn't been run, this will fail and we'll retry without it
      try {
        insertData.processing_status = saveOnlyTranscript ? "pending" : "processing"
      } catch (e) {
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

    // Generate organized notes from transcript
    console.log("📝 Generating organized notes...")
    
    // Check transcript length - if too long, chunk it for parallel processing
    const transcriptTokens = Math.ceil(transcript.length / 4) // Rough estimate: 1 token ≈ 4 characters
    const MAX_TOKENS_FOR_NOTES = 80000 // Leave room for prompt and response (GPT-4o-mini has 128k context)
    
    let finalNotes: GeneratedNotes
    
    if (transcriptTokens > MAX_TOKENS_FOR_NOTES) {
      console.log(`📦 Transcript is very long (${transcriptTokens.toLocaleString()} tokens). Chunking for parallel processing...`)
      
      // Chunk transcript intelligently
      const chunks = chunkTranscript(transcript)
      console.log(`📦 Split into ${chunks.length} chunks for parallel processing`)
      
      // Process chunks in parallel for speed
      const chunkPromises = chunks.map(async (chunk, index) => {
        console.log(`🔄 Processing chunk ${index + 1}/${chunks.length}...`)
        return generateNotesForChunk(chunk.text, index)
      })
      
      const chunkNotes = await Promise.all(chunkPromises)
      console.log(`✅ All ${chunks.length} chunks processed`)
      
      // Merge notes from all chunks
      console.log("🔀 Merging notes from all chunks...")
      finalNotes = mergeNotes(chunkNotes.map((n, i) => ({ ...n, chunkIndex: i })))
      console.log("✅ Notes merged successfully")
    } else {
      // Single chunk - process normally
      finalNotes = await generateNotesForChunk(transcript, 0)
    }
    
    // Helper function to generate notes for a single chunk
    async function generateNotesForChunk(chunkText: string, chunkIndex: number): Promise<GeneratedNotes> {
      const notesPrompt = `You are an ELITE note-taker creating EXAM-READY study notes. Your notes should be so thorough that a student could learn the entire lecture from your notes alone.

CRITICAL DEPTH REQUIREMENTS:
1. **Examples are MANDATORY**: Every concept must include specific examples from the lecture
2. **Explain WHY and HOW**, not just WHAT
3. **Multi-sentence bullets**: Each bullet = 1-3 sentences with complete info
4. **Include ALL details**: Numbers, formulas, step-by-step processes
5. **Study-ready**: Detailed enough to ace the exam using only these notes

Return ONLY valid JSON:
{
  "title": "Lecture title${chunkIndex > 0 ? ` (Part ${chunkIndex + 1})` : ""}",
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
              content: `Create organized notes from this lecture transcript${chunkIndex > 0 ? ` (chunk ${chunkIndex + 1})` : ""}:\n\n${chunkText}`,
            },
          ],
          temperature: 0.7,
          max_tokens: 16000,
          response_format: { type: "json_object" },
        }),
      })

      if (!notesResponse.ok) {
        const errorText = await notesResponse.text()
        throw new Error(`Notes generation failed for chunk ${chunkIndex + 1}: ${notesResponse.status} ${errorText}`)
      }

      const notesData = await notesResponse.json()
      const notesContent = notesData.choices[0]?.message?.content

      if (!notesContent) {
        throw new Error(`Failed to generate notes for chunk ${chunkIndex + 1}`)
      }

      return JSON.parse(notesContent)
    }
    
    // Helper function to chunk transcript intelligently
    function chunkTranscript(text: string): Array<{ text: string; index: number }> {
      const OVERLAP_WORDS = 200
      const MAX_CHUNK_TOKENS = 80000
      const TOKENS_PER_CHAR = 0.25
      
      const estimatedTokens = Math.ceil(text.length * TOKENS_PER_CHAR)
      
      if (estimatedTokens <= MAX_CHUNK_TOKENS) {
        return [{ text, index: 0 }]
      }
      
      // Split into sentences
      const sentenceEndings = /[.!?]\s+/g
      const sentences: string[] = []
      let lastIndex = 0
      let match

      while ((match = sentenceEndings.exec(text)) !== null) {
        const sentence = text.substring(lastIndex, match.index + match[0].length)
        if (sentence.trim().length > 0) {
          sentences.push(sentence.trim())
        }
        lastIndex = match.index + match[0].length
      }

      if (lastIndex < text.length) {
        const remaining = text.substring(lastIndex).trim()
        if (remaining.length > 0) {
          sentences.push(remaining)
        }
      }
      
      // Group sentences into chunks
      const chunks: Array<{ text: string; index: number }> = []
      let currentChunk: string[] = []
      let currentTokens = 0
      let chunkIndex = 0

      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i]
        const sentenceTokens = Math.ceil(sentence.length * TOKENS_PER_CHAR)

        if (currentTokens + sentenceTokens > MAX_CHUNK_TOKENS && currentChunk.length > 0) {
          const chunkText = currentChunk.join(' ')
          chunks.push({ text: chunkText, index: chunkIndex++ })

          // Start new chunk with overlap
          const overlapSentences = getOverlapSentences(currentChunk, OVERLAP_WORDS)
          currentChunk = [...overlapSentences, sentence]
          currentTokens = overlapSentences.reduce((sum, s) => sum + Math.ceil(s.length * TOKENS_PER_CHAR), 0) + sentenceTokens
        } else {
          currentChunk.push(sentence)
          currentTokens += sentenceTokens
        }
      }

      if (currentChunk.length > 0) {
        const chunkText = currentChunk.join(' ')
        chunks.push({ text: chunkText, index: chunkIndex })
      }

      return chunks
    }
    
    function getOverlapSentences(sentences: string[], targetWords: number): string[] {
      const overlap: string[] = []
      let wordCount = 0

      for (let i = sentences.length - 1; i >= 0 && wordCount < targetWords; i--) {
        const sentence = sentences[i]
        const words = sentence.split(/\s+/).length
        overlap.unshift(sentence)
        wordCount += words
      }

      return overlap
    }
    
    // Helper function to merge notes from multiple chunks
    function mergeNotes(chunkNotes: Array<GeneratedNotes & { chunkIndex: number }>): GeneratedNotes {
      if (chunkNotes.length === 1) {
        return chunkNotes[0]
      }
      
      // Use title from first chunk
      const title = chunkNotes[0].title.replace(/ \(Part \d+\)$/, '') || 'Lecture Notes'
      
      // Merge summaries
      const summaries = chunkNotes.filter(n => n.summary).map(n => n.summary)
      const summary = summaries.length > 0
        ? summaries.length === 1
          ? summaries[0]
          : `${summaries[0]} ${summaries[summaries.length - 1]}`
        : ''
      
      // Merge sections (deduplicate similar titles)
      const sectionMap = new Map<string, { title: string; content: string[] }>()
      for (const note of chunkNotes) {
        for (const section of note.sections) {
          const normalizedTitle = section.title.toLowerCase().trim()
          const existing = sectionMap.get(normalizedTitle)
          
          if (existing) {
            // Merge content, deduplicate
            const existingContent = new Set(existing.content.map(c => c.toLowerCase().trim()))
            for (const item of section.content) {
              if (!existingContent.has(item.toLowerCase().trim())) {
                existing.content.push(item)
              }
            }
          } else {
            sectionMap.set(normalizedTitle, { title: section.title, content: [...section.content] })
          }
        }
      }
      
      // Merge definitions (keep longest)
      const defMap = new Map<string, { term: string; definition: string }>()
      for (const note of chunkNotes) {
        for (const def of note.definitions) {
          const normalizedTerm = def.term.toLowerCase().trim()
          const existing = defMap.get(normalizedTerm)
          
          if (!existing || def.definition.length > existing.definition.length) {
            defMap.set(normalizedTerm, { term: def.term, definition: def.definition })
          }
        }
      }
      
      // Merge takeaways (deduplicate similar)
      const takeawaySet = new Set<string>()
      const takeaways: string[] = []
      
      for (const note of chunkNotes) {
        for (const takeaway of note.keyTakeaways) {
          const normalized = takeaway.toLowerCase().trim()
          if (!takeawaySet.has(normalized)) {
            takeawaySet.add(normalized)
            takeaways.push(takeaway)
          }
        }
      }
      
      return {
        title,
        summary,
        sections: Array.from(sectionMap.values()),
        definitions: Array.from(defMap.values()),
        keyTakeaways: takeaways,
      }
    }

    // Update the saved note with generated notes
    const updateData: Record<string, unknown> = {
      title: finalNotes.title,
      summary: finalNotes.summary,
      sections: finalNotes.sections,
      key_takeaways: finalNotes.keyTakeaways,
      definitions: finalNotes.definitions,
    }

    // Only add processing_status if column exists
    try {
      updateData.processing_status = "completed"
      updateData.error_message = null
    } catch (e) {
      // Column doesn't exist yet
    }

    const { error: updateError } = await dbSupabase
      .from("lecture_notes")
      .update(updateData)
      .eq("id", savedNoteId)
      .eq("user_id", userId)

    if (updateError) {
      // If error is about missing column, try without processing_status
      if (updateError.code === "PGRST204" && updateError.message?.includes("processing_status")) {
        console.log("⚠️ processing_status column not found, updating without it (run migration)")
                const { error: fallbackError } = await dbSupabase
                  .from("lecture_notes")
                  .update({
                    title: finalNotes.title,
                    summary: finalNotes.summary,
                    sections: finalNotes.sections,
                    key_takeaways: finalNotes.keyTakeaways,
                    definitions: finalNotes.definitions,
                  })
          .eq("id", savedNoteId)
          .eq("user_id", userId)

        if (fallbackError) {
          console.error("⚠️ Error updating notes:", fallbackError)
        } else {
          console.log("✅ Notes saved to database (without processing_status - migration needed)")
        }
      } else {
        console.error("⚠️ Error updating notes:", updateError)
      }
      // Still return notes to user even if DB update fails
    } else {
      console.log("✅ Notes saved to database")
    }

          return new Response(
            JSON.stringify({
              notes: finalNotes,
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
