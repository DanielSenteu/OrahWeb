# Database Schema Setup for Lecture Notes

## ✅ Required Schema Updates

You need to run **ONE** SQL file to update the existing `lecture_notes` table:

### **LECTURE_NOTES_SCHEMA_UPDATE.sql** (REQUIRED)

This adds columns to your existing `lecture_notes` table:

**Columns Added:**
- `processing_status` - Tracks processing state ('pending', 'processing', 'completed', 'failed')
- `error_message` - Stores error details if processing fails
- `retry_count` - Tracks retry attempts
- `audio_url` - Stores Supabase Storage path for the audio file

**How to Run:**
1. Go to **Supabase Dashboard** → **SQL Editor**
2. Open `LECTURE_NOTES_SCHEMA_UPDATE.sql`
3. Copy and paste the entire file
4. Click **"Run"**

This is **REQUIRED** for the Edge Function to work properly.

---

## ⚠️ Optional Schema (For Future Async Processing)

### **LONG_LECTURE_PROCESSING_SCHEMA.sql** (OPTIONAL)

This creates new tables for advanced async processing:
- `lecture_processing_jobs` - Tracks processing jobs
- `lecture_audio_chunks` - Tracks audio chunk processing
- `lecture_transcript_chunks` - Tracks transcript chunk processing

**Current Status:** The Edge Function currently processes synchronously (with parallel chunking), so these tables are **NOT required** right now.

**When to Use:** If you want to implement fully async processing with job queues in the future.

---

## 📋 Quick Setup Checklist

### Required:
- [ ] Run `LECTURE_NOTES_SCHEMA_UPDATE.sql` in Supabase SQL Editor

### Optional (for future):
- [ ] Run `LONG_LECTURE_PROCESSING_SCHEMA.sql` if you want async processing tables

---

## 🎯 Summary

**You only need to run ONE file:**
- ✅ `LECTURE_NOTES_SCHEMA_UPDATE.sql` - **REQUIRED**

The other schema file is for future enhancements and not needed for the current implementation.
