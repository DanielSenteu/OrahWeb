// Edge Function: exam_prep
// Creates chapter-by-chapter study plan with priority on weak areas
// Uses spaced repetition for optimal retention

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || ""
const OPENAI_URL = "https://api.openai.com/v1/chat/completions"

interface RequestBody {
  userId: string
  courseName: string           // e.g., "CMPT 310: Artificial Intelligence"
  totalChapters: number         // Total units/chapters to study
  weakChapters: string          // e.g., "Chapters 3, 5, 7" or "Units 2 and 4"
  weakTopics: string            // e.g., "Recursion, Graph algorithms, Dynamic programming"
  hoursPerDay: number          // Study hours per day
  examDate: string             // YYYY-MM-DD
  studyMaterials?: string      // Optional: uploaded file text OR user summary
  timezone?: string
}

interface StudyTask {
  dayNumber: number
  title: string
  description: string
  estimatedMinutes: number
  deliverable: string
  chapter: string              // Which chapter/unit this task covers
  taskType: string            // "learn" | "practice" | "review" | "mock"
  checkpoints: string[]
}

const formatYmd = (date: Date): string => {
  const yyyy = date.getFullYear()
  const mm = `${date.getMonth() + 1}`.padStart(2, "0")
  const dd = `${date.getDate()}`.padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

const getLocalToday = (tz: string): Date => {
  const now = new Date()
  const local = new Date(now.toLocaleString("en-US", { timeZone: tz }))
  local.setHours(0, 0, 0, 0)
  return local
}

const daysBetween = (start: Date, end: Date): number => {
  const diffTime = end.getTime() - start.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

serve(async (req) => {
  const startTime = Date.now()
  
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
    const authHeader = req.headers.get("Authorization")!
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const body: RequestBody = await req.json()
    const { courseName, totalChapters, weakChapters, weakTopics, hoursPerDay, examDate, studyMaterials } = body
    const userTimeZone = body.timezone || "UTC"

    if (!courseName || !totalChapters || !hoursPerDay || !examDate) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    console.log("📚 Exam Prep: Creating study plan...")

    const today = getLocalToday(userTimeZone)
    const examDateObj = new Date(examDate)
    const daysAvailable = daysBetween(today, examDateObj)
    const minutesPerDay = hoursPerDay * 60

    console.log(`📅 ${daysAvailable} days until exam, ${hoursPerDay}h/day available`)

    // Create the study plan using AI
    const studyPlanPrompt = `You are an expert exam preparation strategist. Create a CHAPTER-BY-CHAPTER study plan using spaced repetition.

EXAM INFO:
- Course: ${courseName}
- Total Chapters/Units to Study: ${totalChapters} (must cover ALL of them)
- Weak Chapters (need extra practice): ${weakChapters || 'None specified'}
- Weak Topics (student struggles with): ${weakTopics || 'None specified'}
- Days until exam: ${daysAvailable}
- Study time per day: ${hoursPerDay} hours (${minutesPerDay} minutes)
- Exam date: ${examDate}

${studyMaterials ? `\nSTUDY MATERIALS PROVIDED BY STUDENT:\n${studyMaterials}\n\nCRITICAL: Use the above materials as your PRIMARY source. Extract specific topics, concepts, and problem types from these materials. Do NOT make up chapter names or topics that aren't mentioned above.\n` : '\nNO STUDY MATERIALS PROVIDED: Use generic chapter numbers only (Chapter 1, Chapter 2, etc.). Do NOT invent chapter names or specific topics.\n'}

YOUR MISSION:
Create a study plan that:
1. **Covers EVERY SINGLE ONE of the ${totalChapters} chapters** (Chapter 1, 2, 3, 4, 5... up to ${totalChapters})
   - Each chapter must appear in at least 2 tasks (learn + review)
   - Strong chapters: 2 tasks minimum
   - Weak chapters: 3+ tasks
2. Prioritizes weak chapters (${weakChapters || 'none'}) AND weak topics (${weakTopics || 'none'})
3. Uses SPACED REPETITION:
   - Days 1-50%: Learn all chapters sequentially (Chapter 1, 2, 3, 4, 5...)
   - Days 50-80%: Practice and review all chapters (focus more on weak ones)
   - Days 80-95%: Mock exams covering ALL chapters
   - Days 95-100%: Light final review
4. Has SPECIFIC tasks based on study materials (if provided)
5. Includes 1-2 comprehensive mock exams 3-4 days before real exam

TASK STRUCTURE RULES:

**IF study materials were provided:**
Use specific topics from the materials. For example:
- "Chapter 3: Binary Search Trees - Learn core concepts"
- "Chapter 3: Practice BST insertion/deletion problems"
- "Unit 2: Sorting Algorithms - Review quicksort & mergesort"

**IF NO study materials (generic mode):**
Use generic chapter numbers ONLY:
- "Chapter 1: Initial Study"
- "Chapter 1: Practice & Review"
- "Chapter 2: Initial Study"
- DO NOT invent topics like "Data Structures" or "Recursion"

**Spaced Repetition Pattern:**
- Day 1: Chapter 1 - Learn
- Day 2: Chapter 2 - Learn
- Day 3: Chapter 1 - Practice (REVIEW)
- Day 4: Chapter 3 - Learn
- Day 5: Chapter 2 - Practice (REVIEW)
- Continue this pattern

**Mock Exams:**
- Include 1-2 mock exams covering all chapters 3-4 days before exam

RETURN THIS JSON:

{
  "goalSummary": "Exam: ${courseName}",
  "totalDays": ${daysAvailable},
  "dailyTasks": [
    {
      "dayNumber": 1,
      "title": "Chapter 1: [Topic] - Core Concepts",
      "description": "First exposure - focus on understanding, not memorization",
      "estimatedMinutes": ${minutesPerDay},
      "deliverable": "Notes + concept map for Chapter 1",
      "chapter": "Chapter 1",
      "taskType": "learn",
      "checkpoints": [
        "Read Chapter 1 and highlight key concepts",
        "Create a concept map showing how ideas connect",
        "Work through 3 example problems",
        "Summarize in your own words"
      ]
    },
    {
      "dayNumber": 2,
      ...
    },
    ...
    {
      "dayNumber": ${daysAvailable - 1},
      "title": "Light Review & Mental Prep",
      "description": "Exam eve - confidence building only, no cramming",
      "estimatedMinutes": 60,
      "deliverable": "Calm, confident mindset",
      "chapter": "All",
      "taskType": "review",
      "checkpoints": [
        "Quick flip through all cheat sheets (20 min)",
        "Review formulas and key concepts (20 min)",
        "Visualize success + prepare materials (20 min)"
      ]
    },
    {
      "dayNumber": ${daysAvailable},
      "title": "EXAM DAY: ${courseName}",
      "description": "Trust your preparation!",
      "estimatedMinutes": 0,
      "deliverable": "Complete exam with confidence",
      "chapter": "Exam",
      "taskType": "exam",
      "checkpoints": [
        "Eat good breakfast and arrive early",
        "Take deep breaths before starting",
        "Read instructions carefully",
        "Trust your preparation"
      ]
    }
  ]
}

CRITICAL RULES - FOLLOW EXACTLY:
1. Create task for EVERY day (day 1 to day ${daysAvailable})
2. **MANDATORY: Cover ALL ${totalChapters} chapters from Chapter 1 to Chapter ${totalChapters}**
   - If totalChapters = 5, you MUST have tasks for: Chapter 1, Chapter 2, Chapter 3, Chapter 4, AND Chapter 5
   - Missing even ONE chapter = FAILURE
   - Every chapter gets AT LEAST one "Learn" task and one "Review" task
3. Weak chapters (${weakChapters || 'none'}) get EXTRA practice tasks (3+ reviews instead of 2)
4. Weak topics (${weakTopics || 'none'}) get MORE focused practice time - but still cover strong chapters too
5. Include 1-2 mock exams covering ALL ${totalChapters} chapters 3-4 days before real exam
6. If study materials provided: Use SPECIFIC topics from those materials ONLY
7. If NO study materials: Use generic "Chapter X" format - DO NOT invent chapter names or topics
8. Distribute learning for ALL ${totalChapters} chapters across first 50% of days
9. Second 30% of days: Practice and review for ALL chapters (prioritize weak ones)
10. Final 20%: Mock exams + final review of all chapters
11. Last day before exam = light review only (30-60 min)
12. Exam day = motivational task only

VALIDATION CHECKLIST before returning JSON:
- ✓ Chapter 1 covered? (at least 1 task)
- ✓ Chapter 2 covered? (at least 1 task)
- ✓ ...continue for ALL ${totalChapters} chapters
- ✓ Weak chapters have 3+ tasks?
- ✓ Mock exam includes ALL chapters?

Return ONLY valid JSON with the complete study plan.`

    const planResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You create specific, actionable exam study plans. Return ONLY valid JSON." },
          { role: "user", content: studyPlanPrompt }
        ],
        max_tokens: 4000,
        temperature: 0.3,
        response_format: { type: "json_object" }
      })
    })

    if (!planResponse.ok) {
      const error = await planResponse.text()
      console.error("❌ OpenAI plan creation failed:", error)
      return new Response(
        JSON.stringify({ error: "Failed to create study plan", details: error }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      )
    }

    const planData = await planResponse.json()
    const planContent = planData.choices?.[0]?.message?.content

    let studyPlan: {
      goalSummary: string
      totalDays: number
      dailyTasks: StudyTask[]
    }

    try {
      studyPlan = JSON.parse(planContent)
      console.log(`✅ Created ${studyPlan.dailyTasks.length} study tasks`)
    } catch (e) {
      console.error("❌ Failed to parse study plan JSON:", e)
      return new Response(
        JSON.stringify({ error: "Failed to parse study plan" }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      )
    }

    // Ensure the goal summary has "Exam:" prefix for proper categorization
    let goalSummary = studyPlan.goalSummary
    if (!goalSummary.toLowerCase().startsWith('exam:')) {
      goalSummary = `Exam: ${goalSummary}`
    }
    console.log(`📝 Goal summary: ${goalSummary}`)

    // Save to database
    const { data: goal, error: goalError } = await supabase
      .from("user_goals")
      .insert({
        user_id: user.id,
        summary: goalSummary,
        total_days: studyPlan.totalDays,
        daily_minutes_budget: minutesPerDay,
        domain: "academic",
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (goalError) {
      console.error("❌ Goal creation failed:", goalError)
      return new Response(
        JSON.stringify({ error: "Failed to create goal", details: goalError.message }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      )
    }

    const goalId = goal.id

    // Create tasks
    const tasks: any[] = []
    const checkpoints: any[] = []

    studyPlan.dailyTasks.forEach(task => {
      const taskDate = new Date(today)
      taskDate.setDate(taskDate.getDate() + (task.dayNumber - 1))
      const dateKey = formatYmd(taskDate)

      const taskId = crypto.randomUUID()

      tasks.push({
        id: taskId,
        user_id: user.id,
        goal_id: goalId,
        title: task.title,
        notes: task.description,
        estimated_minutes: task.estimatedMinutes,
        scheduled_date_key: dateKey,
        deliverable: task.deliverable,
        metric: null,
        status: "notStarted",
        is_completed: false,
        day_number: task.dayNumber,
        created_at: new Date().toISOString()
      })

      if (task.checkpoints && task.checkpoints.length > 0) {
        task.checkpoints.forEach((checkpoint, idx) => {
          checkpoints.push({
            id: crypto.randomUUID(),
            task_id: taskId,
            user_id: user.id,
            content: checkpoint,
            is_completed: false,
            position: idx,
            created_at: new Date().toISOString()
          })
        })
      }
    })

    // Insert
    const { error: taskError } = await supabase.from("task_items").insert(tasks)
    if (taskError) {
      console.error("❌ Task creation failed:", taskError)
    }

    if (checkpoints.length > 0) {
      await supabase.from("task_checklist_items").insert(checkpoints)
    }

    console.log(`✅ Created ${tasks.length} tasks, ${checkpoints.length} checkpoints`)
    console.log(`⚡ Total time: ${Date.now() - startTime}ms`)

    return new Response(
      JSON.stringify({
        success: true,
        goalId,
        tasksCreated: tasks.length,
        checkpointsCreated: checkpoints.length,
        daysUntilExam: daysAvailable
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    )

  } catch (error) {
    console.error("Edge function error:", error)
    return new Response(
      JSON.stringify({ 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    )
  }
})
