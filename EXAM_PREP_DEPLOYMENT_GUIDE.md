# Exam Prep Edge Function - Deployment Guide

## File Location
The complete edge function code is in: `EXAM_PREP_EDGE_FUNCTION_COMPLETE.ts`

## Deployment Steps

### Option 1: Supabase Dashboard (Recommended)

1. **Go to Supabase Dashboard**
   - Navigate to your project: https://supabase.com/dashboard
   - Go to **Edge Functions** in the left sidebar

2. **Create/Update Function**
   - If `exam_prep` function doesn't exist, click **"Create a new function"**
   - If it exists, click on it to edit
   - Function name: `exam_prep`

3. **Copy Code**
   - Open `EXAM_PREP_EDGE_FUNCTION_COMPLETE.ts`
   - Copy ALL the code (Ctrl+A, Ctrl+C)

4. **Paste in Supabase Editor**
   - Delete all existing code in the Supabase editor
   - Paste the new code
   - Click **"Deploy"** or **"Save"**

5. **Set Environment Variables** (if not already set)
   - Go to **Project Settings** → **Edge Functions** → **Secrets**
   - Ensure `OPENAI_API_KEY` is set
   - Ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are available (usually auto-set)

### Option 2: Supabase CLI

1. **Copy the file**
   ```bash
   cp EXAM_PREP_EDGE_FUNCTION_COMPLETE.ts supabase/functions/exam_prep/index.ts
   ```

2. **Deploy**
   ```bash
   supabase functions deploy exam_prep
   ```

## What's New in This Version

### ✅ Document Support
- Accepts `documents` array in request body
- Combines all document texts with study materials
- Saves documents to `exam_documents` table

### ✅ Topic Extraction
- Automatically extracts topics from combined notes using GPT-4o-mini
- Stores topics in `course_exams.topics` array (if `examId` provided)
- Uses topics in task creation

### ✅ Deadline-Aware Planning
- If ≤ 7 days: Creates multiple tasks per day to cover all chapters
- If > 7 days: Uses spaced repetition
- Ensures ALL chapters are covered regardless of time

### ✅ Topic-Based Tasks
- Task titles reference specific topics from documents
- Task descriptions include references to relevant documents
- Tasks are linked to topics for quiz generation

### ✅ Enhanced Task Notes
- Includes which documents cover each topic
- References specific uploaded notes
- Better context for users

## Testing

After deployment, test with:

```json
{
  "userId": "your-user-id",
  "courseName": "CMPT 310",
  "totalChapters": 5,
  "weakChapters": "Chapters 3, 5",
  "weakTopics": "Recursion, Graph algorithms",
  "hoursPerDay": 2,
  "examDate": "2024-12-15",
  "studyMaterials": "Your study notes here...",
  "documents": [
    {
      "name": "lecture-notes.pdf",
      "type": "application/pdf",
      "text": "Extracted text from PDF..."
    }
  ],
  "examId": "optional-exam-id",
  "timezone": "America/New_York"
}
```

## Expected Response

```json
{
  "success": true,
  "goalId": "uuid",
  "examId": "uuid-or-null",
  "topics": ["Topic 1", "Topic 2", ...],
  "tasksCreated": 10,
  "checkpointsCreated": 40,
  "daysUntilExam": 14
}
```

## Troubleshooting

1. **"Unauthorized" error**: Check that Authorization header is being sent
2. **"Missing required fields"**: Ensure all required fields are in request body
3. **Topic extraction fails**: Function will continue without topics (non-fatal)
4. **Document save fails**: Function will continue (non-fatal, logs warning)

## Notes

- The function is backward compatible (works without documents)
- Topic extraction is optional (continues if it fails)
- Documents are saved to `exam_documents` table if `examId` is provided
- Topics are stored in `course_exams.topics` if `examId` is provided
