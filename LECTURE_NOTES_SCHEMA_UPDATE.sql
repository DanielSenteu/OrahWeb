-- ============================================
-- LECTURE NOTES SCHEMA UPDATE
-- Add processing_status and improve error handling
-- Run this in your Supabase SQL Editor
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

-- ============================================
-- DONE!
-- ============================================
