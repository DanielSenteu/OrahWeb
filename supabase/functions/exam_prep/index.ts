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

const formatYmd = (date: Date, tz?: string): string => {
  if (tz) {
    // Format in user's timezone
    const formatter = new Intl.DateTimeFormat("en-CA", { // en-CA gives YYYY-MM-DD format
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    })
    return formatter.format(date)
  }
  // Fallback to local timezone
  const yyyy = date.getFullYear()
  const mm = `${date.getMonth() + 1}`.padStart(2, "0")
  const dd = `${date.getDate()}`.padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

// Simple date arithmetic - add days to YYYY-MM-DD string, return YYYY-MM-DD string
// NO timezone conversions - just pure date math
const addDaysToDateString = (dateStr: string, days: number): string => {
  const [year, month, day] = dateStr.split('-').map(Number)
  // Simple date arithmetic using JavaScript Date (local time, no timezone conversion)
  const date = new Date(year, month - 1, day + days)
  const yyyy = date.getFullYear()
  const mm = `${date.getMonth() + 1}`.padStart(2, "0")
  const dd = `${date.getDate()}`.padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

// Get today's date as YYYY-MM-DD string - simple, no timezone conversions
const getTodayString = (): string => {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = `${now.getMonth() + 1}`.padStart(2, "0")
  const dd = `${now.getDate()}`.padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

// Parse YYYY-MM-DD date string as midnight in user's timezone (not UTC)
const parseLocalDate = (dateStr: string, tz: string): Date => {
  // Validate date string format
  if (!dateStr || typeof dateStr !== 'string') {
    throw new Error(`Invalid date string: ${dateStr}`)
  }
  
  const parts = dateStr.split('-')
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD`)
  }
  
  const [year, month, day] = parts.map(Number)
  
  // Validate date components
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error(`Invalid date components: ${dateStr}`)
  }
  
  if (year < 1900 || year > 2100) {
    throw new Error(`Invalid year: ${year}`)
  }
  
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}`)
  }
  
  if (day < 1 || day > 31) {
    throw new Error(`Invalid day: ${day}`)
  }
  
  const utcNoon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0))
  
  // Check if date is valid
  if (isNaN(utcNoon.getTime())) {
    throw new Error(`Invalid date created from: ${dateStr}`)
  }
  
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false
    })
    const formatParts = formatter.formatToParts(utcNoon)
    const hourPart = formatParts.find(p => p.type === 'hour')
    
    if (!hourPart) {
      throw new Error(`Could not extract hour from date: ${dateStr}`)
    }
    
    const tzHour = parseInt(hourPart.value)
    if (isNaN(tzHour)) {
      throw new Error(`Invalid hour value: ${hourPart.value}`)
    }
    
    const offsetHours = 12 - tzHour
    const result = new Date(Date.UTC(year, month - 1, day, offsetHours, 0, 0, 0))
    
    // Validate result
    if (isNaN(result.getTime())) {
      throw new Error(`Invalid date result from: ${dateStr}`)
    }
    
    return result
  } catch (error) {
    // Fallback: if timezone formatting fails, use simple UTC date
    console.warn(`Timezone formatting failed for ${dateStr}, using UTC fallback:`, error)
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
  }
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
    const examDateObj = parseLocalDate(examDate, userTimeZone)
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
   - **CRITICAL: If time is limited (≤7 days), you MUST cover ALL chapters even if it means multiple tasks per day**
   - Each chapter must appear in at least 1 task (minimum)
   - Strong chapters: 1-2 tasks
   - Weak chapters: 2-3 tasks (more if time allows)
2. Prioritizes weak chapters (${weakChapters || 'none'}) AND weak topics (${weakTopics || 'none'})
3. **ADAPTIVE STRATEGY BASED ON TIME:**
   
   **IF ${daysAvailable} ≤ 7 days (LIMITED TIME):**
   - **COVERAGE IS PRIORITY #1** - Every chapter must appear at least once
   - You can create MULTIPLE tasks per day if needed to cover all chapters
   - Day 1: Cover as many chapters as possible (e.g., Chapters 1-2, or 1-3 if time allows)
   - Day 2: Cover remaining chapters (e.g., Chapters 3-5, or 4-5)
   - Day 3+: Review weak chapters, practice problems, mock exams
   - **Example for 3 days, 5 chapters:**
     - Day 1: Chapter 1 (learn) + Chapter 2 (learn) [2 tasks if needed]
     - Day 2: Chapter 3 (learn) + Chapter 4 (learn) + Chapter 5 (learn) [3 tasks if needed]
     - Day 3: Review weak chapters + quick review all chapters
   
   **IF ${daysAvailable} > 7 days (ADEQUATE TIME):**
   - Use SPACED REPETITION:
     - Days 1-50%: Learn all chapters sequentially (Chapter 1, 2, 3, 4, 5...)
     - Days 50-80%: Practice and review all chapters (focus more on weak ones)
     - Days 80-95%: Mock exams covering ALL chapters
     - Days 95-100%: Light final review
4. Has SPECIFIC tasks based on study materials (if provided)
5. Includes 1-2 comprehensive mock exams covering ALL chapters (if ${daysAvailable} ≥ 4 days, otherwise skip or make it very short)

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

**Study Patterns:**

**For LIMITED TIME (≤7 days):**
- Day 1: Chapter 1 (learn) + Chapter 2 (learn) [multiple tasks per day OK]
- Day 2: Chapter 3 (learn) + Chapter 4 (learn) [multiple tasks per day OK]
- Day 3: Chapter 5 (learn) + Review weak chapters
- Continue covering ALL chapters, then review

**For ADEQUATE TIME (>7 days):**
- Day 1: Chapter 1 - Learn
- Day 2: Chapter 2 - Learn
- Day 3: Chapter 1 - Practice (REVIEW)
- Day 4: Chapter 3 - Learn
- Day 5: Chapter 2 - Practice (REVIEW)
- Continue spaced repetition pattern

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
      "estimatedMinutes": ${daysAvailable <= 7 ? Math.floor(minutesPerDay / 2) : minutesPerDay},
      "deliverable": "Notes + concept map for Chapter 1",
      "chapter": "Chapter 1",
      "taskType": "learn",
      "checkpoints": [
        "Read Chapter 1 and highlight key concepts",
        "Create a concept map showing how ideas connect",
        "Work through 3 example problems",
        "Summarize in your own words"
      ]
    }${daysAvailable <= 7 ? `,
    {
      "dayNumber": 1,
      "title": "Chapter 2: [Topic] - Core Concepts",
      "description": "Continue covering all chapters - multiple tasks per day OK with limited time",
      "estimatedMinutes": ${Math.floor(minutesPerDay / 2)},
      "deliverable": "Notes for Chapter 2",
      "chapter": "Chapter 2",
      "taskType": "learn",
      "checkpoints": ["..."]
    }` : ''},
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
   - **IF ${daysAvailable} ≤ 7 days: You can create MULTIPLE tasks per day to cover all chapters**
   - **IF ${daysAvailable} > 7 days: One task per day is fine**
2. **MANDATORY: Cover ALL ${totalChapters} chapters from Chapter 1 to Chapter ${totalChapters}**
   - If totalChapters = 5, you MUST have tasks for: Chapter 1, Chapter 2, Chapter 3, Chapter 4, AND Chapter 5
   - Missing even ONE chapter = FAILURE
   - **With limited time (≤7 days): Every chapter gets AT LEAST one task (can be learn OR review)**
   - **With adequate time (>7 days): Every chapter gets AT LEAST one "Learn" task and one "Review" task**
   - **NO EXCEPTIONS - ALL chapters must appear in the plan**
3. Weak chapters (${weakChapters || 'none'}) get EXTRA practice tasks (2-3+ reviews instead of 1-2)
4. Weak topics (${weakTopics || 'none'}) get MORE focused practice time - but still cover strong chapters too
   - **IMPORTANT: Emphasizing weak topics does NOT mean skipping other topics**
   - ALL topics must be covered, weak ones just get extra time
5. **TIME-SENSITIVE ADAPTATION:**
   - **If ${daysAvailable} ≤ 3 days:** Cover ALL chapters in first 2 days (multiple tasks per day), review on day 3
   - **If ${daysAvailable} = 4-7 days:** Cover ALL chapters in first ${Math.ceil(totalChapters / 2)} days, then review/practice
   - **If ${daysAvailable} > 7 days:** Use spaced repetition (learn all, then review all)
6. Include 1-2 mock exams covering ALL ${totalChapters} chapters (only if ${daysAvailable} ≥ 4 days)
7. If study materials provided: Use SPECIFIC topics from those materials ONLY
8. If NO study materials: Use generic "Chapter X" format - DO NOT invent chapter names or topics
9. **COVERAGE PRIORITY:**
   - **First priority:** Ensure EVERY chapter appears at least once
   - **Second priority:** Review weak chapters if time allows
   - **Third priority:** Spaced repetition (only if time is adequate)
10. Last day before exam = light review only (30-60 min) OR continue covering if not all chapters done
11. Exam day = motivational task only

**ABSOLUTE REQUIREMENT - NO EXCEPTIONS:**
- You MUST create tasks that explicitly mention EVERY chapter from 1 to ${totalChapters}
- If you only cover chapters 1-3 when totalChapters = 5, the plan is INVALID
- **With limited time (${daysAvailable} days), you MUST create multiple tasks per day if needed to cover all ${totalChapters} chapters**
- **Example: If ${daysAvailable} = 3 days and totalChapters = 5:**
  - Day 1: Chapter 1 task + Chapter 2 task (2 tasks)
  - Day 2: Chapter 3 task + Chapter 4 task + Chapter 5 task (3 tasks)
  - Day 3: Review weak chapters + quick review all
- Weak topics get EXTRA attention, but ALL topics must be covered
- Before returning JSON, verify: Chapter 1 ✓, Chapter 2 ✓, Chapter 3 ✓, ... Chapter ${totalChapters} ✓

VALIDATION CHECKLIST before returning JSON:
- ✓ Chapter 1 covered? (at least 1 task) - VERIFY IN JSON
- ✓ Chapter 2 covered? (at least 1 task) - VERIFY IN JSON
- ✓ Chapter 3 covered? (at least 1 task) - VERIFY IN JSON
${Array.from({length: totalChapters - 3}, (_, i) => `- ✓ Chapter ${i + 4} covered? (at least 1 task) - VERIFY IN JSON`).join('\n')}
- ✓ Chapter ${totalChapters} covered? (at least 1 task) - VERIFY IN JSON
- ✓ If ${daysAvailable} ≤ 7 days: Multiple tasks per day created to cover all chapters?
- ✓ Weak chapters have extra tasks?
- ✓ Mock exam includes ALL ${totalChapters} chapters? (if ${daysAvailable} ≥ 4 days)
- ✓ NO chapters are missing from the plan?
- ✓ ALL ${totalChapters} chapters explicitly mentioned in task titles or chapter fields?

**FINAL CHECK:** Count how many unique chapters appear in your dailyTasks. It MUST equal ${totalChapters}. If it's less, you're missing chapters - ADD THEM NOW, even if it means multiple tasks per day.

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
    
    // Get today's date as simple YYYY-MM-DD string - NO timezone conversions
    const todayStr = getTodayString()
    console.log(`📅 TODAY: ${todayStr} (simple date, no timezone conversion)`)
    
    studyPlan.dailyTasks.forEach(task => {
      // Simple date calculation: dayNumber 1 = today, dayNumber 2 = today + 1, etc.
      if (task.dayNumber === 1) {
        // Day 1 = today, use directly
        var dateKey = todayStr
      } else {
        // For day 2+, add (dayNumber - 1) days
        const daysToAdd = task.dayNumber - 1
        dateKey = addDaysToDateString(todayStr, daysToAdd)
      }
      
      console.log(`  Task dayNumber ${task.dayNumber} → ${dateKey}`)

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
