-- Exam Topic Notes - Cache for generated study notes per (exam, topic)
-- Improves reliability: notes are generated once, then served from DB

CREATE TABLE IF NOT EXISTS exam_topic_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES course_exams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  prepared_notes TEXT NOT NULL,  -- Raw/summarized text from documents (for quiz generation)
  structured_notes JSONB NOT NULL,  -- AI-generated structured notes (title, sections, definitions, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT exam_topic_notes_unique UNIQUE(exam_id, user_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_exam_topic_notes_exam_id ON exam_topic_notes(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_topic_notes_lookup ON exam_topic_notes(exam_id, user_id, topic);

ALTER TABLE exam_topic_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own exam topic notes"
  ON exam_topic_notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own exam topic notes"
  ON exam_topic_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own exam topic notes"
  ON exam_topic_notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own exam topic notes"
  ON exam_topic_notes FOR DELETE
  USING (auth.uid() = user_id);
