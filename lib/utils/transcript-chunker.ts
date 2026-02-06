/**
 * Transcript Chunker
 * Intelligently splits long transcripts into manageable chunks for GPT processing
 */

export interface TranscriptChunk {
  index: number
  text: string
  startChar: number
  endChar: number
  estimatedTokens: number
}

const OVERLAP_WORDS = 200 // Words to overlap between chunks for context
const MAX_CHUNK_TOKENS = 80000 // Leave room for prompt + response (GPT-4o-mini has 128k)
const TOKENS_PER_CHAR = 0.25 // Rough estimate: 1 token ≈ 4 characters

/**
 * Split transcript into chunks at sentence boundaries with overlap
 */
export function chunkTranscript(transcript: string): TranscriptChunk[] {
  if (!transcript || transcript.length === 0) {
    return []
  }

  const estimatedTokens = Math.ceil(transcript.length * TOKENS_PER_CHAR)
  
  // If transcript fits in one chunk, return it
  if (estimatedTokens <= MAX_CHUNK_TOKENS) {
    return [{
      index: 0,
      text: transcript,
      startChar: 0,
      endChar: transcript.length,
      estimatedTokens,
    }]
  }

  // Split into sentences (handle multiple sentence endings)
  const sentenceEndings = /[.!?]\s+/g
  const sentences: string[] = []
  let lastIndex = 0
  let match

  while ((match = sentenceEndings.exec(transcript)) !== null) {
    const sentence = transcript.substring(lastIndex, match.index + match[0].length)
    if (sentence.trim().length > 0) {
      sentences.push(sentence.trim())
    }
    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < transcript.length) {
    const remaining = transcript.substring(lastIndex).trim()
    if (remaining.length > 0) {
      sentences.push(remaining)
    }
  }

  // Group sentences into chunks
  const chunks: TranscriptChunk[] = []
  let currentChunk: string[] = []
  let currentTokens = 0
  let chunkIndex = 0
  let startChar = 0

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]
    const sentenceTokens = Math.ceil(sentence.length * TOKENS_PER_CHAR)

    // If adding this sentence would exceed limit, save current chunk
    if (currentTokens + sentenceTokens > MAX_CHUNK_TOKENS && currentChunk.length > 0) {
      const chunkText = currentChunk.join(' ')
      chunks.push({
        index: chunkIndex++,
        text: chunkText,
        startChar,
        endChar: startChar + chunkText.length,
        estimatedTokens: currentTokens,
      })

      // Start new chunk with overlap from previous chunk
      const overlapSentences = getOverlapSentences(currentChunk, OVERLAP_WORDS)
      currentChunk = [...overlapSentences, sentence]
      currentTokens = overlapSentences.reduce((sum, s) => sum + Math.ceil(s.length * TOKENS_PER_CHAR), 0) + sentenceTokens
      startChar = chunks[chunks.length - 1].endChar - overlapSentences.join(' ').length
    } else {
      currentChunk.push(sentence)
      currentTokens += sentenceTokens
    }
  }

  // Add final chunk
  if (currentChunk.length > 0) {
    const chunkText = currentChunk.join(' ')
    chunks.push({
      index: chunkIndex,
      text: chunkText,
      startChar,
      endChar: startChar + chunkText.length,
      estimatedTokens: currentTokens,
    })
  }

  return chunks
}

/**
 * Get last N words from chunk for overlap
 */
function getOverlapSentences(sentences: string[], targetWords: number): string[] {
  const overlap: string[] = []
  let wordCount = 0

  // Start from the end and work backwards
  for (let i = sentences.length - 1; i >= 0 && wordCount < targetWords; i--) {
    const sentence = sentences[i]
    const words = sentence.split(/\s+/).length
    overlap.unshift(sentence)
    wordCount += words
  }

  return overlap
}

/**
 * Estimate token count for text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR)
}
