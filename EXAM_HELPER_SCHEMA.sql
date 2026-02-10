-- Exam Helper Enhanced Schema

-- Exam documents (notes uploaded for exam prep)
CREATE TABLE IF NOT EXISTS exam_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES course_exams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL,
  document_type TEXT CHECK (document_type IN ('pdf', 'text', 'image')),
  file_url TEXT, -- Supabase Storage path
  extracted_text TEXT, -- Extracted text content
  topics TEXT[], -- Topics covered in this document
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quiz questions for exam topics
CREATE TABLE IF NOT EXISTS exam_quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES course_exams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL, -- Topic this question belongs to
  question_text TEXT NOT NULL,
  options JSONB NOT NULL, -- Array of answer options: [{"id": "A", "text": "Option A"}, ...]
  correct_answer_id TEXT NOT NULL, -- ID of the correct answer (e.g., "A", "B", "C", "D")
  explanation TEXT NOT NULL, -- Explanation for why the answer is correct
  incorrect_explanation TEXT, -- Explanation shown when answer is wrong
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')) DEFAULT 'medium',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quiz attempts and results
CREATE TABLE IF NOT EXISTS exam_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES course_exams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL, -- Topic this quiz is for
  questions_answered JSONB NOT NULL, -- Array of: [{"question_id": "...", "selected_answer": "A", "is_correct": true}, ...]
  score_percentage INTEGER NOT NULL CHECK (score_percentage >= 0 AND score_percentage <= 100),
  total_questions INTEGER NOT NULL,
  correct_answers INTEGER NOT NULL,
  incorrect_answers INTEGER NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_exam_documents_exam_id ON exam_documents(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_documents_user_id ON exam_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_quiz_questions_exam_id ON exam_quiz_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_quiz_questions_topic ON exam_quiz_questions(exam_id, topic);
CREATE INDEX IF NOT EXISTS idx_exam_quiz_attempts_exam_id ON exam_quiz_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_quiz_attempts_user_id ON exam_quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_quiz_attempts_topic ON exam_quiz_attempts(exam_id, topic);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_exam_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_exam_quiz_questions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trigger_update_exam_documents_updated_at ON exam_documents;
CREATE TRIGGER trigger_update_exam_documents_updated_at
  BEFORE UPDATE ON exam_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_exam_documents_updated_at();

DROP TRIGGER IF EXISTS trigger_update_exam_quiz_questions_updated_at ON exam_quiz_questions;
CREATE TRIGGER trigger_update_exam_quiz_questions_updated_at
  BEFORE UPDATE ON exam_quiz_questions
  FOR EACH ROW
  EXECUTE FUNCTION update_exam_quiz_questions_updated_at();

-- RLS Policies
ALTER TABLE exam_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_quiz_attempts ENABLE ROW LEVEL SECURITY;

-- Users can only access their own exam documents
CREATE POLICY "Users can view their own exam documents"
  ON exam_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own exam documents"
  ON exam_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own exam documents"
  ON exam_documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own exam documents"
  ON exam_documents FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only access their own quiz questions
CREATE POLICY "Users can view their own quiz questions"
  ON exam_quiz_questions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own quiz questions"
  ON exam_quiz_questions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own quiz questions"
  ON exam_quiz_questions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own quiz questions"
  ON exam_quiz_questions FOR DELETE
  USING (auth.uid() = user_id);

-- Users can only access their own quiz attempts
CREATE POLICY "Users can view their own quiz attempts"
  ON exam_quiz_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own quiz attempts"
  ON exam_quiz_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own quiz attempts"
  ON exam_quiz_attempts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own quiz attempts"
  ON exam_quiz_attempts FOR DELETE
  USING (auth.uid() = user_id);
