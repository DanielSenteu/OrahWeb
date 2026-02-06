# Full Implementation Plan: 3-Hour Lecture Processing

## 🎯 Questions Before Implementation

### 1. **Audio Chunking Approach**
**Question:** How should we handle audio chunking for Whisper API's 25MB limit?

**Options:**
- **A)** Use a JavaScript library to split WebM files (may have limitations)
- **B)** Use ffmpeg via a service/API (more reliable, but requires external service)
- **C)** Compress audio first to reduce size (may affect quality)
- **D)** Use alternative transcription service that supports larger files

**Recommendation:** Option B (ffmpeg) is most reliable, but requires setup. Option A (JS library) is simpler but may have edge cases.

### 2. **Async Processing Pattern**
**Question:** How should we handle long processing times?

**Options:**
- **A)** Database queue + separate worker Edge Function
- **B)** Database queue + polling from frontend
- **C)** Webhook/callback pattern
- **D)** Supabase Realtime for status updates

**Recommendation:** Option A + D (queue + Realtime) for best UX.

### 3. **Chunking Strategy**
**Question:** For transcript chunking, what's the priority?

**Options:**
- **A)** Speed (parallel processing) - faster but may lose context
- **B)** Quality (sequential with overlap) - slower but better coherence
- **C)** Hybrid (parallel with context injection) - balance

**Recommendation:** Option B for best quality, with progress updates.

### 4. **Error Recovery**
**Question:** If one chunk fails, should we:
- **A)** Retry just that chunk
- **B)** Retry entire processing
- **C)** Save partial results and allow manual retry

**Recommendation:** Option A (retry failed chunks only).

## 📋 Proposed Architecture

### Phase 1: Audio Chunking
1. Download audio from Storage
2. Check file size
3. If > 25MB, split into chunks using ffmpeg (or JS library)
4. Transcribe each chunk with Whisper
5. Combine transcripts with timestamps
6. Save full transcript

### Phase 2: Transcript Chunking (if needed)
1. Check transcript token count
2. If > 100k tokens, split intelligently:
   - Split at sentence boundaries
   - Add 200-word overlap
   - Preserve topic boundaries
3. Process each chunk sequentially
4. Merge results intelligently

### Phase 3: Async Processing
1. Save transcript immediately
2. Create processing job in database
3. Queue note generation
4. Process in background
5. Update status via Realtime
6. Save final notes when complete

## 🔧 Implementation Components Needed

1. **Audio Chunking Utility** (`lib/utils/audio-chunker.ts`)
   - Split WebM into 25MB chunks
   - Handle timestamps
   - Combine transcripts

2. **Transcript Chunker** (`lib/utils/transcript-chunker.ts`)
   - Intelligent sentence-boundary splitting
   - Overlap management
   - Context preservation

3. **Note Merger** (`lib/utils/note-merger.ts`)
   - Deduplicate definitions
   - Merge sections semantically
   - Combine takeaways
   - Generate final summary

4. **Processing Queue** (Database table)
   - Job status tracking
   - Chunk progress
   - Error handling

5. **Background Worker** (Edge Function)
   - Process queued jobs
   - Handle chunking
   - Update status

## ⚠️ Technical Challenges

1. **ffmpeg in Edge Function** - May not be available, need alternative
2. **WebM splitting** - Complex format, may need conversion
3. **Memory limits** - Edge Functions have memory constraints
4. **Cost** - Multiple API calls increase costs significantly

## 🚀 Recommended Approach

**Start with simpler solution, then optimize:**

1. **Immediate:** Use JavaScript audio splitting (if possible) or compress audio
2. **Short-term:** Implement transcript chunking (easier, no external deps)
3. **Long-term:** Add ffmpeg service for better audio chunking

**This allows:**
- ✅ Get it working quickly
- ✅ Handle most cases (compressed audio may fit in 25MB)
- ✅ Add robust audio chunking later

## ❓ Questions for You

1. **Audio chunking:** Prefer JS library (simpler) or ffmpeg service (more reliable)?
2. **Processing time:** Is 15-30 minutes acceptable for 3-hour lectures?
3. **Cost:** Are you okay with 5-10x more API calls for chunking?
4. **Quality vs Speed:** Prefer best quality (sequential) or faster (parallel)?
