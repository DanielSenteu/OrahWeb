# Lecture Recordings Storage Migration

## ✅ What Changed

We've migrated from base64-encoded audio in API requests to **Supabase Storage** for storing lecture recordings. This fixes issues with:
- ❌ Long recordings failing (payload size limits)
- ❌ Short recordings sometimes not working (timeout issues)
- ❌ Audio files being lost if processing fails

## 🎯 New Flow

1. **User stops recording** → Audio Blob is created
2. **Immediate upload** → Audio uploaded directly to Supabase Storage (no timeout issues!)
3. **Database record** → Note created with `audio_url` pointing to Storage
4. **Processing** → Edge Function downloads from Storage and processes
5. **Result** → Transcript and notes saved

## 📋 Setup Required

### Step 1: Run Database Migration

Run the updated SQL in Supabase SQL Editor:
```sql
-- This adds the audio_url column
-- See LECTURE_NOTES_SCHEMA_UPDATE.sql
```

### Step 2: Create Storage Bucket

Follow the instructions in `STORAGE_SETUP.md`:
1. Create `lecture-recordings` bucket
2. Set up RLS policies
3. Configure file size limits (500MB recommended)

### Step 3: Deploy Edge Function

The Edge Function has been updated to read from Storage. Make sure it's deployed:
```bash
supabase functions deploy lecture_notes_audio
```

## 🔄 Backwards Compatibility

The system still supports base64 audio (for backwards compatibility), but **Storage is preferred**:
- ✅ New recordings → Use Storage (no size limits)
- ✅ Old recordings → Can still use base64 if needed
- ✅ Retries → Work with existing transcripts

## 📁 File Structure

Audio files are stored as:
```
lecture-recordings/
  {user_id}/
    {note_id}.webm
```

This ensures:
- ✅ User isolation (each user's files are separate)
- ✅ Easy cleanup (delete by note_id)
- ✅ No conflicts (unique paths)

## 🚀 Benefits

1. **No timeout issues** - Storage uploads happen in background
2. **No size limits** - Storage handles files up to 5GB
3. **Persistent storage** - Audio saved even if processing fails
4. **Efficient** - Direct binary upload, no base64 overhead
5. **Retry-friendly** - Can reprocess from saved audio anytime

## 🧪 Testing

After setup, test with:
1. **Short recording** (30 seconds) - Should work immediately
2. **Long recording** (1+ hour) - Should upload and process successfully
3. **Retry failed note** - Should work from saved transcript

## ⚠️ Important Notes

- Make sure Storage bucket exists before testing
- RLS policies must be set correctly (see `STORAGE_SETUP.md`)
- Edge Function needs service role key to access Storage
- Old recordings without `audio_url` will still work (uses transcript)

## 🔍 Troubleshooting

**Error: "Bucket not found"**
→ Create the `lecture-recordings` bucket (see `STORAGE_SETUP.md`)

**Error: "Permission denied"**
→ Check RLS policies are set correctly

**Error: "Failed to download audio"**
→ Verify Edge Function has service role key and Storage access

**Old recordings not showing audio_url**
→ This is expected - they use transcripts. New recordings will have audio_url.
