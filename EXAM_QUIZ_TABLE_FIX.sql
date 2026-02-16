-- Fix: EXAM_HELPER_SCHEMA has typo "exam_quiz_uestions"
-- If your table was created with the typo, run this to rename it.
-- If exam_quiz_questions already exists, skip this.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'exam_quiz_uestions')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'exam_quiz_questions') THEN
    ALTER TABLE exam_quiz_uestions RENAME TO exam_quiz_questions;
  END IF;
END $$;
