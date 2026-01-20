# Supabase Edge Function Update Guide

## Update the `create_goal_plan` Edge Function for Academic Types

Your existing edge function needs to be updated to handle academic-specific goal planning. Here's what needs to be added:

### 1. Update Request Interface

Add these fields to your request body interface:

```typescript
interface RequestBody {
  messages: Array<{ role: string; content: string }>
  userId: string
  timezone?: string
  goalId?: string
  isIncremental?: boolean
  // NEW FIELDS:
  academicType?: 'semester' | 'assignment' | 'exam'
  syllabusContent?: string
  assignmentContent?: string
  examContent?: string
  metadata?: {
    dueDate?: string
    examDate?: string
    currentLevel?: string
    courseName?: string
  }
}
```

### 2. Update System Prompt Based on Academic Type

Replace or enhance your existing system prompt with academic-specific prompts:

```typescript
function getSystemPrompt(academicType?: string, content?: any) {
  if (academicType === 'semester') {
    return `You are an expert academic planner creating a semester-long study plan.

Syllabus information:
${content.syllabusContent || ''}

Create a comprehensive semester plan with:
- Daily study tasks broken down by course
- Important deadlines marked clearly
- Progressive learning schedule (easier concepts first, building to harder ones)
- Review sessions before exams
- Buffer time for assignments and projects

CRITICAL:
- Mark all exam dates, assignment due dates, and project deadlines
- Space out studying to avoid cramming
- Include regular review sessions
- Balance workload across the semester
- Plan ahead for busy weeks

Return tasks in the standard format with proper day_number, scheduled_for dates, and clear deliverables.`
  }

  if (academicType === 'assignment') {
    return `You are an expert assignment completion coach.

Assignment details:
${content.assignmentContent || ''}
Due date: ${content.metadata?.dueDate || 'Not specified'}

Create a phase-based plan:
1. Research & Information Gathering (20-25% of time)
2. Planning & Outline (15% of time)
3. First Draft (30% of time)
4. Revision & Refinement (20% of time)
5. Final Review & Polish (10-15% of time)

Each phase should have:
- Clear deliverables
- Specific checkpoints
- Realistic time allocations
- Buffer time for unexpected issues

Return tasks that lead to assignment completion by the due date.`
  }

  if (academicType === 'exam') {
    return `You are an expert study schedule optimizer using spaced repetition principles.

Exam information:
${content.examContent || ''}
Exam date: ${content.metadata?.examDate || 'Not specified'}
Student's current level: ${content.metadata?.currentLevel || 'Not specified'}

Create an optimized study plan:
- Early phase (first 40%): Concept learning, understanding fundamentals
- Middle phase (next 40%): Active practice, problem-solving, application
- Final phase (last 20%): Review, mock exams, confidence building

Use spaced repetition:
- Review concepts multiple times with increasing intervals
- More practice problems in the middle period
- Mock exams 3-5 days before the actual exam
- Light review on exam eve (no cramming)

Return daily study tasks that prepare the student thoroughly for the exam date.`
  }

  // Fall back to your existing general goal prompt
  return `Your existing system prompt for general goals...`
}
```

### 3. Update the OpenAI Call

Pass the appropriate prompt based on academic type:

```typescript
const { 
  messages, 
  userId, 
  timezone, 
  academicType, 
  syllabusContent, 
  assignmentContent, 
  examContent, 
  metadata 
} = await req.json()

const systemPrompt = getSystemPrompt(academicType, {
  syllabusContent,
  assignmentContent,
  examContent,
  metadata
})

const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ],
  // ... rest of your configuration
})
```

### 4. Update Goal Summary

When creating the goal record, include academic type information:

```typescript
const goalSummary = academicType 
  ? `${academicType.charAt(0).toUpperCase() + academicType.slice(1)}: ${
      summaryFromConversation // extracted from the plan
    }`
  : summaryFromConversation

// Then use goalSummary when inserting into user_goals table
```

### 5. Important Notes for Academic Plans

**For Semester Plans:**
- Use the syllabus to extract all hard dates
- Create tasks that lead up to each deadline
- Include regular review sessions
- Balance workload across multiple courses

**For Assignment Plans:**
- Calculate days until due date
- Allocate time proportionally to phases
- Include checkpoint tasks for progress tracking
- Add buffer time before the due date

**For Exam Plans:**
- Calculate days until exam
- Apply spaced repetition (review concepts multiple times)
- Schedule practice problems throughout
- Include mock exams before the real exam
- Avoid heavy studying the night before

### 6. Testing

After updating, test with:

1. **Semester plan**: Upload a sample syllabus
2. **Assignment plan**: Upload assignment with a due date
3. **Exam plan**: Enter exam topics with an exam date

Verify that:
- Tasks are created with proper dates
- Important deadlines are respected
- Task distribution makes sense for the timeframe
- Deliverables and checkpoints are clear

### 7. Deploy

After making these changes:

```bash
# In your Supabase project
supabase functions deploy create_goal_plan
```

---

## Summary of Changes

✅ Add academic type fields to request interface
✅ Create academic-specific system prompts
✅ Update OpenAI call to use appropriate prompt
✅ Ensure dates and deadlines are properly extracted
✅ Apply academic-specific planning principles (spaced repetition, phases, etc.)
✅ Test all three academic types

The edge function will now intelligently handle both general goals and academic-specific goal types!



