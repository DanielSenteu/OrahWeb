// Lecture Notes Worker Edge Function
// Background worker that processes lecture note jobs asynchronously
// Full deployable code for Supabase Edge Functions

// 🔗 Supabase Dashboard Link (Edge Functions):
// https://supabase.com/dashboard/project/ffudidfxurrjcjredfjg/functions

// 🔗 Direct Worker Function URL:
// https://ffudidfxurrjcjredfjg.supabase.co/functions/v1/lecture_notes_worker

// 📁 Function Name: lecture_notes_worker
// 📍 Location: supabase/functions/lecture_notes_worker/index.ts

// 🚀 How to Deploy:
// 1. Go to: https://supabase.com/dashboard/project/ffudidfxurrjcjredfjg/functions
// 2. Click on "lecture_notes_worker" (or create new function)
// 3. Paste the code below
// 4. Click "Deploy"
// 5. Make sure environment variables are set:
//    - OPENAI_API_KEY
//    - ASSEMBLYAI_API_KEY
//    - SUPABASE_URL
//    - SUPABASE_SERVICE_ROLE_KEY

// ============================================================================
// FULL EDGE FUNCTION CODE (Copy everything below this line)
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || ""
const ASSEMBLYAI_API_KEY = Deno.env.get("ASSEMBLYAI_API_KEY") || ""
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

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
    const dbSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    // Get pending jobs (or specific job ID from request)
    const body = await req.json().catch(() => ({}))
    const jobId = body.jobId

    let jobs: any[] = []

    if (jobId) {
      // Process specific job
      const { data, error } = await dbSupabase
        .from("lecture_processing_jobs")
        .select("*")
        .eq("id", jobId)
        .eq("status", "pending")
        .limit(1)

      if (error) throw error
      if (data && data.length > 0) {
        jobs = data
      }
    } else {
      // Process oldest pending job
      const { data, error } = await dbSupabase
        .from("lecture_processing_jobs")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1)

      if (error) throw error
      if (data && data.length > 0) {
        jobs = data
      }
    }

    if (jobs.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending jobs found" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      )
    }

    const job = jobs[0]
    console.log(`🔄 Processing job: ${job.id} for note: ${job.note_id}`)

    // Update job status to transcribing
    await dbSupabase
      .from("lecture_processing_jobs")
      .update({
        status: "transcribing",
        progress: 10,
        started_at: new Date().toISOString(),
      })
      .eq("id", job.id)

    // Get the note to process
    const { data: note, error: noteError } = await dbSupabase
      .from("lecture_notes")
      .select("*")
      .eq("id", job.note_id)
      .eq("user_id", job.user_id)
      .single()

    if (noteError || !note) {
      throw new Error(`Note not found: ${noteError?.message || "Unknown error"}`)
    }

    let transcript = note.original_content || ""

    // Step 1: Transcribe audio if needed
    if (!transcript && note.audio_url) {
      console.log("🎙️ Starting transcription...")
      
      // Create signed URL for AssemblyAI
      const { data: signedUrlData, error: signedUrlError } = await dbSupabase.storage
        .from("lecture-recordings")
        .createSignedUrl(note.audio_url, 3600)

      if (signedUrlError || !signedUrlData) {
        throw new Error(`Failed to create signed URL: ${signedUrlError?.message || "No data"}`)
      }

      // Submit to AssemblyAI
      const submitResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
        method: "POST",
        headers: {
          authorization: ASSEMBLYAI_API_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          audio_url: signedUrlData.signedUrl,
          language_detection: true,
          speech_models: ["universal-3-pro"],
          punctuate: true,
          format_text: true,
        }),
      })

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text()
        throw new Error(`AssemblyAI submission failed: ${submitResponse.status} ${errorText}`)
      }

      const submitData = await submitResponse.json()
      const transcriptId = submitData.id

      // Poll for completion
      let attempts = 0
      const maxAttempts = 120
      let isComplete = false

      while (!isComplete && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000))

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

        // Update progress
        const progress = 10 + Math.floor((attempts / maxAttempts) * 40) // 10-50%
        await dbSupabase
          .from("lecture_processing_jobs")
          .update({ progress })
          .eq("id", job.id)

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
        throw new Error("Transcription timed out")
      }

      // Save transcript to note
      await dbSupabase
        .from("lecture_notes")
        .update({ original_content: transcript })
        .eq("id", note.id)
    }

    // Step 2: Generate notes (with chunking if needed)
    console.log("📝 Generating notes...")
    
    await dbSupabase
      .from("lecture_processing_jobs")
      .update({
        status: "generating_notes",
        progress: 50,
      })
      .eq("id", job.id)

    const transcriptTokens = Math.ceil(transcript.length / 4)
    const MAX_TOKENS_FOR_NOTES = 80000
    let finalNotes: GeneratedNotes

    if (transcriptTokens > MAX_TOKENS_FOR_NOTES) {
      console.log(`📦 Chunking transcript (${transcriptTokens.toLocaleString()} tokens)...`)
      
      // Chunk transcript
      const chunks = chunkTranscript(transcript)
      console.log(`📦 Split into ${chunks.length} chunks`)
      
      await dbSupabase
        .from("lecture_processing_jobs")
        .update({
          status: "chunking_transcript",
          total_chunks: chunks.length,
          progress: 60,
        })
        .eq("id", job.id)

      // Process chunks in parallel
      const chunkPromises = chunks.map(async (chunk, index) => {
        const progress = 60 + Math.floor((index / chunks.length) * 30) // 60-90%
        await dbSupabase
          .from("lecture_processing_jobs")
          .update({ progress, completed_chunks: index })
          .eq("id", job.id)

        return generateNotesForChunk(chunk.text, index)
      })

      const chunkNotes = await Promise.all(chunkPromises)
      
      // Merge notes
      finalNotes = mergeNotes(chunkNotes.map((n, i) => ({ ...n, chunkIndex: i })))
    } else {
      finalNotes = await generateNotesForChunk(transcript, 0)
    }

    // Step 3: Save final notes
    console.log("💾 Saving notes...")
    
    await dbSupabase
      .from("lecture_notes")
      .update({
        title: finalNotes.title,
        summary: finalNotes.summary,
        sections: finalNotes.sections,
        key_takeaways: finalNotes.keyTakeaways,
        definitions: finalNotes.definitions,
        processing_status: "completed",
      })
      .eq("id", note.id)

    // Mark job as completed
    await dbSupabase
      .from("lecture_processing_jobs")
      .update({
        status: "completed",
        progress: 100,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)

    console.log(`✅ Job completed: ${job.id}`)

    return new Response(
      JSON.stringify({
        success: true,
        jobId: job.id,
        noteId: note.id,
        message: "Processing completed successfully",
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
    console.error("❌ Worker error:", error)

    // Try to update job status to failed
    try {
      const body = await req.json().catch(() => ({}))
      const jobId = body.jobId
      
      if (jobId) {
        const dbSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        await dbSupabase
          .from("lecture_processing_jobs")
          .update({
            status: "failed",
            error_message: error.message || "Unknown error",
          })
          .eq("id", jobId)
      }
    } catch (dbError) {
      console.error("Error updating failed status:", dbError)
    }

    return new Response(
      JSON.stringify({
        error: "Processing failed",
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

// Helper functions
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
    throw new Error(`Notes generation failed: ${notesResponse.status} ${errorText}`)
  }

  const notesData = await notesResponse.json()
  const notesContent = notesData.choices[0]?.message?.content

  if (!notesContent) {
    throw new Error("Failed to generate notes")
  }

  return JSON.parse(notesContent)
}

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

function mergeNotes(chunkNotes: Array<GeneratedNotes & { chunkIndex: number }>): GeneratedNotes {
  if (chunkNotes.length === 1) {
    return chunkNotes[0]
  }

  const title = chunkNotes[0].title.replace(/ \(Part \d+\)$/, '') || 'Lecture Notes'
  
  const summaries = chunkNotes.filter(n => n.summary).map(n => n.summary)
  const summary = summaries.length > 0
    ? summaries.length === 1
      ? summaries[0]
      : `${summaries[0]} ${summaries[summaries.length - 1]}`
    : ''

  const sectionMap = new Map<string, { title: string; content: string[] }>()
  for (const note of chunkNotes) {
    for (const section of note.sections) {
      const normalizedTitle = section.title.toLowerCase().trim()
      const existing = sectionMap.get(normalizedTitle)
      
      if (existing) {
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
