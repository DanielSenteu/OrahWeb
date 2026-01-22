// Edge Function: create_goal_plan
// Handles goal creation and task generation via OpenAI
// NOW SUPPORTS: Academic semester plans, assignments, and exam prep
// Saves everything to Supabase first, then returns to app

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || ""
const OPENAI_URL = "https://api.openai.com/v1/chat/completions"

interface RequestBody {
  messages: Array<{
    role: "user" | "assistant"
    content: string
  }>
  userId: string
  conversationData?: Record<string, any>
  isIncremental?: boolean
  goalId?: string
  timezone?: string
  // NEW ACADEMIC FIELDS:
  academicType?: 'semester' | 'assignment' | 'exam'
  syllabusContent?: string
  assignmentContent?: string
  examContent?: string
  metadata?: {
    dueDate?: string
    examDate?: string
    currentLevel?: string
    courseName?: string
    courseCode?: string
    importantDates?: Array<{ date: string; event: string }>
    normalizedDates?: Array<{ line: string; date: string; timezone: string }>
    strictDates?: boolean
    taskCap?: number
    focusDaysPerWeek?: number
  }
}

interface TaskPlan {
  goalSummary: string
  totalDays: number
  dailyTimeCommitment: number
  goalDomain: string
  subjects: string[]
  dailyTasks: {
    [key: string]: Array<{
      title: string
      description?: string
      estimatedMinutes: number
      deliverable?: string
      metric?: string
      checkpoints?: string[]
    }>
  }
}

// Output-size guards to prevent OpenAI truncation
const MAX_TOTAL_DAYS = 180
const MAX_TASKS_PER_DAY = 3
const MAX_CHECKPOINTS = 3

const getLocalToday = (tz: string) => {
  const now = new Date()
  const local = new Date(now.toLocaleString("en-US", { timeZone: tz }))
  local.setHours(0, 0, 0, 0)
  return local
}

const parseLocalDate = (ymd: string, tz: string) => {
  const [y, m, d] = ymd.split("-").map(Number)
  const utcMidnight = new Date(Date.UTC(y, m - 1, d))
  return new Date(utcMidnight.toLocaleString("en-US", { timeZone: tz }))
}

const daysBetweenInclusive = (start: Date, end: Date) => {
  const oneDay = 24 * 60 * 60 * 1000
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / oneDay) + 1)
}

const getTargetDateFromMetadata = (metadata: any, tz: string) => {
  const normalized = metadata?.normalizedDates || []
  if (!normalized.length) return null

  const parsed = normalized
    .map((d: any) => parseLocalDate(d.date, tz))
    .sort((a: Date, b: Date) => a.getTime() - b.getTime())

  return parsed[parsed.length - 1] || null
}

const formatYmd = (date: Date) => {
  const yyyy = date.getFullYear()
  const mm = `${date.getMonth() + 1}`.padStart(2, "0")
  const dd = `${date.getDate()}`.padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

const extractExplicitDateFromText = (text: string, tz: string) => {
  if (!text) return null
  const now = getLocalToday(tz)
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const monthMap: Record<string, number> = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  }

  const monthPattern =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/i
  const numericPattern = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/

  const monthMatch = text.match(monthPattern)
  if (monthMatch) {
    const monthKey = monthMatch[1].toLowerCase()
    const day = parseInt(monthMatch[2], 10)
    let year = monthMatch[3] ? parseInt(monthMatch[3], 10) : currentYear
    const monthIndex = monthMap[monthKey]
    if (!monthMatch[3] && monthIndex < currentMonth - 1) {
      year += 1
    }
    return formatYmd(new Date(year, monthIndex, day))
  }

  const numericMatch = text.match(numericPattern)
  if (numericMatch) {
    const part1 = parseInt(numericMatch[1], 10)
    const part2 = parseInt(numericMatch[2], 10)
    let month = part1 - 1
    let day = part2
    if (part1 > 12 && part2 <= 12) {
      month = part2 - 1
      day = part1
    }
    let year = numericMatch[3]
      ? parseInt(numericMatch[3].length === 2 ? `20${numericMatch[3]}` : numericMatch[3], 10)
      : currentYear
    if (!numericMatch[3] && month < currentMonth - 1) {
      year += 1
    }
    return formatYmd(new Date(year, month, day))
  }

  return null
}

const extractImportantDatesFromText = (text: string, tz: string) => {
  if (!text) {
    return { normalizedDates: [], importantDates: [] }
  }

  const monthMap: Record<string, number> = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  }

  const now = getLocalToday(tz)
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const normalizedDates: Array<{ line: string; date: string; timezone: string }> = []
  const importantDates: Array<{ date: string; event: string }> = []
  const seen = new Set<string>()

  const monthPattern =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/i
  const numericPattern = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/

  lines.forEach((line) => {
    let match = line.match(monthPattern)
    let date: Date | null = null

    if (match) {
      const monthKey = match[1].toLowerCase()
      const day = parseInt(match[2], 10)
      let year = match[3] ? parseInt(match[3], 10) : currentYear
      const monthIndex = monthMap[monthKey]
      if (!match[3] && monthIndex < currentMonth - 1) {
        year += 1
      }
      date = new Date(year, monthIndex, day)
    } else {
      match = line.match(numericPattern)
      if (match) {
        const part1 = parseInt(match[1], 10)
        const part2 = parseInt(match[2], 10)
        let month = part1 - 1
        let day = part2
        if (part1 > 12 && part2 <= 12) {
          month = part2 - 1
          day = part1
        }
        let year = match[3]
          ? parseInt(match[3].length === 2 ? `20${match[3]}` : match[3], 10)
          : currentYear
        if (!match[3] && month < currentMonth - 1) {
          year += 1
        }
        date = new Date(year, month, day)
      }
    }

    if (date) {
      const dateKey = formatYmd(date)
      const event = line
        .replace(match?.[0] || "", " ")
        .replace(/[-–—:]+/g, " ")
        .replace(/\s+/g, " ")
        .trim() || line

      const dedupeKey = `${dateKey}|${event}`
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey)
        normalizedDates.push({ line, date: dateKey, timezone: tz })
        importantDates.push({ date: dateKey, event })
      }
    }
  })

  return { normalizedDates, importantDates }
}

const normalizeText = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()

const extractEventType = (text: string) => {
  if (/\bmidterm\b/.test(text)) return "midterm"
  if (/\bfinal\b/.test(text)) return "final"
  if (/\bexam\b|\btest\b/.test(text)) return "exam"
  if (/\bquiz\b/.test(text)) return "quiz"
  if (/\bassignment\b|\bhomework\b|\bhw\b/.test(text)) return "assignment"
  if (/\bproject\b|\bpresentation\b/.test(text)) return "project"
  if (/\bdue\b|\bdeadline\b/.test(text)) return "due"
  return null
}

const scoreEventMatch = (haystack: string, eventText: string) => {
  const stopWords = new Set([
    "midterm",
    "final",
    "exam",
    "test",
    "quiz",
    "assignment",
    "homework",
    "project",
    "presentation",
    "due",
    "deadline",
    "week",
    "lecture",
    "class",
    "course",
  ])

  const tokens = normalizeText(eventText)
    .split(" ")
    .filter((token) => token.length > 2 && !stopWords.has(token))

  let score = 0
  tokens.forEach((token) => {
    if (haystack.includes(token)) score += 1
  })
  return score
}

const matchTaskToDate = (
  task: { title: string; description?: string },
  events: Array<{ dateKey: string; event: string }>
) => {
  if (events.length === 0) return null
  const haystack = normalizeText(`${task.title} ${task.description || ""}`)
  const taskType = extractEventType(haystack)
  if (!taskType) return null

  const matching = events.filter((item) => {
    const eventType = extractEventType(normalizeText(item.event))
    return eventType === taskType
  })

  if (matching.length === 1) return matching[0].dateKey
  if (matching.length > 1) {
    let best = matching[0]
    let bestScore = scoreEventMatch(haystack, best.event)
    matching.slice(1).forEach((item) => {
      const score = scoreEventMatch(haystack, item.event)
      if (score > bestScore) {
        best = item
        bestScore = score
      }
    })
    if (bestScore > 0) return best.dateKey
  }

  return null
}

const getStudyWeekdays = (focusDaysPerWeek: number, noWeekends: boolean) => {
  const safeDays = Math.min(Math.max(focusDaysPerWeek, 1), 7)
  const presets: Record<number, number[]> = {
    1: [1], // Mon
    2: [1, 4], // Mon/Thu
    3: [1, 3, 5], // Mon/Wed/Fri
    4: [1, 3, 4, 5], // Mon/Wed/Thu/Fri
    5: [1, 2, 3, 4, 5], // Mon-Fri
    6: [0, 1, 2, 3, 4, 5],
    7: [0, 1, 2, 3, 4, 5, 6],
  }
  const base = presets[safeDays] || presets[3]
  if (!noWeekends) return base
  return base.filter((day) => day !== 0 && day !== 6)
}

const getTotalStudyDays = (startDate: Date, endDate: Date, allowedWeekdays: number[]) => {
  let count = 0
  const cursor = new Date(startDate)
  while (cursor <= endDate) {
    if (allowedWeekdays.includes(cursor.getDay())) {
      count += 1
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return Math.max(count, 1)
}

const getStudyDateByIndex = (startDate: Date, studyIndex: number, allowedWeekdays: number[]) => {
  let count = 0
  const cursor = new Date(startDate)
  while (true) {
    if (allowedWeekdays.includes(cursor.getDay())) {
      count += 1
      if (count === studyIndex) {
        return new Date(cursor)
      }
    }
    cursor.setDate(cursor.getDate() + 1)
  }
}

// NEW: Academic-specific system prompts
function getAcademicSystemPrompt(
  academicType: string, 
  content: {
    syllabusContent?: string
    assignmentContent?: string
    examContent?: string
    metadata?: any
  }
): string {
  
  if (academicType === 'semester') {
    return `You are an ELITE academic semester planner. Your mission: transform a syllabus into a semester-long success roadmap that makes students feel like they have a personal academic coach.

CRITICAL: You MUST respond with ONLY valid JSON. No text before or after. No markdown. No explanations. ONLY the JSON object.

===================================
SYLLABUS INFORMATION
===================================

${content.syllabusContent || 'No syllabus provided - extract from conversation'}

Course: ${content.metadata?.courseName || 'Extract from conversation'}
Course Code: ${content.metadata?.courseCode || 'Extract from conversation'}

Important Dates:
${content.metadata?.importantDates?.map((d: any) => `- ${d.date}: ${d.event}`).join('\n') || 'Extract from syllabus'}

Normalized Dates (authoritative):
${content.metadata?.normalizedDates?.map((d: any) => `- ${d.line} -> ${d.date}`).join('\n') || 'None'}

===================================
YOUR MISSION
===================================

Create a comprehensive semester plan that:

1. **EXTRACTS ALL CRITICAL DATES** from the syllabus
   - Assignment due dates
   - Midterm exam dates
   - Final exam dates
   - Project deadlines
   - Quiz dates
   - Any other important milestones

2. **BREAKS DOWN EACH ASSIGNMENT/EXAM** into phases
   - Start preparation EARLY (not last minute!)
   - For assignments: Research → Plan → Draft → Revise → Polish
   - For exams: Learn → Practice → Review → Mock Test → Confidence Build

3. **SPACES OUT STUDYING** to avoid cramming
   - Review concepts multiple times (spaced repetition)
   - Regular study sessions throughout the week
   - More intense sessions before exams
   - Light review sessions in between

4. **BALANCES WORKLOAD** across the semester
   - Front-load easier topics
   - Build complexity gradually
   - Account for busy weeks (multiple deadlines)
   - Include buffer time for unexpected issues

5. **CREATES PROGRESSIVE LEARNING**
   - Week 1-2: Foundations and setup
   - Week 3-5: Core concept building
   - Week 6-8: Midterm preparation + advanced topics
   - Week 9-11: Complex application + projects
   - Week 12-14: Final exam preparation + synthesis

===================================
TASK GENERATION RULES
===================================

For EACH course/subject:
- Create daily study tasks that build progressively
- Break assignments into 5-7 day preparation windows
- Start exam prep 10-14 days before the exam date
- Include regular review sessions (every 3-4 days)
- Mark important dates clearly in task titles

Task Structure:
- **Title**: Clear and specific (e.g., "CMPT 310: Complete Recursion Practice Set (Midterm Prep)")
- **Description**: Why this task matters, what it builds toward
- **Deliverable**: Concrete outcome (e.g., "5 recursion problems solved with explanations")
- **Metric**: How to measure success
- **Checkpoints**: 3-5 actionable steps (10-15 min each)
- **EstimatedMinutes**: Realistic time allocation

Scheduling Principles:
- Spread work across available days
- Don't cram everything into the day before
- Include "catch-up" days after busy weeks
- Build in review sessions before each exam
- Create milestones every 7-10 days

===================================
JSON STRUCTURE
===================================

Return ONLY this JSON format:

{
  "goalSummary": "Complete [Course Name/Code] with excellence - [brief description]",
  "totalDays": [days from today to semester end],
  "dailyTimeCommitment": [minutes per day - calculate based on workload],
  "goalDomain": "academic",
  "subjects": ["Course 1", "Course 2", ...],
  "dailyTasks": {
    "day1": [
      {
        "title": "Course Setup & Syllabus Deep Dive",
        "description": "Understand the full semester roadmap and set up your success systems",
        "estimatedMinutes": 60,
        "deliverable": "Annotated syllabus with all key dates marked",
        "metric": "All assignments, exams, and deadlines clearly identified",
        "checkpoints": [
          "Read through entire syllabus and highlight all due dates",
          "Create a semester calendar with all important dates",
          "Identify the 3 most challenging topics/assignments",
          "Set up your study materials and organization system"
        ]
      }
    ],
    "day2": [...],
    ...
    "day{totalDays}": [...]
  }
}

CRITICAL REMINDERS:
- Use normalized dates EXACTLY. Do NOT shift due to timezone.
- Create tasks for EVERY DAY from day1 to day{totalDays} - NO GAPS
- Front-load easier concepts, build to harder ones
- Include regular review sessions (spaced repetition)
- Mark exam/assignment dates clearly
- Balance workload - don't overload any single day
- Make every task purposeful and connected to a deadline

Generate the complete semester plan now. Return ONLY valid JSON.`
  }

  if (academicType === 'assignment') {
    return `You are an EXPERT assignment completion coach. Your mission: break down ANY assignment into a clear, phase-based plan that prevents procrastination and ensures high-quality work.

CRITICAL: You MUST respond with ONLY valid JSON. No text before or after. No markdown. No explanations. ONLY the JSON object.

===================================
ASSIGNMENT INFORMATION
===================================

${content.assignmentContent || 'Extract from conversation'}

Course: ${content.metadata?.courseName || 'Extract from conversation'}
Due Date: ${content.metadata?.dueDate || 'Extract from conversation'}
Current Status: ${content.metadata?.currentLevel || 'Starting fresh'}

Normalized Dates (authoritative):
${content.metadata?.normalizedDates?.map((d: any) => `- ${d.line} -> ${d.date}`).join('\n') || 'None'}

===================================
ASSIGNMENT COMPLETION FRAMEWORK
===================================

Break the assignment into these phases:

**Phase 1: Research & Information Gathering (20-25% of time)**
- Understand requirements deeply
- Gather all necessary resources
- Initial research and exploration
- Identify key themes/topics

**Phase 2: Planning & Outline (15% of time)**
- Create detailed outline
- Organize ideas logically
- Plan structure and flow
- Identify any gaps in research

**Phase 3: First Draft (30% of time)**
- Write/create initial version
- Don't aim for perfection yet
- Get all ideas down
- Focus on covering all requirements

**Phase 4: Revision & Refinement (20% of time)**
- Review against rubric/requirements
- Improve clarity and quality
- Strengthen weak sections
- Get feedback if possible

**Phase 5: Final Polish (10-15% of time)**
- Proofread carefully
- Format properly
- Check citations/references
- Final quality check
- Submit with buffer time

===================================
SCHEDULING STRATEGY
===================================

Based on days until due date, allocate:
- 14+ days: Spread comfortably, 1-2 hours per day
- 7-13 days: Moderate pace, 2-3 hours per day
- 3-6 days: Intensive schedule, 3-4 hours per day
- <3 days: Emergency mode (warn user!)

ALWAYS include:
- Buffer day before due date (for final check)
- Regular checkpoints to track progress
- Flexibility for unexpected issues

===================================
TASK GENERATION RULES
===================================

Each task must:
- Have a SPECIFIC deliverable
- Build on previous tasks
- Move the assignment forward tangibly
- Include 3-5 clear checkpoints
- Have realistic time estimates

Example Task (Research Phase):
{
  "title": "Research Core Themes: [Assignment Topic]",
  "description": "Deep dive into the main themes of your assignment. You'll gather solid sources and identify key arguments.",
  "estimatedMinutes": 90,
  "deliverable": "10+ high-quality sources with key quotes/ideas annotated",
  "metric": "Sources cover all aspects of assignment requirements",
  "checkpoints": [
    "Review assignment rubric and identify 3-4 main themes to research",
    "Find 5 academic sources (Google Scholar, library database)",
    "Find 5 additional credible sources (reports, case studies, etc.)",
    "Create annotated list: source + key quote + relevance note"
  ]
}

===================================
JSON STRUCTURE
===================================

{
  "goalSummary": "[Course Code] Assignment: [Assignment Title] - Due [Date]",
  "totalDays": [calculate from today to due date],
  "dailyTimeCommitment": [minutes based on workload],
  "goalDomain": "academic",
  "subjects": ["[Course Name]"],
  "dailyTasks": {
    "day1": [...],
    ...
    "day{totalDays}": [
      {
        "title": "Final Submission & Celebration",
        "description": "You've done the work. Time for final checks and submission.",
        "estimatedMinutes": 30,
        "deliverable": "Assignment submitted successfully",
        "metric": "Submitted on time with all requirements met",
        "checkpoints": [
          "Final proofread - read assignment out loud",
          "Check all citations and references",
          "Verify file format and submission requirements",
          "Submit assignment and celebrate!"
        ]
      }
    ]
  }
}

CRITICAL:
- Use normalized dates EXACTLY. Do NOT shift due to timezone.
- Calculate EXACT days from today to due date
- Create tasks for EVERY day (no gaps)
- Always include buffer time before due date
- Phase tasks logically (research → plan → draft → revise → polish)
- Make each task move the assignment forward
- Include celebration/completion task on final day

Generate the complete assignment plan now. Return ONLY valid JSON.`
  }

  if (academicType === 'exam') {
    return `You are an EXPERT exam preparation strategist using proven learning science. Your mission: create a study plan using spaced repetition and progressive difficulty that prepares students thoroughly WITHOUT burning them out.

CRITICAL: You MUST respond with ONLY valid JSON. No text before or after. No markdown. No explanations. ONLY the JSON object.

===================================
EXAM INFORMATION
===================================

${content.examContent || 'Extract from conversation'}

Course: ${content.metadata?.courseName || 'Extract from conversation'}
Exam Date: ${content.metadata?.examDate || 'Extract from conversation'}
Student's Current Level: ${content.metadata?.currentLevel || 'Extract from conversation'}
Topics Covered: Extract from exam content above

Normalized Dates (authoritative):
${content.metadata?.normalizedDates?.map((d: any) => `- ${d.line} -> ${d.date}`).join('\n') || 'None'}

===================================
SPACED REPETITION FRAMEWORK
===================================

**Phase 1: Foundation Building (First 40% of time)**
- Understand core concepts
- Learn fundamentals deeply
- Create study materials (notes, flashcards, summaries)
- First exposure to all topics
- Focus: UNDERSTANDING

**Phase 2: Active Practice (Middle 40% of time)**
- Practice problems and applications
- Test yourself on concepts
- Identify weak areas
- REVIEW concepts from Phase 1 (spaced repetition!)
- Focus: APPLICATION & MASTERY

**Phase 3: Confidence Building (Final 20% of time)**
- Mock exams under timed conditions
- Review mistakes and gaps
- Final review of all topics
- Light practice (no cramming!)
- Mental preparation
- Focus: CONFIDENCE & READINESS

===================================
SPACED REPETITION SCHEDULE
===================================

For optimal retention, review each topic AT LEAST 3 times:
1. **First exposure**: Learn the concept (Phase 1)
2. **Second exposure** (2-3 days later): Review + practice problems (Phase 2)
3. **Third exposure** (5-7 days later): Final review + test yourself (Phase 3)

Example for 14-day plan:
- Day 1: Learn Topic A
- Day 3: Review Topic A + practice
- Day 8: Final review Topic A
- Day 10: Mock exam including Topic A

===================================
TASK GENERATION RULES
===================================

**Foundation Phase Tasks** (Days 1-40%):
- "Learn [Topic]: Core Concepts"
- "Create Study Materials for [Topic]"
- "Understand [Difficult Concept] Through Examples"

**Practice Phase Tasks** (Days 40-80%):
- "Practice Problems: [Topic] (10-15 problems)"
- "Review [Earlier Topic] + Solve Advanced Problems"
- "Self-Test: [Topic Area]"

**Confidence Phase Tasks** (Final 20%):
- "Mock Exam #1: Full Simulation"
- "Review Mistakes from Mock Exam"
- "Final Review: High-Yield Topics"
- "Light Review & Mental Prep" (exam eve)

Each task must include:
- Specific learning objective
- Active recall components (practice, self-testing)
- 3-5 checkpoints with clear actions
- Realistic time estimates

===================================
CRITICAL STUDY PRINCIPLES
===================================

✓ Space out reviews (don't study same topic 2 days in a row)
✓ Include practice problems throughout (not just reading)
✓ Schedule mock exams 3-5 days before the real exam
✓ Review mistakes from practice/mock exams
✓ Light study on exam eve (confidence building, not learning new content)
✓ Mix topics strategically (interleaving for better retention)
✓ Include breaks and consolidation days

✗ NO all-nighters or cramming
✗ NO passive reading without active recall
✗ NO skipping early topics to focus on later ones
✗ NO heavy studying the night before exam

===================================
JSON STRUCTURE
===================================

{
  "goalSummary": "[Course Code] Exam Prep: [Exam Name/Type] - [Date]",
  "totalDays": [calculate from today to exam date],
  "dailyTimeCommitment": [minutes based on exam scope],
  "goalDomain": "academic",
  "subjects": ["[Course Name]"],
  "dailyTasks": {
    "day1": [
      {
        "title": "Foundation: [First Major Topic]",
        "description": "Build deep understanding of [topic]. This is your first exposure - focus on comprehension, not memorization.",
        "estimatedMinutes": 90,
        "deliverable": "Comprehensive notes on [topic] with examples",
        "metric": "Can explain [topic] in your own words without looking at notes",
        "checkpoints": [
          "Review lecture notes/textbook chapter on [topic]",
          "Create a concept map showing how ideas connect",
          "Work through 3 example problems to test understanding",
          "Write a 1-paragraph summary in your own words"
        ]
      }
    ],
    ...
    "day{totalDays-1}": [
      {
        "title": "Final Light Review & Mental Prep",
        "description": "You've done the work. Today is about confidence, not cramming. Light review only.",
        "estimatedMinutes": 60,
        "deliverable": "Calm, confident mindset + quick reference sheet reviewed",
        "metric": "Feel prepared and well-rested",
        "checkpoints": [
          "Quick review of your study sheets (15 min)",
          "Flip through flashcards of key formulas/concepts (15 min)",
          "Visualize yourself succeeding in the exam (5 min)",
          "Get everything ready (calculator, pens, ID) and relax (25 min)"
        ]
      }
    ],
    "day{totalDays}": [
      {
        "title": "EXAM DAY: [Exam Name]",
        "description": "Trust your preparation. You've got this!",
        "estimatedMinutes": 0,
        "deliverable": "Complete exam with confidence",
        "metric": "Give it your best effort",
        "checkpoints": [
          "Eat a good breakfast and arrive early",
          "Take 3 deep breaths before starting",
          "Read all instructions carefully",
          "Trust your preparation and stay calm"
        ]
      }
    ]
  }
}

CRITICAL:
- Use normalized dates EXACTLY. Do NOT shift due to timezone.
- Calculate EXACT days from today to exam date
- Create tasks for EVERY day (no gaps)
- Apply spaced repetition (review topics multiple times)
- Include mock exams 3-5 days before
- NO cramming the night before
- Make exam day task inspirational/supportive

Generate the complete exam prep plan now. Return ONLY valid JSON.`
  }

  // Should never reach here, but fallback just in case
  return ''
}

serve(async (req) => {
  const startTime = Date.now()
  
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    })
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get("Authorization")!
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    // Parse request body
    const body: RequestBody = await req.json()
    const { 
      messages, 
      conversationData = {}, 
      isIncremental = false, 
      goalId, 
      timezone,
      // NEW: Academic fields
      academicType,
      syllabusContent,
      assignmentContent,
      examContent,
      metadata
    } = body

    const userTimeZone = timezone || "UTC"
    const sourceText = syllabusContent || assignmentContent || examContent || ""
    const extractedDates = extractImportantDatesFromText(sourceText, userTimeZone)
    const enrichedMetadata = {
      ...(metadata || {}),
      normalizedDates: extractedDates.normalizedDates.length
        ? extractedDates.normalizedDates
        : metadata?.normalizedDates || [],
      importantDates: extractedDates.importantDates.length
        ? extractedDates.importantDates
        : metadata?.importantDates || [],
    }

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Messages are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    // Determine which system prompt to use
    let systemPrompt: string
    let userPrompt: string

    if (academicType && ['semester', 'assignment', 'exam'].includes(academicType)) {
      console.log(`🎓 Academic mode: ${academicType}`)
      
      // Use academic-specific system prompt
      systemPrompt = getAcademicSystemPrompt(academicType, {
        syllabusContent,
        assignmentContent,
        examContent,
        metadata: enrichedMetadata
      })
      
      // Build user prompt from conversation
      const conversationText = messages
        .map((m) => `${m.role === "user" ? "User" : "Aura"}: ${m.content}`)
        .join("\n\n")
      
      userPrompt = `Based on this conversation and the ${academicType} information provided, create a comprehensive academic plan:

CONVERSATION:
${conversationText}

ADDITIONAL CONTEXT:
${JSON.stringify({ metadata: enrichedMetadata, conversationData }, null, 2)}

Generate the complete ${academicType} plan now. Return ONLY valid JSON matching the structure specified in the system prompt.`
      
    } else {
      // Use original general goal system prompt
      console.log(`🎯 General goal mode`)
      
      const conversationText = messages
        .map((m) => `${m.role === "user" ? "User" : "Aura"}: ${m.content}`)
        .join("\n\n")
      
      const estimatedTokens = conversationText.length / 4
      const shouldSummarize = !isIncremental
      
      console.log(`📊 Conversation stats: ${messages.length} messages, ~${Math.round(estimatedTokens)} tokens`)
      
      // [Keep your existing summarization logic here - I'll include it below]
      let conversationSummary = conversationText
      
      if (shouldSummarize) {
        console.log("📝 Summarizing conversation for faster processing...")
        
        const summarizePrompt = `You are an expert at extracting critical information from goal-setting coaching conversations. Your task is to create a comprehensive summary that captures ALL essential details - both emotional/psychological AND logistical - needed to create a deeply personalized action plan.

CRITICAL: Extract and preserve ALL of the following information:

1. EMOTIONAL FOUNDATION (THE WHY):
   - The user's deep motivation and what success means to them
   - What's at stake if they don't achieve this
   - Past attempts and what derailed them
   - Obstacles and fears they've mentioned
   - Confidence level and commitment

2. WORKING STYLE & PREFERENCES:
   - Best working time (morning/afternoon/evening/night)
   - Learning style (hands-on/watching/reading/talking)
   - Motivation type (progress-driven vs outcome-driven)
   - Planning style (detailed vs flexible)

3. GOAL SUMMARY: 
   - The main goal the user wants to achieve (exact wording if possible)

4. DOMAIN: 
   - Academic, Business, Health/Fitness, Creative/Skill, Personal Development, or Other

5. TIMELINE: 
   - Specific end dates mentioned (e.g., "December 10th", "by Jan 15")
   - Duration phrases (e.g., "90 days", "3 months", "2 weeks")
   - If no timeline mentioned, note that

6. DAILY TIME COMMITMENT:
   - Exact hours/minutes per day mentioned (e.g., "2 hours", "30 minutes")
   - If no time mentioned, note that

7. SUBJECTS/COURSES/AREAS:
   - For academic: course names, codes, subjects
   - For business: business type, industry, focus areas
   - For health: specific targets (weight, strength, etc.)
   - For creative: skill name, current level
   - Any other relevant categories

8. CONSTRAINTS & PREFERENCES:
   - Scheduling constraints (e.g., "no weekends", "weekdays only")
   - Time preferences (e.g., "mornings", "evenings")
   - Any limitations or restrictions

9. IMPORTANT DATES & DEADLINES:
   - Exams, finals, project deadlines
   - Specific dates mentioned (e.g., "final on December 4th")
   - Any time-sensitive milestones

10. CURRENT STATUS:
    - Current performance/level (grades, metrics, baseline)
    - What they've tried before
    - What's working/not working

11. RESOURCES & TOOLS:
    - Available resources (textbooks, equipment, budget, team)
    - Tools or platforms they use
    - Study methods or approaches mentioned

12. SUCCESS CRITERIA:
    - How they'll know they've achieved the goal
    - Specific metrics or outcomes mentioned

CONVERSATION:
${conversationText}

Return a structured summary in this JSON format:
{
  "emotionalFoundation": {
    "deepWhy": "What really drives them",
    "stakes": "What happens if they don't do this",
    "pastAttempts": "What they've tried and what failed",
    "obstacles": "Fears, blockers, concerns",
    "confidenceLevel": "1-10 if mentioned"
  },
  "workingStyle": {
    "bestTime": "morning|afternoon|evening|night",
    "learningStyle": "hands-on|watching|reading|talking",
    "motivationType": "progress|outcome",
    "planningStyle": "detailed|flexible"
  },
  "goalSummary": "Clear, concise summary of the main goal",
  "domain": "academic|business|health|creative|personal|other",
  "timeline": {
    "specificEndDate": "December 10th" or null,
    "duration": "90 days" or null,
    "notes": "Any timeline details"
  },
  "dailyTimeCommitment": {
    "hours": 2 or null,
    "minutes": 120 or null,
    "notes": "Any time commitment details"
  },
  "subjects": ["Course 1", "Course 2", ...],
  "constraints": {
    "scheduling": "no weekends" or null,
    "timePreferences": "mornings" or null,
    "other": "Any other constraints"
  },
  "importantDates": [
    {"date": "December 4th", "event": "Final exam"},
    {"date": "December 10th", "event": "Project deadline"}
  ],
  "currentStatus": {
    "performance": "Current grades/level/status",
    "pastAttempts": "What they've tried",
    "whatWorks": "What's working for them"
  },
  "resources": ["Resource 1", "Resource 2", ...],
  "successCriteria": "How they'll know they succeeded",
  "additionalContext": "Any other important details not captured above"
}

CRITICAL: Be thorough and comprehensive. Preserve ALL specific details, dates, numbers, names, and especially emotional context. This summary will be used to generate a deeply personalized plan, so nothing important should be lost.`

        try {
          const summarizeResponse = await fetch(OPENAI_URL, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o-mini-2024-07-18",
              messages: [
                { role: "system", content: "You are an expert at extracting and summarizing information from conversations. Always return valid JSON." },
                { role: "user", content: summarizePrompt },
              ],
              max_tokens: 2500,
              temperature: 0.3,
              response_format: { type: "json_object" },
            }),
          })

          if (!summarizeResponse.ok) {
            const error = await summarizeResponse.text()
            console.error("❌ Summarization failed:", error)
            console.log("⚠️ Continuing with original conversation (summarization failed)")
          } else {
            const summarizeData = await summarizeResponse.json()
            const summaryContent = summarizeData.choices?.[0]?.message?.content
            
            if (summaryContent) {
              try {
                const summary = JSON.parse(summaryContent)
                console.log("✅ Conversation summarized successfully")
                
                const summaryParts: string[] = []
                
                if (summary.emotionalFoundation) {
                  summaryParts.push("=== EMOTIONAL FOUNDATION ===")
                  if (summary.emotionalFoundation.deepWhy) {
                    summaryParts.push(`WHY THIS MATTERS: ${summary.emotionalFoundation.deepWhy}`)
                  }
                  if (summary.emotionalFoundation.stakes) {
                    summaryParts.push(`STAKES: ${summary.emotionalFoundation.stakes}`)
                  }
                  if (summary.emotionalFoundation.obstacles) {
                    summaryParts.push(`OBSTACLES: ${summary.emotionalFoundation.obstacles}`)
                  }
                  if (summary.emotionalFoundation.pastAttempts) {
                    summaryParts.push(`PAST ATTEMPTS: ${summary.emotionalFoundation.pastAttempts}`)
                  }
                }
                
                if (summary.workingStyle) {
                  summaryParts.push("\n=== WORKING STYLE ===")
                  if (summary.workingStyle.bestTime) {
                    summaryParts.push(`BEST TIME: ${summary.workingStyle.bestTime}`)
                  }
                  if (summary.workingStyle.learningStyle) {
                    summaryParts.push(`LEARNING STYLE: ${summary.workingStyle.learningStyle}`)
                  }
                  if (summary.workingStyle.motivationType) {
                    summaryParts.push(`MOTIVATION: ${summary.workingStyle.motivationType}`)
                  }
                }
                
                summaryParts.push("\n=== GOAL DETAILS ===")
                summaryParts.push(`GOAL: ${summary.goalSummary}`)
                summaryParts.push(`DOMAIN: ${summary.domain}`)
                
                if (summary.timeline?.specificEndDate) {
                  summaryParts.push(`TARGET DATE: ${summary.timeline.specificEndDate}`)
                } else if (summary.timeline?.duration) {
                  summaryParts.push(`TIMELINE: ${summary.timeline.duration}`)
                }
                
                if (summary.dailyTimeCommitment?.hours || summary.dailyTimeCommitment?.minutes) {
                  const hours = summary.dailyTimeCommitment.hours || 0
                  const minutes = summary.dailyTimeCommitment.minutes || 0
                  const totalMinutes = hours * 60 + minutes
                  summaryParts.push(`DAILY TIME: ${totalMinutes} minutes per day`)
                }
                
                if (summary.subjects && summary.subjects.length > 0) {
                  summaryParts.push(`SUBJECTS/AREAS: ${summary.subjects.join(", ")}`)
                }
                
                if (summary.constraints?.scheduling) {
                  summaryParts.push(`SCHEDULING CONSTRAINT: ${summary.constraints.scheduling}`)
                }
                
                if (summary.importantDates && summary.importantDates.length > 0) {
                  const datesList = summary.importantDates.map((d: any) => `${d.date}: ${d.event}`).join("; ")
                  summaryParts.push(`IMPORTANT DATES: ${datesList}`)
                }
                
                if (summary.currentStatus?.performance) {
                  summaryParts.push(`CURRENT STATUS: ${summary.currentStatus.performance}`)
                }
                
                if (summary.resources && summary.resources.length > 0) {
                  summaryParts.push(`RESOURCES: ${summary.resources.join(", ")}`)
                }
                
                if (summary.successCriteria) {
                  summaryParts.push(`SUCCESS CRITERIA: ${summary.successCriteria}`)
                }
                
                if (summary.additionalContext) {
                  summaryParts.push(`ADDITIONAL CONTEXT: ${summary.additionalContext}`)
                }
                
                conversationSummary = summaryParts.join("\n")
                console.log(`📝 Summary length: ${conversationSummary.length} chars (vs original: ${conversationText.length} chars)`)
              } catch (parseError) {
                console.error("❌ Failed to parse summary JSON:", parseError)
                console.log("⚠️ Continuing with original conversation")
              }
            }
          }
        } catch (summarizeError) {
          console.error("❌ Summarization error:", summarizeError)
          console.log("⚠️ Continuing with original conversation")
        }
      }

      systemPrompt = isIncremental
        ? `This is an additional conversation segment for the same goal. Tasks for some days may already exist.
Based on this conversation segment, ADD or REFINE tasks for specific days that need more context.

EARLIER CONVERSATION SEGMENT:
${conversationSummary}

REQUIREMENTS:
1. Focus on days that need additional context from THIS segment
2. Add tasks that complement or refine existing ones
3. Use EXACT details from this conversation segment
4. Each task: title, description, deliverable, metric, estimatedMinutes, checkpoints (3-5 actionable items)
5. Only generate tasks for days where this segment adds value

Return ONLY valid JSON with this structure:
{
  "goalSummary": "string",
  "totalDays": number,
  "dailyTimeCommitment": number,
  "goalDomain": "string",
  "subjects": ["string"],
  "dailyTasks": {
    "dayX": [{"title": "...", "description": "...", "deliverable": "...", "metric": "...", "estimatedMinutes": 30, "checkpoints": ["Action 1", "Action 2", "Action 3"]}],
    "dayY": [...]
  }
}`
        : `You are an ELITE goal achievement architect. Your mission: create a transformational, day-by-day action plan so personalized and purposeful that the user is genuinely impressed and says "this AI really gets me."

CRITICAL: You MUST respond with ONLY valid JSON. No text before or after. No markdown. No explanations. ONLY the JSON object.

===================================
PART 1: UNDERSTANDING THE USER
===================================

You have a rich conversation that reveals:
- Their EMOTIONAL WHY (what success means to them)
- Their OBSTACLES (what might derail them)
- Their WORKING STYLE (when and how they work best)
- Their LOGISTICS (timeline, resources, specifics)

Your job: Use ALL of this to create a plan that feels like it was designed by someone who truly understands them.

===================================
PART 2: TIMELINE EXTRACTION (CRITICAL)
===================================

PRIORITY ORDER FOR CALCULATING totalDays:

1. FIRST: Look for SPECIFIC END DATES
   - "December 10th", "Dec 10", "by January 15th", "on the 20th"
   - If found: Calculate EXACT days from TODAY to that date
   - Example: Today is November 22, 2024. User says "December 10th" → totalDays = 18 days
   - Example: Today is November 15, 2024. User says "December 10th" → totalDays = 25 days
   - ALWAYS use calendar calculation, not duration estimation

2. SECOND: Look for DURATION PHRASES (only if no specific date)
   - "90 days", "3 months", "6 weeks", "2 weeks"
   - Convert to days: "3 months" = 90, "6 weeks" = 42, "2 weeks" = 14

3. LAST: If NO timeline mentioned, infer based on goal complexity:
   - Simple goals (habit, basic skill): 30 days
   - Medium goals (course, project): 60-90 days
   - Complex goals (major transformation): 90-180 days

EXTRACT dailyTimeCommitment:
- Look for: "2 hours per day", "30 minutes daily", "1 hour each day"
- Convert to MINUTES for estimation purposes
- If not mentioned: Default to 60 minutes

===================================
PART 3: TASK GENERATION REQUIREMENTS
===================================

🎯 GOLDEN RULES (NON-NEGOTIABLE):

1. ZERO BUSYWORK
   - Every task must produce a tangible outcome or learning
   - NEVER create generic "study for 30 min" or "practice for 1 hour" tasks
   - Each task must have a UNIQUE deliverable

2. PROGRESSIVE COMPLEXITY ARC
   Days 1-7 (Foundation + Quick Wins):
   - Front-load achievable tasks that build confidence
   - Create "AHA!" moments early
   - Set up systems and frameworks
   - Each task should feel satisfying to complete
   
   Days 8-30% (Skill Building):
   - Build core competencies
   - Mix creation with analysis
   - Reference earlier work ("using your X from day Y...")
   - Increase challenge gradually
   
   Middle 60% (Deep Work + Mastery):
   - Advanced application
   - Integration of skills
   - Real-world application
   - Challenge tasks for growth
   
   Final 20% (Excellence + Integration):
   - Synthesis and refinement
   - Prepare for final push
   - Build confidence for completion
   - Celebrate major milestones

3. PERSONALIZATION DEPTH
   - Use EXACT course names, tools, resources mentioned
   - Reference their SPECIFIC struggles (e.g., "recursion" if they mentioned it)
   - Match their WORKING STYLE (morning person → morning-focused tasks)
   - Address their OBSTACLES in task design
   - Use THEIR language (if they say "crush it", you say "crush it")
   - Build on their EXISTING knowledge
   - Leverage their AVAILABLE resources

4. TASK VARIETY (Critical for engagement)
   Mix these task types across days:
   - CREATE: Build something tangible
   - PRACTICE: Hands-on application
   - ANALYZE: Deep understanding
   - APPLY: Real-world use
   - REFLECT: Self-assessment
   - TEACH: Explain to solidify
   - EXPERIMENT: Try new approaches
   - REVIEW: Consolidate learning

5. CHECKPOINT EXCELLENCE
   Every task MUST have 3-5 checkpoints that:
   - Start with ACTION VERBS (Complete, Review, Create, Analyze, Build, Write, Practice)
   - Are SPECIFIC and MEASURABLE
   - Each = 5-15 minutes of focused work
   - Form a LOGICAL SEQUENCE through the task
   - Feel like progress milestones
   
   BAD: ["Study material", "Review notes", "Practice"]
   GOOD: ["Complete practice problems 1-5 from Chapter 3", "Review your answers and identify 2 weak areas", "Create a one-page cheat sheet for those weak areas"]

6. MILESTONE MARKERS
   Every 7-10 days, create a "checkpoint moment":
   - Mark it explicitly in description
   - Reflect on progress made
   - Celebrate what's been achieved
   - Energize for next phase

7. SMART TASK DISTRIBUTION
   - Tasks per day: 1-5 maximum (usually 2-3)
   - Base number on dailyTimeCommitment
   - Some days naturally have 1-2 tasks (research, planning)
   - Others have 3-5 tasks (active work days)
   - Total daily estimated minutes should roughly match dailyTimeCommitment
   - Don't overwhelm - quality over quantity

8. SCHEDULING CONSTRAINTS
   - If "no weekends" or "weekdays only" mentioned: Skip Saturdays and Sundays
   - Calculate which day numbers fall on weekends and skip them
   - Adjust task dates accordingly

9. IMPORTANT DATES
   - If user mentioned specific dates (finals, deadlines): Create specific tasks for those days
   - Example: "final on December 4th" → Create task "Complete CMPT310 Final Exam" on that exact day
   - Build preparation in days leading up to important dates

===================================
PART 4: JSON STRUCTURE (EXACT FORMAT)
===================================

{
  "goalSummary": "string",
  "totalDays": number,
  "dailyTimeCommitment": number (in minutes for estimation),
  "goalDomain": "academic|business|health|creative|personal|other",
  "subjects": ["string", "string"],
  "dailyTasks": {
    "day1": [
      {
        "title": "Compelling, specific task title that reflects their situation",
        "description": "Rich description that shows you understand their context, references their specific situation, and explains WHY this task matters",
        "estimatedMinutes": number,
        "deliverable": "Concrete outcome they'll have when done",
        "metric": "How to measure success",
        "checkpoints": [
          "Action verb + specific step (5-15 min)",
          "Action verb + specific step (5-15 min)",
          "Action verb + specific step (5-15 min)",
          "Action verb + specific step (5-15 min)"
        ]
      }
    ],
    "day2": [...],
    ...
    "day{totalDays}": [...]
  }
}

CRITICAL: You MUST generate tasks for EVERY day from day1 to day{totalDays} with NO GAPS.
- If totalDays = 18, you need day1 through day18
- If totalDays = 90, you need day1 through day90
- If totalDays = 180, you need day1 through day180
- NO STOPPING EARLY - complete all days

===================================
PART 5: EXAMPLE OF EXCELLENCE
===================================

Instead of:
{
  "title": "Study recursion",
  "description": "Review recursion concepts",
  "checkpoints": ["Read chapter", "Do practice", "Review"]
}

Do this:
{
  "title": "Decode Recursion - Your Dragon #1",
  "description": "You mentioned recursion confuses you in CMPT310. Today we're breaking it down using your hands-on learning style. You'll create your own visual map and test it with real problems.",
  "estimatedMinutes": 90,
  "deliverable": "A hand-drawn recursion decision tree with 3 solved problems",
  "metric": "Successfully solve 3 recursion problems independently and explain your process",
  "checkpoints": [
    "Watch the recursion visualization video you bookmarked and draw the call stack for factorial(5)",
    "Work through practice problem #1: Fibonacci sequence - draw out the full recursion tree",
    "Complete practice problem #2: Binary search - map each recursive call",
    "Create a one-page 'Recursion Decoder' with your 3 key insights from today"
  ]
}

===================================
PART 6: QUALITY CHECKLIST
===================================

Before generating, ensure:
✓ Every single day has tasks (day1 through day{totalDays})
✓ Day 1-3 tasks are achievable and confidence-building
✓ No repetitive "study for X minutes" tasks
✓ Each task references their specific situation
✓ Task complexity increases gradually
✓ Every task has 3-5 action-oriented checkpoints
✓ Checkpoints start with action verbs
✓ Tasks respect their time commitment
✓ Important dates have specific tasks
✓ Weekend constraints are honored if mentioned
✓ Task variety prevents monotony
✓ Milestones marked every 7-10 days
✓ Language matches their style and energy

===================================
YOUR MISSION
===================================

Create a plan so good that the user thinks: "Wow, this AI really understood me. Every day feels purposeful. I'm actually excited to start."

Make them believe they WILL achieve their goal because the plan is that good.

Now generate the plan. Return ONLY the JSON object, nothing else.`

      userPrompt = isIncremental
        ? `Based on this conversation segment, generate tasks for the days that need additional context.`
        : `Based on this ${shouldSummarize && !isIncremental ? 'conversation summary' : 'conversation'}, create a progressive day-by-day action plan that will genuinely transform this user's life:

${conversationSummary}

CONTEXT:
${JSON.stringify(conversationData, null, 2)}

REMEMBER:
1. Extract timeline from conversation (specific date → calculate days from today, OR duration phrase → use that, OR infer based on complexity)
2. Extract time commitment (convert to minutes for estimations)
3. Generate tasks for EVERY SINGLE DAY from day1 to day{totalDays} - NO GAPS
4. Front-load quick wins (days 1-7)
5. Make every task unique and purposeful - NO BUSYWORK
6. Personalize deeply - use their exact words, struggles, resources
7. Create 3-5 actionable checkpoints for each task
8. Respect weekend constraints if mentioned
9. Create specific tasks for important dates mentioned
10. Maximum 5 tasks per day, usually 2-3

Make this plan EXCEPTIONAL. The user is counting on you.

Generate the complete plan now. Return ONLY valid JSON.`
    }

    // Check OpenAI API key
    if (!OPENAI_API_KEY || OPENAI_API_KEY === "") {
      console.error("❌ OPENAI_API_KEY is not set!")
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured", details: "Please set OPENAI_API_KEY secret in Supabase" }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      )
    }

    console.log("🤖 Calling OpenAI API...")
    // Call OpenAI API
    const openaiResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-2024-11-20",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 16000,
        temperature: 0.7,
        response_format: { type: "json_object" },
        stream: false,
      }),
    })

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text()
      console.error("❌ OpenAI API error:", error)
      console.error("OpenAI status:", openaiResponse.status)
      return new Response(
        JSON.stringify({ error: "Failed to generate plan", details: error, status: openaiResponse.status }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      )
    }

    console.log("✅ OpenAI API call successful")

    const openaiData = await openaiResponse.json()
    const content = openaiData.choices?.[0]?.message?.content
    const finishReason = openaiData.choices?.[0]?.finish_reason

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No content from OpenAI" }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      )
    }

    // Check if response was truncated
    if (finishReason === "length") {
      console.error("⚠️ WARNING: OpenAI response was TRUNCATED due to token limit!")
      console.error(`⚠️ Content length: ${content.length} characters`)
      return new Response(
        JSON.stringify({ 
          error: "Response truncated - plan too large", 
          details: "The generated plan exceeds the maximum token limit. Please request a shorter plan.",
          finishReason: finishReason,
          contentLength: content.length
        }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      )
    }

    console.log(`📊 OpenAI response length: ${content.length} characters, finish_reason: ${finishReason}`)

    // [Keep all your existing JSON parsing logic - it's excellent]
    let taskPlan: TaskPlan
    try {
      let jsonString = content.trim()
      
      jsonString = jsonString.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
      
      let braceCount = 0
      let startIndex = jsonString.indexOf('{')
      let endIndex = -1
      
      if (startIndex === -1) {
        throw new Error("No JSON object found in response")
      }
      
      for (let i = startIndex; i < jsonString.length; i++) {
        if (jsonString[i] === '{') {
          braceCount++
        } else if (jsonString[i] === '}') {
          braceCount--
          if (braceCount === 0) {
            endIndex = i + 1
            break
          }
        }
      }
      
      if (endIndex === -1) {
        console.error("❌ Could not find matching closing brace")
        const missingBraces = (jsonString.match(/\{/g) || []).length - (jsonString.match(/\}/g) || []).length
        if (missingBraces > 0) {
          jsonString = jsonString + "}".repeat(missingBraces)
          console.log(`⚠️ Added ${missingBraces} closing brace(s)`)
        }
      } else {
        jsonString = jsonString.substring(startIndex, endIndex)
      }
      
      jsonString = jsonString.replace(/,(\s*[}\]])/g, "$1")
      
      taskPlan = JSON.parse(jsonString)
      console.log("✅ JSON parsed successfully")
      
      if (!taskPlan.dailyTasks) {
        throw new Error("Task plan missing 'dailyTasks' field")
      }
      
      if (!taskPlan.dailyTasks.day1 || !Array.isArray(taskPlan.dailyTasks.day1) || taskPlan.dailyTasks.day1.length === 0) {
        console.error("❌ CRITICAL: day1 tasks are missing!")
        throw new Error("day1 tasks are required")
      }
      
      let day1TasksWithoutCheckpoints = 0
      for (const task of taskPlan.dailyTasks.day1) {
        if (!task.checkpoints || !Array.isArray(task.checkpoints) || task.checkpoints.length === 0) {
          day1TasksWithoutCheckpoints++
          console.error(`❌ Day1 task "${task.title}" has NO checkpoints!`)
        } else {
          console.log(`✅ Day1 task "${task.title}": ${task.checkpoints.length} checkpoints`)
        }
      }
      
      const totalDays = Object.keys(taskPlan.dailyTasks).length
      const totalTasks = Object.values(taskPlan.dailyTasks).reduce((sum: number, tasks: any) => sum + (Array.isArray(tasks) ? tasks.length : 0), 0)
      console.log(`📊 Task Plan: ${totalDays} days, ${totalTasks} total tasks`)

      const todayLocal = getLocalToday(userTimeZone)
      const targetDate = getTargetDateFromMetadata(enrichedMetadata, userTimeZone)

      if (targetDate) {
        const computedTotalDays = daysBetweenInclusive(todayLocal, targetDate)
        taskPlan.totalDays = Math.min(MAX_TOTAL_DAYS, Math.max(taskPlan.totalDays || 1, computedTotalDays))
      } else {
        taskPlan.totalDays = Math.min(MAX_TOTAL_DAYS, taskPlan.totalDays || 1)
      }

      for (let i = 1; i <= taskPlan.totalDays; i++) {
        const key = `day${i}`
        if (!taskPlan.dailyTasks[key]) {
          taskPlan.dailyTasks[key] = []
        }
      }

      const dayKeysSorted = Object.keys(taskPlan.dailyTasks).sort((a, b) => {
        const numA = parseInt(a.replace("day", ""))
        const numB = parseInt(b.replace("day", ""))
        return numA - numB
      })

      if (dayKeysSorted.length > MAX_TOTAL_DAYS) {
        dayKeysSorted.slice(MAX_TOTAL_DAYS).forEach((k) => delete taskPlan.dailyTasks[k])
        taskPlan.totalDays = MAX_TOTAL_DAYS
      }

      dayKeysSorted.slice(0, MAX_TOTAL_DAYS).forEach((k) => {
        const tasksForDay = Array.isArray(taskPlan.dailyTasks[k]) ? taskPlan.dailyTasks[k] : []
        const trimmedTasks = tasksForDay.slice(0, MAX_TASKS_PER_DAY).map((t) => ({
          ...t,
          checkpoints: Array.isArray(t.checkpoints) ? t.checkpoints.slice(0, MAX_CHECKPOINTS) : [],
        }))
        taskPlan.dailyTasks[k] = trimmedTasks
      })
      
    } catch (e: any) {
      console.error("❌ Failed to parse JSON:", e.message)
      
      const positionMatch = e.message.match(/position (\d+)/)
      const errorPosition = positionMatch ? parseInt(positionMatch[1]) : -1
      
      if (errorPosition > 0) {
        console.error(`❌ Error at position: ${errorPosition}`)
        const start = Math.max(0, errorPosition - 300)
        const end = Math.min(content.length, errorPosition + 300)
        const context = content.substring(start, end)
        console.error(`❌ Context:\n...${context}...`)
        
        try {
          console.log("⚠️ Attempting JSON fix...")
          let fixedJson = content.trim()
          fixedJson = fixedJson.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
          
          const startIdx = fixedJson.indexOf('{')
          if (startIdx === -1) throw new Error("No JSON start")
          
          let braces = 0
          let endIdx = startIdx
          for (let i = startIdx; i < fixedJson.length; i++) {
            if (fixedJson[i] === '{') braces++
            if (fixedJson[i] === '}') braces--
            if (braces === 0 && i > startIdx) {
              endIdx = i + 1
              break
            }
          }
          
          fixedJson = fixedJson.substring(startIdx, endIdx)
          fixedJson = fixedJson.replace(/,(\s*[}\]])/g, "$1")
          
          taskPlan = JSON.parse(fixedJson)
          console.log("✅ JSON fixed and parsed")
        } catch (retryError: any) {
          console.error("❌ Fix failed:", retryError.message)
          return new Response(
            JSON.stringify({ 
              error: "Invalid JSON from OpenAI", 
              message: e.message,
              retryMessage: retryError.message,
              errorPosition: errorPosition,
              contentLength: content.length,
              preview: content.substring(0, 2000)
            }),
            { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
          )
        }
      } else {
        return new Response(
          JSON.stringify({ 
            error: "Invalid JSON from OpenAI", 
            message: e.message || String(e),
            contentLength: content.length
          }),
          { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
        )
      }
    }

    // [Keep all your existing database save logic - it's working well]
    const now = new Date()
    const todayLocal = new Date(now.toLocaleString("en-US", { timeZone: userTimeZone }))
    todayLocal.setHours(0, 0, 0, 0)

    const formatDateKey = (date: Date) => {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: userTimeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date)
    }

    const importantDateEvents = (() => {
      const events: Array<{ dateKey: string; event: string }> = []
      if (enrichedMetadata?.normalizedDates?.length) {
        enrichedMetadata.normalizedDates.forEach((item: any) => {
          if (item?.date && item?.line) {
            events.push({ dateKey: item.date, event: item.line })
          }
        })
      } else if (enrichedMetadata?.importantDates?.length) {
        enrichedMetadata.importantDates.forEach((item: any) => {
          if (!item?.date || !item?.event) return
          const parsed = new Date(item.date)
          if (!Number.isNaN(parsed.getTime())) {
            events.push({ dateKey: formatDateKey(parsed), event: item.event })
          }
        })
      }
      return events
    })()

    const focusDaysPerWeek = Math.min(
      7,
      Math.max(1, Number(enrichedMetadata?.focusDaysPerWeek || 0) || 0)
    )
    const hasFocusDays = focusDaysPerWeek > 0

    // Save goal to Supabase
    let finalGoalId = goalId
    if (!isIncremental || !goalId) {
      console.log("📝 Creating new goal...")
      
      // NEW: Include academic type in goal summary
      let goalSummaryText = taskPlan.goalSummary
      if (academicType) {
        const academicLabel = academicType.charAt(0).toUpperCase() + academicType.slice(1)
        goalSummaryText = `${academicLabel}: ${goalSummaryText}`
      }
      
      const goalData = {
        user_id: user.id,
        summary: goalSummaryText,
        total_days: taskPlan.totalDays,
        daily_minutes_budget: Math.round(taskPlan.dailyTimeCommitment),
        domain: taskPlan.goalDomain || "other",
        created_at: new Date().toISOString(),
      }

      const { data: goal, error: goalError } = await supabase
        .from("user_goals")
        .insert(goalData)
        .select()
        .single()

      if (goalError) {
        console.error("❌ Goal creation failed:", goalError)
        
        const goalDataAlt = { ...goalData, current_summary: goalSummaryText }
        delete (goalDataAlt as any).summary
        
        const { data: goalAlt, error: goalErrorAlt } = await supabase
          .from("user_goals")
          .insert(goalDataAlt)
          .select()
          .single()
          
        if (goalErrorAlt) {
          return new Response(
            JSON.stringify({ 
              error: "Failed to create goal", 
              details: goalErrorAlt.message
            }),
            { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
          )
        }
        
        finalGoalId = goalAlt.id
      } else {
        finalGoalId = goal.id
      }
      
      console.log("✅ Goal created:", finalGoalId)

      try {
        const planData = {
          goal_id: finalGoalId,
          total_days: taskPlan.totalDays,
          daily_minutes: Math.round(taskPlan.dailyTimeCommitment),
          domain: taskPlan.goalDomain,
          subjects_csv: taskPlan.subjects.join(","),
          created_at: new Date().toISOString(),
        }
        await supabase.from("goal_plans").insert(planData)
      } catch (err) {
        console.warn("⚠️ Goal plan creation failed (non-critical)")
      }
    }

    // [Keep all your existing task save logic...]
    const conversationTextLower = (syllabusContent || assignmentContent || examContent || messages.map(m => m.content).join(' ')).toLowerCase()
    const noWeekends = conversationTextLower.includes("no weekends") || 
                       conversationTextLower.includes("weekdays only")
    
    if (noWeekends) {
      console.log("📅 Weekend constraint: weekdays only")
    }

    const isWeekend = (date: Date): boolean => {
      const local = new Date(date.toLocaleString("en-US", { timeZone: userTimeZone }))
      const day = local.getDay()
      return day === 0 || day === 6
    }

    const getNextWeekday = (date: Date): Date => {
      const next = new Date(date)
      while (isWeekend(next)) {
        next.setDate(next.getDate() + 1)
      }
      return next
    }

    const tasks: any[] = []
    const checkpoints: any[] = []
    const dayKeys = Object.keys(taskPlan.dailyTasks).sort((a, b) => {
      const numA = parseInt(a.replace("day", ""))
      const numB = parseInt(b.replace("day", ""))
      return numA - numB
    })

    let currentScheduleDate = new Date(todayLocal)
    const maxTaskDay = dayKeys.reduce((max, key) => {
      const dayNum = parseInt(key.replace("day", ""))
      const dayTasks = taskPlan.dailyTasks[key]
      if (Array.isArray(dayTasks) && dayTasks.length > 0) {
        return Math.max(max, dayNum)
      }
      return max
    }, 0)

    const focusDayIndex = hasFocusDays
      ? getStudyWeekdays(focusDaysPerWeek, noWeekends)
      : [0, 1, 2, 3, 4, 5, 6]

    const semesterEndDate = new Date(todayLocal)
    semesterEndDate.setDate(semesterEndDate.getDate() + (taskPlan.totalDays - 1))
    const totalStudyDays = hasFocusDays
      ? getTotalStudyDays(todayLocal, semesterEndDate, focusDayIndex)
      : taskPlan.totalDays

    for (const dayKey of dayKeys) {
      const dayNum = parseInt(dayKey.replace("day", ""))
      const dayTasks = taskPlan.dailyTasks[dayKey]
      if (!Array.isArray(dayTasks) || dayTasks.length === 0) {
        continue
      }

      const scaledDayIndex =
        maxTaskDay > 1
          ? Math.round(((dayNum - 1) * (taskPlan.totalDays - 1)) / (maxTaskDay - 1)) + 1
          : 1

      const studyIndex =
        maxTaskDay > 1
          ? Math.round(((dayNum - 1) * (totalStudyDays - 1)) / (maxTaskDay - 1)) + 1
          : 1

      let scheduledDateKey: string
      if (hasFocusDays) {
        const taskDate = getStudyDateByIndex(todayLocal, studyIndex, focusDayIndex)
        scheduledDateKey = formatDateKey(taskDate)
      } else if (noWeekends) {
        if (isWeekend(currentScheduleDate)) {
          currentScheduleDate = getNextWeekday(currentScheduleDate)
        }
        const taskDate = new Date(currentScheduleDate)
        currentScheduleDate.setDate(currentScheduleDate.getDate() + 1)
        if (isWeekend(currentScheduleDate)) {
          currentScheduleDate = getNextWeekday(currentScheduleDate)
        }
        scheduledDateKey = formatDateKey(taskDate)
      } else {
        const taskDate = new Date(todayLocal)
        taskDate.setDate(taskDate.getDate() + (scaledDayIndex - 1))
        scheduledDateKey = formatDateKey(taskDate)
      }

      for (const task of dayTasks) {
        const taskId = crypto.randomUUID()
        const dayNumber = Math.max(1, scaledDayIndex)

        const hasCheckpoints = task.checkpoints && Array.isArray(task.checkpoints) && task.checkpoints.length > 0
        if (!hasCheckpoints && dayNum === 1) {
          console.error(`❌ Day1 task "${task.title}" missing checkpoints!`)
        }

        const explicitDateKey = extractExplicitDateFromText(
          `${task.title} ${task.description || ""}`,
          userTimeZone
        )
        if (explicitDateKey) {
          scheduledDateKey = explicitDateKey
        } else {
          const matchedDateKey = matchTaskToDate(task, importantDateEvents)
          if (matchedDateKey) {
            scheduledDateKey = matchedDateKey
          }
        }

        const taskData: any = {
          id: taskId,
          user_id: user.id,
          goal_id: finalGoalId,
          title: task.title,
          notes: task.description || null,
          estimated_minutes: task.estimatedMinutes || 30,
          scheduled_date_key: scheduledDateKey,
          deliverable: task.deliverable || null,
          metric: task.metric || null,
          difficulty: null,
          weekly_objective: null,
          tags_csv: null,
          status: "notStarted",
          is_completed: false,
          day_number: dayNumber,
          created_at: new Date().toISOString(),
        }
        
        tasks.push(taskData)
        
        if (hasCheckpoints && task.checkpoints) {
          task.checkpoints.forEach((checkpoint: string, index: number) => {
            if (checkpoint && typeof checkpoint === 'string' && checkpoint.trim().length > 0) {
              checkpoints.push({
                id: crypto.randomUUID(),
                task_id: taskId,
                user_id: user.id,
                content: checkpoint.trim(),
                is_completed: false,
                position: index,
                created_at: new Date().toISOString(),
              })
            }
          })
        }
      }
    }

    console.log(`📝 Inserting ${tasks.length} tasks...`)
    const batchSize = 1000
    let insertedCount = 0
    
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize)
      const batchNum = Math.floor(i / batchSize) + 1
      
      const { error: taskError } = await supabase.from("task_items").insert(batch)

      if (taskError) {
        console.error(`❌ Batch ${batchNum} failed:`, taskError)
        if (i === 0) {
          return new Response(
            JSON.stringify({ 
              error: "Failed to insert tasks", 
              details: taskError.message
            }),
            { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
          )
        }
      } else {
        insertedCount += batch.length
        console.log(`✅ Batch ${batchNum}: ${batch.length} tasks`)
      }
    }
    
    console.log(`✅ Tasks inserted: ${insertedCount}/${tasks.length}`)

    if (checkpoints.length > 0) {
      console.log(`📝 Inserting ${checkpoints.length} checkpoints...`)
      const cpBatchSize = 1000
      let cpInsertedCount = 0
      
      for (let i = 0; i < checkpoints.length; i += cpBatchSize) {
        const batch = checkpoints.slice(i, i + cpBatchSize)
        
        const { error: cpError } = await supabase
          .from("task_checklist_items")
          .insert(batch)
        
        if (cpError) {
          console.warn(`⚠️ Checkpoint batch failed (non-critical)`)
        } else {
          cpInsertedCount += batch.length
        }
      }
      
      console.log(`✅ Checkpoints inserted: ${cpInsertedCount}/${checkpoints.length}`)
    }

    try {
      const convData = {
        goal_id: finalGoalId,
        user_id: user.id,
        transcript: JSON.stringify(messages),
        extracted_fields: JSON.stringify(taskPlan),
        created_at: new Date().toISOString(),
        status: "completed",
      }
      await supabase.from("conversations").upsert(convData, { onConflict: "goal_id" })
    } catch (err) {
      console.warn("⚠️ Conversation save failed (non-critical)")
    }

    console.log(`✅ Complete! Goal: ${finalGoalId}, Tasks: ${tasks.length}, Checkpoints: ${checkpoints.length}`)
    console.log(`⚡ Total processing time: ${Date.now() - startTime}ms`)
    
    return new Response(
      JSON.stringify({
        success: true,
        goalId: finalGoalId,
        tasksCount: tasks.length,
        insertedTasksCount: insertedCount,
        checkpointsCount: checkpoints.length,
        academicType: academicType || null,
        message: "Goal, tasks, and checkpoints created successfully",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    )
  } catch (error) {
    console.error("Edge function error:", error)
    const errorDetails = error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : String(error)
    
    return new Response(
      JSON.stringify({ 
        error: "Internal server error", 
        details: errorDetails,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    )
  }
})
