# Exam Helper Redesign — Recommendations & Plan

## Summary of Your Vision

1. **Exams tab** → See all exams, click "Create Plan" for any exam
2. **Chat flow** → Same as now: talk to agent, provide info, upload documents
3. **Daily plan** → Plan broken into **days until deadline** (Day 1, Day 2, … Day N)
4. **Per day** → When you click/expand a day: **notes** (from your documents) + **quiz** for that day
5. **Every day** until the exam has this structure: topics to study + notes + quiz

---

## Current Issues (Root Cause Analysis)

### 1. **Schema Bug: Quiz Questions Table Typo**
- **File:** `EXAM_HELPER_SCHEMA.sql` line 18
- **Problem:** Table is created as `exam_quiz_uestions` (typo) but code uses `exam_quiz_questions`
- **Impact:** Quiz questions cannot be saved. Generate-quiz API catches the error and returns temp IDs, so the quiz can still run in-session, but questions are never persisted.
- **Fix:** Create the correct table:
  ```sql
  -- If you have the typo table, rename or recreate:
  CREATE TABLE IF NOT EXISTS exam_quiz_questions (...);
  ```

### 2. **No Day-by-Day UI**
- **Current:** Tasks live in `task_items` with `day_number` and `scheduled_date_key`, but the UI does not group them by day.
- **Course dashboard Overview:** Shows `course_semester_plan` tasks (semester plans), not exam-plan tasks.
- **Result:** Exam tasks appear as a flat list (e.g. in Goals), not as “Day 1”, “Day 2”, etc.

### 3. **Notes & Quiz Flow Fragility**
- **Notes:** Task work page fetches `exam_documents`, filters by topic, and calls `/api/exam/prepare-topic-notes` and `/api/exam/generate-notes`.
- **Potential failures:**
  - `examId` missing on goal → no documents loaded
  - Topic mismatch (e.g. task title "Chapter 1" vs extracted topics) → wrong or empty docs
  - Documents with `topics: []` or null → all docs match, but `extracted_text` could be empty if edge function had issues
- **Quiz:** Generated when user visits `/exam/quiz/[examId]/[topic]`. If notes are empty, quiz page shows alert and goes back.

### 4. **Duplicate Document Inserts**
- Both the **edge function** and the **exam-plan API route** insert into `exam_documents`.
- Edge function: full `originalText`, `extractedTopics` per doc.
- API route: `doc.text`, `topics: []`.
- Risk: Duplicates or inconsistent data. Only one path should insert.

### 5. **Entry Point Confusion**
- "Create Study Plan" → `/exam-prep?examId=X&courseId=Y` → correct.
- "Start Studying" → `/tasks/[firstTaskId]/work` → goes to one task, not a day overview.
- Missing: A dedicated **exam study dashboard** showing days and per-day content (notes + quiz).

---

## Recommended Architecture

### Option A: Day-Centric Exam Study Dashboard (Recommended)

Introduce a dedicated **exam study page** that shows the full plan by day.

**Flow:**
1. Exams tab → "Start Studying" or "Create Plan"
2. If plan exists → **Exam Study Dashboard** (`/courses/[id]/exams/[examId]/study`)
3. Dashboard shows:
   - **Day 1** (e.g. Mon Jan 15): Topics X, Y → [View Notes] [Take Quiz]
   - **Day 2** (Tue Jan 16): Topic Z → [View Notes] [Take Quiz]
   - …
4. "View Notes" → expand inline or open a modal with notes for that day’s topics.
5. "Take Quiz" → one quiz per day covering all topics for that day.

**Data:**
- Reuse `task_items` with `day_number` and `scheduled_date_key`.
- Group tasks by `scheduled_date_key` or `day_number`.
- Notes: on demand per day, from `exam_documents` filtered by that day’s topics.
- Quiz: one quiz per day, with questions from all that day’s topics.

### Option B: Keep Task Work Page, Add Day Grouping

- Keep current "Work on Task" flow.
- Add a **day-based view** in the course dashboard (or goals) that groups exam tasks by day.
- Each day card: topics, links to "Work on Task" for each task, and a "Day Quiz" covering all topics for that day.

### Option C: Separate Notes/Quiz Edge Function

- **Plan edge function:** Creates tasks only (no document summarization).
- **Separate API/edge function:** Runs when user opens a day or task:
  - Takes `examId`, `topics[]` (for that day)
  - Produces notes from `exam_documents`
  - Produces quiz questions and saves to `exam_quiz_questions`
- **Pros:** Clear split, better scaling.
- **Cons:** Extra latency when opening a day; more moving parts.
- **Recommendation:** Not required initially. Current on-demand APIs are sufficient if they work reliably.

---

## Recommended Implementation Plan

### Phase 1: Fix Blockers (Quick Wins)
1. **Fix schema:** Ensure `exam_quiz_questions` exists (fix typo if needed).
2. **Remove duplicate document inserts:** Let only the edge function insert into `exam_documents`; remove the insert from the exam-plan API route.
3. **Verify data flow:** Confirm `examId` is set on `user_goals` and that documents have correct `exam_id` and `extracted_text`.

### Phase 2: Day-Centric Exam Dashboard
1. Create `/courses/[courseId]/exams/[examId]/study` (or `/exam/[examId]/study`).
2. Load exam, goal, and tasks for that exam.
3. Group tasks by `day_number` / `scheduled_date_key`.
4. UI: day cards with topics, "View Notes", "Take Quiz".
5. Notes: on-demand via `/api/exam/prepare-topic-notes` + `/api/exam/generate-notes` for that day’s topics.
6. Quiz: extend `/api/exam/generate-quiz` to accept multiple topics (or a `dayNumber`) and generate a combined quiz.

### Phase 3: UI and UX
1. Show notes in an expandable card or modal.
2. One "Day Quiz" per day.
3. Back links to course dashboard and exam tab.
4. Show progress (e.g. days completed, quizzes taken).

### Phase 4: Optional Enhancements
- Pre-generate notes when the plan is created (background job).
- Pre-generate quiz questions per topic when the plan is created (or on first "Take Quiz").
- Store per-day notes in DB to avoid re-generation.

---

## Clarifying Questions

1. **Where should "Start Studying" go?**
   - Directly to the first task’s work page, or
   - To a new exam study dashboard that lists days and per-day content?

2. **Quiz per day vs per topic**
   - One quiz per **day** (combines all topics for that day), or
   - One quiz per **topic** (multiple quizzes per day if there are multiple topics)?
   - Preferred: one quiz per day for simpler UX.

3. **Do you already have exams from syllabus extraction with no documents?**
   - If yes, we need a path: "Create Plan" → upload documents → plan creation, and ensure `examId` is preserved.

4. **Schema**
   - Has `EXAM_HELPER_SCHEMA.sql` been applied? Is the table currently `exam_quiz_uestions` or `exam_quiz_questions`?
   - If the typo exists, we should add a migration to fix it.

5. **Edge function vs API**
   - Are you open to a separate edge function for notes/quiz, or do you want to fix the current on-demand API flow first?
   - Recommendation: fix current flow first; add a separate function only if we hit limits.

---

## Next Steps

1. Confirm which option (A, B, or C) you prefer.
2. Answer the clarifying questions above.
3. Fix the schema and duplicate insert issues.
4. Implement the day-centric exam study dashboard and flows.
