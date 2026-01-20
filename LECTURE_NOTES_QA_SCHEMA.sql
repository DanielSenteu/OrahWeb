CREATE TABLE lecture_notes_qa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id UUID NOT NULL REFERENCES lecture_notes(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_lecture_notes_qa_user_id ON lecture_notes_qa(user_id);
CREATE INDEX idx_lecture_notes_qa_note_id ON lecture_notes_qa(note_id);

ALTER TABLE lecture_notes_qa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own lecture note Q&A"
  ON lecture_notes_qa FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own lecture note Q&A"
  ON lecture_notes_qa FOR INSERT
  WITH CHECK (auth.uid() = user_id);
