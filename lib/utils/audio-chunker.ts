/**
 * Audio Chunker
 * Handles splitting large audio files for Whisper API (25MB limit)
 * 
 * Note: In Deno Edge Functions, we can't easily use ffmpeg.
 * This utility provides a workaround approach.
 */

export interface AudioChunk {
  index: number
  blob: Blob
  startTime?: number // Approximate start time in seconds
  endTime?: number // Approximate end time in seconds
}

const WHISPER_MAX_SIZE_BYTES = 25 * 1024 * 1024 // 25MB
const ESTIMATED_BYTES_PER_SECOND = 16000 // Rough estimate for WebM audio

/**
 * Check if audio needs chunking
 */
export function needsChunking(fileSize: number): boolean {
  return fileSize > WHISPER_MAX_SIZE_BYTES
}

/**
 * Estimate number of chunks needed
 */
export function estimateChunkCount(fileSize: number): number {
  return Math.ceil(fileSize / WHISPER_MAX_SIZE_BYTES)
}

/**
 * Split audio blob into chunks
 * 
 * Note: This is a simplified approach. For production, you'd want to:
 * 1. Use ffmpeg via a service (e.g., Cloudinary, AWS MediaConvert)
 * 2. Or use a dedicated audio processing service
 * 3. Or convert to a format that's easier to split (MP3)
 * 
 * For now, this provides a basic implementation that can be enhanced.
 */
export async function chunkAudio(audioBlob: Blob): Promise<AudioChunk[]> {
  const fileSize = audioBlob.size

  if (!needsChunking(fileSize)) {
    return [{
      index: 0,
      blob: audioBlob,
      startTime: 0,
      endTime: estimateDuration(fileSize),
    }]
  }

  // For large files, we need a more sophisticated approach
  // Since we can't easily split WebM in Deno, we'll need to:
  // 1. Use an external service, OR
  // 2. Convert format first, OR
  // 3. Use a different transcription approach
  
  // For now, throw an error with helpful message
  throw new Error(
    `Audio file is too large (${(fileSize / 1024 / 1024).toFixed(2)}MB) for direct processing. ` +
    `Whisper API limit is 25MB. ` +
    `Please use audio compression or contact support for large file processing.`
  )
}

/**
 * Estimate audio duration from file size
 */
function estimateDuration(fileSizeBytes: number): number {
  return Math.ceil(fileSizeBytes / ESTIMATED_BYTES_PER_SECOND)
}

/**
 * Combine transcripts from multiple chunks
 * Adds timestamps if available
 */
export function combineTranscripts(
  chunkTranscripts: Array<{ text: string; chunkIndex: number; startTime?: number }>
): string {
  // Sort by chunk index
  const sorted = [...chunkTranscripts].sort((a, b) => a.chunkIndex - b.chunkIndex)
  
  // Combine with spacing
  return sorted.map(chunk => chunk.text).join(' ').trim()
}
