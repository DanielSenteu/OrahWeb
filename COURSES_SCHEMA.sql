-- ============================================
-- COURSES SCHEMA - Phase 1
-- Core structure for course-centric Orah
-- ============================================

-- Main courses table
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_name TEXT NOT NULL,
  professor_name TEXT,
  semester TEXT, -- e.g., "Fall 2024", "Spring 2025"
  year INTEGER, -- e.g., 2024, 2025
  syllabus_data JSONB DEFAULT '{}'::jsonb, -- Extracted syllabus content, dates, etc.
  syllabus_text TEXT, -- Raw syllabus text if uploaded
  syllabus_file_url TEXT, -- URL to uploaded syllabus PDF/image
  color TEXT DEFAULT '#06B6D4', -- Course color for UI (default cyan)
  icon TEXT, -- Optional emoji or icon identifier
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT courses_user_course_unique UNIQUE(user_id, course_name, semester, year)
);

-- Course semester plans (1:1 with course, from semester tracking feature)
CREATE TABLE IF NOT EXISTS course_semester_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  semester_start_date DATE,
  semester_end_date DATE,
  study_hours_per_day INTEGER DEFAULT 2,
  preferred_study_times TEXT[], -- Array of preferred times, e.g., ["morning", "evening"]
  plan_data JSONB DEFAULT '{}'::jsonb, -- Full semester plan with daily tasks
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One plan per course
  CONSTRAINT course_semester_plan_unique UNIQUE(course_id)
);

-- Course lectures (from lecture notes feature)
CREATE TABLE IF NOT EXISTS course_lectures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_number INTEGER, -- Calculated from semester start
  lecture_date DATE,
  lecture_time TIME, -- Optional time of lecture
  title TEXT,
  audio_url TEXT, -- Supabase Storage path
  transcript TEXT, -- Original transcript
  generated_notes JSONB, -- Structured notes from AI
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Course assignments (from assignment helper feature)
CREATE TABLE IF NOT EXISTS course_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_name TEXT NOT NULL,
  description TEXT,
  pdf_urls TEXT[], -- Array of PDF Storage paths
  due_date DATE NOT NULL,
  days_to_complete INTEGER DEFAULT 7, -- Days allocated for completion
  step_by_step_plan JSONB, -- Generated plan from assignment helper
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'submitted')),
  progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Course exams (from exam prep feature)
CREATE TABLE IF NOT EXISTS course_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_name TEXT NOT NULL,
  exam_date DATE NOT NULL,
  exam_time TIME, -- Optional time of exam
  topics TEXT[], -- Array of topics to study
  current_level TEXT CHECK (current_level IN ('beginner', 'intermediate', 'advanced')),
  study_plan JSONB, -- Generated study plan from exam prep
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'studying', 'reviewing', 'completed')),
  progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Course study groups (for collaboration)
CREATE TABLE IF NOT EXISTS course_study_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_name TEXT NOT NULL,
  invite_code TEXT UNIQUE, -- Unique code for joining
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Study group members
CREATE TABLE IF NOT EXISTS study_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES course_study_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One membership per user per group
  CONSTRAINT study_group_member_unique UNIQUE(group_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_courses_user_id ON courses(user_id);
CREATE INDEX IF NOT EXISTS idx_courses_semester_year ON courses(semester, year);
CREATE INDEX IF NOT EXISTS idx_course_lectures_course_id ON course_lectures(course_id);
CREATE INDEX IF NOT EXISTS idx_course_lectures_week ON course_lectures(course_id, week_number);
CREATE INDEX IF NOT EXISTS idx_course_assignments_course_id ON course_assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_course_assignments_due_date ON course_assignments(due_date);
CREATE INDEX IF NOT EXISTS idx_course_exams_course_id ON course_exams(course_id);
CREATE INDEX IF NOT EXISTS idx_course_exams_exam_date ON course_exams(exam_date);
CREATE INDEX IF NOT EXISTS idx_course_semester_plans_course_id ON course_semester_plans(course_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_courses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION update_courses_updated_at();

CREATE TRIGGER update_course_semester_plans_updated_at
  BEFORE UPDATE ON course_semester_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_course_lectures_updated_at
  BEFORE UPDATE ON course_lectures
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_course_assignments_updated_at
  BEFORE UPDATE ON course_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_course_exams_updated_at
  BEFORE UPDATE ON course_exams
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_semester_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_lectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_study_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_group_members ENABLE ROW LEVEL SECURITY;

-- Users can only see their own courses
CREATE POLICY "Users can view their own courses"
  ON courses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own courses"
  ON courses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own courses"
  ON courses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own courses"
  ON courses FOR DELETE
  USING (auth.uid() = user_id);

-- Similar policies for other tables
CREATE POLICY "Users can manage their own semester plans"
  ON course_semester_plans FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own lectures"
  ON course_lectures FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own assignments"
  ON course_assignments FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own exams"
  ON course_exams FOR ALL
  USING (auth.uid() = user_id);

-- Study groups: users can see groups they're members of
CREATE POLICY "Users can view groups they're in"
  ON course_study_groups FOR SELECT
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM study_group_members
      WHERE group_id = course_study_groups.id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create study groups"
  ON course_study_groups FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Study group members policies
CREATE POLICY "Users can view members of their groups"
  ON study_group_members FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM course_study_groups
      WHERE id = study_group_members.group_id
      AND created_by = auth.uid()
    )
  );

-- ============================================
-- DONE!
-- ============================================
-- Next steps:
-- 1. Run this migration in Supabase SQL Editor
-- 2. Verify tables are created
-- 3. Test RLS policies
-- ============================================
