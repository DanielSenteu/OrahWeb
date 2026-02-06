-- ============================================
-- LONG LECTURE PROCESSING SCHEMA
-- Supports chunked audio/transcript processing
-- ============================================

-- Processing jobs table (for async processing)
CREATE TABLE IF NOT EXISTS lecture_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES lecture_notes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'transcribing', 'chunking_transcript', 'generating_notes', 'merging', 'completed', 'failed')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  total_chunks INTEGER DEFAULT 1,
  completed_chunks INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Audio chunks table (for tracking audio chunk processing)
CREATE TABLE IF NOT EXISTS lecture_audio_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES lecture_processing_jobs(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  audio_url TEXT NOT NULL, -- Storage path for this chunk
  transcript TEXT,
  transcript_tokens INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'transcribing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, chunk_index)
);

-- Transcript chunks table (for tracking transcript chunk processing)
CREATE TABLE IF NOT EXISTS lecture_transcript_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES lecture_processing_jobs(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  transcript_text TEXT NOT NULL,
  notes_json JSONB, -- Generated notes for this chunk
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(job_id, chunk_index)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_processing_jobs_note_id ON lecture_processing_jobs(note_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_id ON lecture_processing_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON lecture_processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_audio_chunks_job_id ON lecture_audio_chunks(job_id);
CREATE INDEX IF NOT EXISTS idx_transcript_chunks_job_id ON lecture_transcript_chunks(job_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_processing_jobs_updated_at
  BEFORE UPDATE ON lecture_processing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_audio_chunks_updated_at
  BEFORE UPDATE ON lecture_audio_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transcript_chunks_updated_at
  BEFORE UPDATE ON lecture_transcript_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- DONE!
-- ============================================
