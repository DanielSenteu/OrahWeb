/**
 * Document Chunking Utilities
 * Intelligently chunks large documents for summarization
 */

export interface DocumentChunk {
  index: number
  text: string
  startChar: number
  endChar: number
  estimatedTokens: number
}

const OVERLAP_WORDS = 200 // Words to overlap between chunks for context
const MAX_CHUNK_TOKENS = 20000 // 20k tokens per chunk (safe for GPT-4o-mini)
const TOKENS_PER_CHAR = 0.25 // Rough estimate: 1 token ≈ 4 characters

/**
 * Estimate tokens from character count
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR)
}

/**
 * Split document text into chunks at sentence boundaries with overlap
 */
export function chunkDocument(text: string): DocumentChunk[] {
  if (!text || text.length === 0) {
    return []
  }

  const estimatedTokens = estimateTokens(text)
  
  // If document fits in one chunk, return it
  if (estimatedTokens <= MAX_CHUNK_TOKENS) {
    return [{
      index: 0,
      text: text,
      startChar: 0,
      endChar: text.length,
      estimatedTokens,
    }]
  }

  // Split into sentences (handle multiple sentence endings)
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

  // Add remaining text
  if (lastIndex < text.length) {
    const remaining = text.substring(lastIndex).trim()
    if (remaining.length > 0) {
      sentences.push(remaining)
    }
  }

  // Group sentences into chunks
  const chunks: DocumentChunk[] = []
  let currentChunk: string[] = []
  let currentTokens = 0
  let chunkIndex = 0
  let startChar = 0

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]
    const sentenceTokens = estimateTokens(sentence)

    if (currentTokens + sentenceTokens > MAX_CHUNK_TOKENS && currentChunk.length > 0) {
      // Save current chunk
      const chunkText = currentChunk.join(' ')
      chunks.push({
        index: chunkIndex++,
        text: chunkText,
        startChar,
        endChar: startChar + chunkText.length,
        estimatedTokens: currentTokens,
      })

      // Start new chunk with overlap
      const overlapSentences = getOverlapSentences(currentChunk, OVERLAP_WORDS)
      currentChunk = [...overlapSentences, sentence]
      currentTokens = overlapSentences.reduce((sum, s) => sum + estimateTokens(s), 0) + sentenceTokens
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
 * Get overlap sentences from the end of a chunk
 */
function getOverlapSentences(sentences: string[], targetWords: number): string[] {
  const overlap: string[] = []
  let wordCount = 0

  // Start from the end and work backwards
  for (let i = sentences.length - 1; i >= 0 && wordCount < targetWords; i--) {
    const sentence = sentences[i]
    const words = sentence.split(/\s+/).length
    overlap.unshift(sentence) // Add to beginning to maintain order
    wordCount += words
  }

  return overlap
}

/**
 * Chunk multiple documents and return all chunks with document metadata
 */
export function chunkDocuments(documents: Array<{ name: string; text: string }>): Array<{
  documentName: string
  chunk: DocumentChunk
}> {
  const allChunks: Array<{ documentName: string; chunk: DocumentChunk }> = []

  for (const doc of documents) {
    const chunks = chunkDocument(doc.text)
    for (const chunk of chunks) {
      allChunks.push({
        documentName: doc.name,
        chunk,
      })
    }
  }

  return allChunks
}
