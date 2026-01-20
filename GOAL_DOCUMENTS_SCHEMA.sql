-- ============================================
-- GOAL DOCUMENTS DATABASE SCHEMA
-- Run this in your Supabase SQL Editor
-- ============================================

-- Create goal_documents table
CREATE TABLE goal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES user_goals(id) ON DELETE SET NULL,
  academic_type TEXT NOT NULL, -- 'semester' | 'assignment' | 'exam'
  title TEXT,
  file_name TEXT,
  source_type TEXT NOT NULL, -- 'pdf' | 'image' | 'text'
  original_content TEXT NOT NULL,
  extracted_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX idx_goal_documents_user_id ON goal_documents(user_id);
CREATE INDEX idx_goal_documents_goal_id ON goal_documents(goal_id);
CREATE INDEX idx_goal_documents_academic_type ON goal_documents(academic_type);
CREATE INDEX idx_goal_documents_created_at ON goal_documents(created_at DESC);

-- Enable Row Level Security
ALTER TABLE goal_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own documents
CREATE POLICY "Users can view their own goal documents"
  ON goal_documents FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own documents
CREATE POLICY "Users can insert their own goal documents"
  ON goal_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own documents
CREATE POLICY "Users can update their own goal documents"
  ON goal_documents FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policy: Users can delete their own documents
CREATE POLICY "Users can delete their own goal documents"
  ON goal_documents FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- DONE!
-- ============================================
