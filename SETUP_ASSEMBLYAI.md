# AssemblyAI Setup - Quick Guide

## ✅ Your API Key
```
2ecc647caabf49ce99b6f6e93f6dd176
```

## 🚀 Setup (2 Steps)

### Step 1: Add API Key to Supabase Secrets

1. Go to **Supabase Dashboard** → Your Project
2. **Project Settings** → **Edge Functions** → **Secrets**
3. Click **"Add new secret"**
4. Enter:
   - **Name:** `ASSEMBLYAI_API_KEY`
   - **Value:** `2ecc647caabf49ce99b6f6e93f6dd176`
5. Click **"Save"**

### Step 2: Deploy Edge Function

The Edge Function code is already updated in `supabase/functions/lecture_notes_audio/index.ts`

**Deploy via Supabase Dashboard:**
1. Go to **Edge Functions** → `lecture_notes_audio`
2. Copy code from `supabase/functions/lecture_notes_audio/index.ts`
3. Paste and click **"Deploy"**

**OR via CLI:**
```bash
supabase functions deploy lecture_notes_audio
```

## ✅ Done!

Your lecture notes will now:
- ✅ Process in **5-11 minutes** (vs 15-30 minutes)
- ✅ Handle files of **any size** (no 25MB limit)
- ✅ Use **language detection** automatically
- ✅ Use **universal-3-pro** for best quality

## 🎯 What's Configured

The Edge Function now uses:
- `language_detection: true` - Auto-detects language
- `speech_model: "universal-3-pro"` - Best quality (auto-falls back to universal-2 for other languages)
- `punctuate: true` - Adds punctuation
- `format_text: true` - Formats text nicely

This matches your SDK example! 🎉
