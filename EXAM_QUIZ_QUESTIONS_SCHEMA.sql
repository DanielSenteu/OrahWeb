-- Exam Quiz Questions - Run this in Supabase SQL Editor
-- Creates exam_quiz_questions table (correct spelling) with RLS

CREATE TABLE IF NOT EXISTS exam_quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES course_exams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_answer_id TEXT NOT NULL,
  explanation TEXT NOT NULL,
  incorrect_explanation TEXT,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')) DEFAULT 'medium',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_quiz_questions_exam_id ON exam_quiz_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_quiz_questions_topic ON exam_quiz_questions(exam_id, topic);
CREATE INDEX IF NOT EXISTS idx_exam_quiz_questions_user ON exam_quiz_questions(user_id);

ALTER TABLE exam_quiz_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own quiz questions" ON exam_quiz_questions;
CREATE POLICY "Users can view their own quiz questions"
  ON exam_quiz_questions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own quiz questions" ON exam_quiz_questions;
CREATE POLICY "Users can insert their own quiz questions"
  ON exam_quiz_questions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own quiz questions" ON exam_quiz_questions;
CREATE POLICY "Users can update their own quiz questions"
  ON exam_quiz_questions FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own quiz questions" ON exam_quiz_questions;
CREATE POLICY "Users can delete their own quiz questions"
  ON exam_quiz_questions FOR DELETE
  USING (auth.uid() = user_id);
