# Edge Function Update for Enhanced Exam Helper

## Overview
The exam prep edge function needs to be updated to:
1. Accept and process up to 10 documents
2. Extract topics from all documents
3. Create deadline-aware study plans (if exam in 1 week, cover everything in that week)
4. Break down tasks by topic with references to specific notes

## Current Edge Function
- **Location**: `supabase/functions/exam_prep/index.ts` (or similar)
- **Current behavior**: Creates study plan based on chapters, weak topics, hours per day

## Required Updates

### 1. Request Body Interface
Add `documents` array:
```typescript
interface RequestBody {
  userId: string
  courseName: string
  totalChapters: number
  weakChapters?: string
  weakTopics?: string
  hoursPerDay: number
  examDate: string
  studyMaterials: string
  documents?: Array<{
    name: string
    type: string
    text: string
  }>
  timezone?: string
}
```

### 2. Topic Extraction
Before creating the plan:
1. Combine all document texts with `studyMaterials`
2. Use GPT to extract all topics from combined notes
3. Store topics in `course_exams.topics` array (if examId is provided)

### 3. Deadline-Aware Planning
Calculate days until exam:
```typescript
const examDateObj = new Date(examDate)
const today = new Date()
const daysUntilExam = Math.ceil((examDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
```

If `daysUntilExam <= 7`:
- Create intensive plan covering ALL topics
- Some days may have multiple topics
- Prioritize weak topics but ensure everything is covered

If `daysUntilExam > 7`:
- Spread topics across available days
- Include review sessions
- Progressive difficulty

### 4. Topic-Based Task Creation
Instead of "Study Topic 1", create tasks like:
- "Study [Topic Name]" with notes from documents
- Reference specific documents in task notes
- Group related topics together when possible

### 5. Task Notes Enhancement
Include in task notes:
- Which documents cover this topic
- Key points from those documents
- Related topics to review together

## Example Task Structure
```typescript
{
  title: "Study Recursion",
  notes: "From your uploaded notes:\n\n[Key points from documents about recursion]\n\nRelated topics: Recursive algorithms, Base cases",
  estimated_minutes: 60,
  deliverable: "Understand recursion concepts and be able to solve recursive problems",
  // ... other fields
}
```

## Implementation Notes
- The edge function should call OpenAI to extract topics from combined notes
- Topics should be stored in `course_exams.topics` array
- Tasks should be linked to topics (can use task title or notes field)
- Ensure all topics are covered within the exam deadline
