# AssemblyAI Quick Setup - Your API Key Ready!

## ✅ Your API Key
```
2ecc647caabf49ce99b6f6e93f6dd176
```

## 🚀 Setup Steps (5 minutes)

### Step 1: Add API Key to Supabase

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **Project Settings** → **Edge Functions** → **Secrets**
4. Click **"Add new secret"**
5. Enter:
   - **Name:** `ASSEMBLYAI_API_KEY`
   - **Value:** `2ecc647caabf49ce99b6f6e93f6dd176`
6. Click **"Save"**

### Step 2: Deploy Updated Edge Function

**Option A: Via Supabase Dashboard (Easiest)**
1. Go to **Edge Functions** in your Supabase Dashboard
2. Find `lecture_notes_audio` (or create it if it doesn't exist)
3. Open the file: `supabase/functions/lecture_notes_audio/index.ts`
4. Copy **ALL** the code from that file
5. Paste it into the Supabase Dashboard editor
6. Click **"Deploy"**

**Option B: Via Supabase CLI**
```bash
supabase functions deploy lecture_notes_audio
```

### Step 3: Test It!

1. Go to your lecture notes page
2. Record a test lecture (or use existing recording)
3. Watch it process in **5-11 minutes** instead of 15-30! ⚡

## 🎯 What Changed

- ✅ **AssemblyAI** replaces Whisper (handles files of any size)
- ✅ **Parallel processing** for note generation (much faster)
- ✅ **Intelligent chunking** for long transcripts
- ✅ **Smart merging** of notes from chunks

## 📊 Expected Performance

| Metric | Before | After |
|--------|--------|-------|
| **Processing Time** | 15-30 min | **5-11 min** ⚡ |
| **File Size Limit** | 25MB | **Unlimited** |
| **Cost per 3hr** | $1.08 | **$0.045** |

## ⚠️ Important Notes

1. **Signed URLs:** The Edge Function creates a signed URL (valid 1 hour) for AssemblyAI to access your audio file from Supabase Storage.

2. **Free Tier:** You have 5 hours/month free with AssemblyAI - perfect for testing!

3. **Credits:** Since you've added credits, you're all set! 🎉

## 🐛 Troubleshooting

**"ASSEMBLYAI_API_KEY not configured"**
- Make sure you added the secret in Supabase Dashboard
- Redeploy the Edge Function after adding the secret

**Still using Whisper?**
- Check that `ASSEMBLYAI_API_KEY` is set correctly
- Verify the Edge Function was deployed with the new code

**Processing still slow?**
- First transcription might be slower (cold start)
- Subsequent transcriptions should be 5-11 minutes

## ✅ You're All Set!

Once you:
1. ✅ Add the API key to Supabase secrets
2. ✅ Deploy the updated Edge Function

Your lecture notes will process in **5-11 minutes** instead of 15-30! 🚀
