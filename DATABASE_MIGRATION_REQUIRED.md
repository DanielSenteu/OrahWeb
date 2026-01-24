# ⚠️ Database Migration Required

## Error You're Seeing

```
Could not find the 'processing_status' column of 'lecture_notes' in the schema cache
```

## Solution

You need to run the database migration to add the new columns. Here's how:

### Step 1: Open Supabase SQL Editor

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in the left sidebar
4. Click **New Query**

### Step 2: Run the Migration SQL

Copy and paste this SQL into the editor:

```sql
-- ============================================
-- LECTURE NOTES SCHEMA UPDATE
-- Add processing_status and improve error handling
-- ============================================

-- Add processing_status column to track lecture processing state
ALTER TABLE lecture_notes 
ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'completed' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed'));

-- Add error_message column to store failure details
ALTER TABLE lecture_notes 
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add retry_count column to track retry attempts
ALTER TABLE lecture_notes 
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Update index to include processing_status for faster queries
CREATE INDEX IF NOT EXISTS idx_lecture_notes_status ON lecture_notes(user_id, processing_status);

-- Add comment for documentation
COMMENT ON COLUMN lecture_notes.processing_status IS 'Status: pending (transcript saved, notes not generated), processing (notes being generated), completed (success), failed (error occurred)';
COMMENT ON COLUMN lecture_notes.error_message IS 'Error message if processing failed';
COMMENT ON COLUMN lecture_notes.retry_count IS 'Number of retry attempts for failed processing';
```

### Step 3: Execute

1. Click **Run** (or press Ctrl+Enter / Cmd+Enter)
2. You should see "Success. No rows returned"
3. The migration is complete!

### Step 4: Verify

Run this query to verify the columns were added:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'lecture_notes'
AND column_name IN ('processing_status', 'error_message', 'retry_count');
```

You should see all three columns listed.

### Step 5: Test

Try processing a lecture recording again. It should work now!

## What These Columns Do

- **`processing_status`**: Tracks whether the lecture is pending, processing, completed, or failed
- **`error_message`**: Stores error details if processing fails
- **`retry_count`**: Tracks how many times you've retried failed processing

## Temporary Workaround

The edge function has been updated to work without these columns (as a fallback), but you'll lose the ability to:
- See failed lectures in the UI
- Retry failed processing
- Track processing status

**So please run the migration for full functionality!**
