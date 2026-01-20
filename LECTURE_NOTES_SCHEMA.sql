-- ============================================
-- LECTURE NOTES DATABASE SCHEMA
-- Run this in your Supabase SQL Editor
-- ============================================

-- Create lecture_notes table
CREATE TABLE lecture_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]',
  key_takeaways JSONB NOT NULL DEFAULT '[]',
  definitions JSONB NOT NULL DEFAULT '[]',
  source_type TEXT NOT NULL, -- 'typed' or 'recorded'
  original_content TEXT, -- Original rough notes or transcript
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX idx_lecture_notes_user_id ON lecture_notes(user_id);
CREATE INDEX idx_lecture_notes_created_at ON lecture_notes(created_at DESC);

-- Enable Row Level Security
ALTER TABLE lecture_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own notes
CREATE POLICY "Users can view their own lecture notes"
  ON lecture_notes FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own notes
CREATE POLICY "Users can insert their own lecture notes"
  ON lecture_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own notes
CREATE POLICY "Users can update their own lecture notes"
  ON lecture_notes FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policy: Users can delete their own notes
CREATE POLICY "Users can delete their own lecture notes"
  ON lecture_notes FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- DONE!
-- ============================================
-- After running this SQL:
-- 1. The lecture_notes table will be created
-- 2. All security policies will be in place
-- 3. Notes will automatically save when generated
-- 4. Users will see their saved notes on every visit
-- ============================================

