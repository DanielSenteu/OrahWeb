# 3-Hour Lecture Processing Analysis

## ⚠️ Issues Found

### 1. **Whisper API File Size Limit: 25MB**
- **Problem**: A 3-hour WebM audio file is typically **200-500MB**
- **Current Code**: Sends entire file to Whisper API
- **Result**: Will fail with "File too large" error

### 2. **Edge Function Timeout**
- **Problem**: Supabase Edge Functions have timeout limits:
  - Free tier: **60 seconds**
  - Pro tier: **300 seconds (5 minutes)**
- **Reality**: Processing 3-hour audio takes **10-30 minutes**
- **Result**: Function will timeout before completion

### 3. **GPT Context Window**
- **Status**: ✅ Should be OK
- **GPT-4o-mini**: 128k token context window
- **3-hour transcript**: ~30k-40k tokens
- **Note**: Code has check but doesn't actually chunk if needed

### 4. **Transcript Length Handling**
- **Problem**: Code detects long transcripts but doesn't chunk them
- **Current**: Just logs a warning, sends full transcript anyway
- **Risk**: If transcript exceeds context window, GPT will truncate

## 🔧 Solutions Needed

### Solution 1: Chunk Audio for Whisper API
Split large audio files into 25MB chunks, transcribe each, combine transcripts.

### Solution 2: Async Processing with Queue
Move processing to background job that can run longer than Edge Function timeout.

### Solution 3: Transcript Chunking for GPT
If transcript is too long, split into sections and process separately, then combine.

### Solution 4: Better Error Handling
Handle file size errors gracefully and provide user feedback.

## 📊 Estimated Processing Times

| Step | Duration (3-hour lecture) |
|------|---------------------------|
| Download from Storage | 30-60 seconds |
| Whisper Transcription | 10-20 minutes |
| GPT Note Generation | 1-3 minutes |
| **Total** | **12-24 minutes** |

**Edge Function Timeout**: 60-300 seconds ❌ **NOT ENOUGH**

## 🎯 Recommended Approach

1. **Immediate Fix**: Implement audio chunking for Whisper
2. **Better Fix**: Use async processing (database queue + background worker)
3. **Best Fix**: Hybrid - chunk audio, async processing, progress updates
