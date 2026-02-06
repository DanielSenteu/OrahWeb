# AssemblyAI Integration Guide

## ✅ Why AssemblyAI?

1. **Free Tier:** 5 hours/month free transcription
2. **Automatic Chunking:** Handles files of any size automatically
3. **Fast:** 2-5 minutes for 3-hour lectures (vs 15-30 minutes)
4. **Simple API:** Just send Storage URL, they fetch it
5. **Webhooks:** Built-in async processing
6. **Cost:** $0.00025/minute after free tier (~$0.045 for 3 hours)

## 🔧 Implementation Steps

### Step 1: Get AssemblyAI API Key
1. Sign up at https://www.assemblyai.com (free tier available)
2. Get your API key from dashboard
3. Add to environment variables: `ASSEMBLYAI_API_KEY`

### Step 2: Make Storage URL Public (Temporary)
AssemblyAI needs to fetch the audio file. Options:
- **Option A:** Create signed URL (temporary, secure)
- **Option B:** Make file public temporarily (simpler)

### Step 3: Update Edge Function
- Replace Whisper API with AssemblyAI
- Send Storage URL (they fetch it)
- Use polling or webhook for results

### Step 4: Parallel Note Generation
- Process transcript chunks in parallel
- Merge results
- Much faster than sequential

## 📊 Expected Performance

| Step | Time (3-hour lecture) |
|------|----------------------|
| Audio Upload | 1-2 minutes |
| AssemblyAI Transcription | **2-5 minutes** ⚡ |
| Transcript Chunking | <1 second |
| Note Generation (parallel) | **2-4 minutes** ⚡ |
| Merging | <1 second |
| **Total** | **5-11 minutes** ⚡⚡⚡ |

**vs Current:** 15-30 minutes 🐌

## 💰 Cost Comparison

- **AssemblyAI:** $0.045 per 3-hour lecture (after free tier)
- **Whisper (chunked):** $1.08 per 3-hour lecture
- **Savings:** ~96% cheaper + much faster!
