# Exam Helper Enhanced Implementation

## Overview
The exam helper is being upgraded to:
1. Accept up to 10 documents (notes, PDFs, text)
2. Create topic-based study plans from all documents
3. Generate quiz questions (10 per topic) with explanations
4. Show quiz interface with flip cards for questions/answers
5. Track quiz results and scores

## Database Schema
✅ Created `EXAM_HELPER_SCHEMA.sql` with:
- `exam_documents` - stores uploaded notes/documents
- `exam_quiz_questions` - stores quiz questions per topic
- `exam_quiz_attempts` - tracks user quiz results

## Implementation Steps

### 1. Exam Helper Page (`app/exam-prep/page.tsx`)
- Update to accept up to 10 document uploads
- New flow: Upload documents → Enter exam date → Create plan
- Documents stored in `exam_documents` table
- All document text combined and sent to edge function

### 2. Edge Function Updates
- Process all documents together
- Extract topics from combined notes
- Create deadline-aware study plan (if exam in 1 week, cover everything in that week)
- Break down tasks by topic with references to specific notes

### 3. Quiz Component (`components/exam/QuizCard.tsx`)
- Flip card UI (question on front, answer/explanation on back)
- Multiple choice with 4 options
- Show explanation when answer selected
- Next button to proceed
- Progress indicator (question X of 10)

### 4. Quiz Results Component (`components/exam/QuizResults.tsx`)
- Display final score as percentage
- Show correct/incorrect breakdown
- Option to retake quiz

### 5. Task Work Page for Exams (`app/tasks/[id]/work/page.tsx`)
- Detect if task is for exam
- Show topic notes (from documents)
- Show "Start Quiz" button
- Load quiz questions for that topic
- Display quiz interface

### 6. API Routes
- `/api/exam/generate-quiz` - Generate 10 questions for a topic
- `/api/exam/save-attempt` - Save quiz results

## Next Steps
1. Update exam-prep page with document upload
2. Create quiz components
3. Update task work page
4. Create API routes
5. Update edge function (document separately)
