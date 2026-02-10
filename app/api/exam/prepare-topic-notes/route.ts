import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

/**
 * Prepares topic notes by chunking and summarizing large documents
 * This reduces token usage while preserving key information
 */
export async function POST(req: Request) {
  try {
    const { documents, topic } = await req.json()
    
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return NextResponse.json({ 
        error: 'documents array is required' 
      }, { status: 400 })
    }

    if (!topic) {
      return NextResponse.json({ 
        error: 'topic is required' 
      }, { status: 400 })
    }

    // Estimate total tokens
    const totalChars = documents.reduce((sum: number, d: any) => sum + (d.text?.length || 0), 0)
    const totalTokens = Math.ceil(totalChars * 0.25) // 1 token ≈ 4 chars

    // If small enough, return as-is
    if (totalTokens < 50000) {
      const combined = documents
        .map((d: any) => `[From ${d.name || 'Document'}]\n${d.text || ''}`)
        .filter(Boolean)
        .join('\n\n---\n\n')
      
      return NextResponse.json({
        preparedNotes: combined,
        wasSummarized: false,
        originalTokens: totalTokens,
        finalTokens: totalTokens,
      })
    }

    console.log(`📝 Preparing notes: ${totalTokens} tokens, ${documents.length} documents`)

    // Need to chunk and summarize
    const MAX_CHUNK_TOKENS = 20000
    const TOKENS_PER_CHAR = 0.25
    const MAX_CHUNK_CHARS = MAX_CHUNK_TOKENS / TOKENS_PER_CHAR // ~80k chars

    // Chunk each document
    const allChunks: Array<{ documentName: string; text: string; chunkIndex: number }> = []
    
    for (const doc of documents) {
      const docText = doc.text || ''
      const docName = doc.name || 'Document'
      
      if (docText.length < MAX_CHUNK_CHARS) {
        // Document fits in one chunk
        allChunks.push({
          documentName: docName,
          text: docText,
          chunkIndex: 0,
        })
      } else {
        // Split document into chunks
        const chunks = chunkDocument(docText)
        for (const chunk of chunks) {
          allChunks.push({
            documentName: docName,
            text: chunk.text,
            chunkIndex: chunk.index,
          })
        }
      }
    }

    console.log(`📦 Split into ${allChunks.length} chunks for summarization`)

    // Summarize chunks in parallel (batch of 3 to avoid rate limits)
    const BATCH_SIZE = 3
    const summaries: string[] = []

    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
      const batch = allChunks.slice(i, i + BATCH_SIZE)
      
      const batchSummaries = await Promise.all(
        batch.map(async (chunk) => {
          try {
            const summary = await summarizeChunk(chunk.text, chunk.documentName, topic, chunk.chunkIndex, allChunks.length)
            return summary
          } catch (error) {
            console.error(`Error summarizing chunk ${chunk.chunkIndex} of ${chunk.documentName}:`, error)
            // Fallback: return truncated version
            return chunk.text.substring(0, 5000) + '\n\n[... truncated ...]'
          }
        })
      )

      summaries.push(...batchSummaries)
      console.log(`✅ Summarized batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allChunks.length / BATCH_SIZE)}`)
    }

    // Combine summaries
    const combinedSummary = summaries
      .map((summary, idx) => {
        const chunk = allChunks[idx]
        return `[From ${chunk.documentName}${allChunks.length > 1 ? ` - Part ${chunk.chunkIndex + 1}` : ''}]\n${summary}`
      })
      .join('\n\n---\n\n')

    const finalTokens = Math.ceil(combinedSummary.length * 0.25)

    console.log(`✅ Prepared notes: ${totalTokens} → ${finalTokens} tokens (${Math.round((1 - finalTokens/totalTokens) * 100)}% reduction)`)

    return NextResponse.json({
      preparedNotes: combinedSummary,
      wasSummarized: true,
      originalTokens: totalTokens,
      finalTokens: finalTokens,
    })
  } catch (error: any) {
    console.error('Error preparing topic notes:', error)
    return NextResponse.json({ 
      error: 'Server error', 
      details: error?.message 
    }, { status: 500 })
  }
}

/**
 * Chunk a document intelligently at sentence boundaries
 */
function chunkDocument(text: string): Array<{ text: string; index: number }> {
  const MAX_CHUNK_CHARS = 80000 // ~20k tokens
  const OVERLAP_CHARS = 2000 // ~500 tokens overlap

  if (text.length <= MAX_CHUNK_CHARS) {
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
  let currentChars = 0
  let chunkIndex = 0

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]
    const sentenceChars = sentence.length

    if (currentChars + sentenceChars > MAX_CHUNK_CHARS && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        text: currentChunk.join(' '),
        index: chunkIndex++,
      })

      // Start new chunk with overlap
      const overlapSentences = getOverlapSentences(currentChunk, OVERLAP_CHARS)
      currentChunk = [...overlapSentences, sentence]
      currentChars = overlapSentences.join(' ').length + sentenceChars
    } else {
      currentChunk.push(sentence)
      currentChars += sentenceChars
    }
  }

  if (currentChunk.length > 0) {
    chunks.push({
      text: currentChunk.join(' '),
      index: chunkIndex,
    })
  }

  return chunks
}

function getOverlapSentences(sentences: string[], targetChars: number): string[] {
  const overlap: string[] = []
  let charCount = 0

  for (let i = sentences.length - 1; i >= 0 && charCount < targetChars; i--) {
    const sentence = sentences[i]
    overlap.unshift(sentence)
    charCount += sentence.length
  }

  return overlap
}

/**
 * Summarize a single chunk using GPT-4o-mini
 */
async function summarizeChunk(
  chunkText: string,
  documentName: string,
  topic: string,
  chunkIndex: number,
  totalChunks: number
): Promise<string> {
  const summaryPrompt = `Summarize this section of a study document about the topic "${topic}". This is part ${chunkIndex + 1} of ${totalChunks} from the document "${documentName}".

CRITICAL: Preserve ALL key information relevant to "${topic}":
- Key concepts and definitions
- Important examples and formulas
- Step-by-step processes
- Problem-solving strategies
- Exam-relevant information

Document Section:
${chunkText}

Return a comprehensive but concise summary (aim for 20-30% of original length) that preserves all exam-critical information about "${topic}".`

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You create concise summaries of study materials that preserve all key information for exam preparation. Focus on exam-relevant content.',
        },
        {
          role: 'user',
          content: summaryPrompt,
        },
      ],
      temperature: 0.3,
      max_tokens: Math.min(4000, Math.ceil(chunkText.length * 0.25 * 0.3)), // Summary ~30% of original
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.warn(`⚠️ Summarization failed for chunk ${chunkIndex}:`, error)
    // Fallback: return truncated version
    return chunkText.substring(0, 5000) + '\n\n[... document truncated due to summarization error ...]'
  }

  const data = await response.json()
  const summary = data.choices?.[0]?.message?.content || chunkText.substring(0, 5000)
  
  return summary
}
