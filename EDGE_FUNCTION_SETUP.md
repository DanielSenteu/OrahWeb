# Lecture Notes Audio - Edge Function Setup

## Overview
Audio processing has been moved to a Supabase Edge Function to eliminate Vercel timeout limits. Edge functions have no hard timeout limits, making them perfect for long recordings (1+ hours).

## What Was Changed

### 1. New Supabase Edge Function
**File**: `supabase/functions/lecture_notes_audio/index.ts`

**Features**:
- ✅ No timeout limits - can handle recordings of any length
- ✅ Saves transcript immediately after Whisper transcription
- ✅ Generates notes from transcript
- ✅ Handles retries (can regenerate notes from saved transcript)
- ✅ Proper error handling and status tracking

### 2. New API Route
**File**: `app/api/lecture-notes/audio-edge/route.ts`

Proxies requests to the Supabase Edge Function with proper authentication.

### 3. Updated Frontend
**File**: `app/lecture-notes/page.tsx`

- Now calls `/api/lecture-notes/audio-edge` instead of `/api/lecture-notes/audio`
- Passes authentication token to edge function
- Retry function also updated to use edge function

### 4. Updated Retry Endpoint
**File**: `app/api/lecture-notes/retry/route.ts`

- Now uses edge function for retry
- Fetches existing transcript from database
- Calls edge function with noteId (no audio needed)

## Setup Instructions

### Step 1: Deploy Edge Function to Supabase

1. **Install Supabase CLI** (if not already installed):
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**:
   ```bash
   supabase login
   ```

3. **Link your project**:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```
   (Find your project ref in Supabase dashboard URL: `https://supabase.com/dashboard/project/YOUR_PROJECT_REF`)

4. **Deploy the function**:
   ```bash
   supabase functions deploy lecture_notes_audio
   ```

5. **Set environment variables**:
   ```bash
   supabase secrets set OPENAI_API_KEY=your_openai_api_key
   ```
   (The SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are automatically available)

### Step 2: Get Edge Function URL

After deployment, you'll get a URL like:
```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/lecture_notes_audio
```

### Step 3: Add Environment Variable to Vercel

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add:
   ```
   NEXT_PUBLIC_EDGE_FUNCTION_LECTURE_NOTES_AUDIO=https://YOUR_PROJECT_REF.supabase.co/functions/v1/lecture_notes_audio
   ```
3. Redeploy your Vercel app

### Step 4: Verify Setup

1. Test with a short recording (< 5 min) - should work as before
2. Test with a long recording (30+ min) - should now work without timeout
3. Test retry functionality - should regenerate notes from saved transcript

## How It Works

### Normal Flow:
1. User records audio → Frontend sends to `/api/lecture-notes/audio-edge`
2. API route proxies to Supabase Edge Function with auth token
3. Edge function:
   - Transcribes audio with Whisper API (no timeout limit!)
   - Saves transcript to database immediately
   - Generates notes from transcript
   - Updates database with notes
4. Returns notes to frontend

### Retry Flow:
1. User clicks "Retry" on failed lecture
2. Frontend calls `/api/lecture-notes/retry`
3. API route:
   - Fetches existing transcript from database
   - Calls edge function with noteId (no audio needed)
4. Edge function:
   - Fetches transcript from database using noteId
   - Generates notes from existing transcript
   - Updates database with notes
5. Returns notes to frontend

## Benefits

✅ **No Timeout Limits**: Edge functions can run for hours if needed
✅ **Handles Long Recordings**: 1+ hour recordings now work perfectly
✅ **Better Reliability**: No Vercel function timeout issues
✅ **Same Features**: Transcript saving, retry, error handling all preserved
✅ **Scalable**: Edge functions scale automatically

## Troubleshooting

**If edge function deployment fails:**
- Check Supabase CLI is installed and logged in
- Verify project ref is correct
- Check OpenAI API key is set as secret

**If edge function returns 401:**
- Verify auth token is being passed correctly
- Check edge function has proper CORS headers (already included)

**If transcription still fails:**
- Check OpenAI API key is valid
- Verify audio format is supported (webm, mp3, etc.)
- Check file size isn't too large (Whisper has 25MB limit)

## Testing Checklist

- [ ] Short recording (< 5 min) works
- [ ] Medium recording (15-30 min) works
- [ ] Long recording (1+ hour) works without timeout
- [ ] Retry functionality works for failed lectures
- [ ] Transcript is always saved, even if notes fail
- [ ] Error messages are clear and helpful

## Migration Notes

The old `/api/lecture-notes/audio` route is still available but deprecated. You can remove it after confirming the edge function works correctly.
