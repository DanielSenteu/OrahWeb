-- ============================================
-- USER_GOALS: Add exam-related columns
-- Run this in your Supabase SQL Editor
-- Fixes: 400 Bad Request on user_goals?select=goal_type,exam_id
-- ============================================

-- Add goal_type if not exists (semester | assignment | exam | custom)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_goals' AND column_name = 'goal_type'
  ) THEN
    ALTER TABLE user_goals ADD COLUMN goal_type TEXT;
  END IF;
END $$;

-- Add exam_id if not exists (links to course_exams)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_goals' AND column_name = 'exam_id'
  ) THEN
    ALTER TABLE user_goals ADD COLUMN exam_id UUID REFERENCES course_exams(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Optional: index for common lookup
CREATE INDEX IF NOT EXISTS idx_user_goals_goal_type ON user_goals(goal_type);
CREATE INDEX IF NOT EXISTS idx_user_goals_exam_id ON user_goals(exam_id);

-- ============================================
-- DONE!
-- ============================================
