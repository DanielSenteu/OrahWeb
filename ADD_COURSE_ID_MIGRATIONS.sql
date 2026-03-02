-- ============================================
-- Add course_id to lecture_notes and user_goals
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Add course_id to lecture_notes (links recordings to a course)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lecture_notes' AND column_name = 'course_id'
  ) THEN
    ALTER TABLE lecture_notes
      ADD COLUMN course_id UUID REFERENCES courses(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lecture_notes_course_id ON lecture_notes(course_id);

-- 2. Add course_id to user_goals (links assignment/exam plans to a course)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_goals' AND column_name = 'course_id'
  ) THEN
    ALTER TABLE user_goals
      ADD COLUMN course_id UUID REFERENCES courses(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_goals_course_id ON user_goals(course_id);

-- ============================================
-- DONE!
-- After running this:
-- 1. New lecture recordings will be linked to the course they were started from
-- 2. Assignment and exam plans will be linked to the course they were created from
-- 3. Existing records will have NULL course_id (no data loss)
-- ============================================
