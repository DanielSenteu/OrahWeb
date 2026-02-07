# Retry Button Debug - Added Comprehensive Logging

## 🔍 Issue
User reports: "Generate Notes" button on old failed lectures does nothing - no logs, edge function not called, button doesn't work.

## ✅ Changes Made

### 1. **Frontend Button Click Handlers** (`app/lecture-notes/page.tsx`)

**Added:**
- `e.preventDefault()` to prevent default behavior
- Console logs at button click: `🔴 Retry button clicked` / `🔵 Generate Notes button clicked`
- Try-catch wrapper around `retryNoteGeneration` call
- Error toast messages in button handler
- `cursor: 'pointer'` style to ensure button is clickable

**Location:**
- Line ~1011: Pending/Failed section button
- Line ~1128: Failed section button

### 2. **Retry Function** (`app/lecture-notes/page.tsx`)

**Added:**
- Console log at function start: `🔄 Retry button clicked for note:`
- Check for `userId` with error message
- Console log before API call: `📡 Calling retry API...`
- Console log after API response: `📥 Retry API response:`
- Console log for response data: `📥 Retry API response data:`
- Better error logging with details

**Location:** Line ~835

### 3. **Retry API Route** (`app/api/lecture-notes/retry/route.ts`)

**Added:**
- Console log at route start: `🔄 Retry API called`
- Console log for request body: `📋 Retry request:`
- Console log for note data: `📋 Note data:` (hasTranscript, hasAudio, transcriptLength)
- Better error messages with details
- Console error if note not found
- Console error if no transcript/audio

**Location:** Line ~8, ~19, ~40-47

## 🧪 How to Debug

1. **Open browser console** (F12)
2. **Click "Generate Notes" or "Retry" button**
3. **Check console logs:**
   - Should see: `🔴 Retry button clicked` or `🔵 Generate Notes button clicked`
   - Should see: `🔄 Retry button clicked for note: [noteId]`
   - Should see: `🔐 Getting session...`
   - Should see: `📡 Calling retry API...`
   - Should see: `🔄 Retry API called` (in server logs)
   - Should see: `📋 Retry request:` (in server logs)
   - Should see: `📥 Retry API response:` (in browser)

4. **If no logs appear:**
   - Button click isn't firing → Check if button is disabled/covered
   - JavaScript error → Check console for errors
   - Function not called → Check if `retryNoteGeneration` is defined

5. **If API logs appear but edge function doesn't:**
   - Check `WORKER_URL` environment variable
   - Check if worker function is deployed
   - Check network tab for failed requests

## 🔧 Potential Issues to Check

1. **Button not clickable:**
   - Check if there's a CSS overlay
   - Check if button is disabled
   - Check z-index

2. **JavaScript error:**
   - Check browser console for errors
   - Check if `retryNoteGeneration` is defined
   - Check if `userId` is set

3. **API not called:**
   - Check network tab
   - Check if route exists: `/api/lecture-notes/retry`
   - Check CORS issues

4. **Edge function not called:**
   - Check `NEXT_PUBLIC_EDGE_FUNCTION_LECTURE_NOTES_WORKER` env var
   - Check worker function deployment
   - Check worker function logs

## 📋 Next Steps

1. **Test with console open:**
   - Click button
   - Check which logs appear
   - Report back with logs

2. **Check network tab:**
   - See if API call is made
   - Check response status
   - Check response body

3. **Check server logs:**
   - Vercel function logs
   - Supabase Edge Function logs
