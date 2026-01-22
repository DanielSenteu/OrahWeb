// Edge Function: assignment_helper
// Creates efficient, specific task breakdown for assignment completion
// No filler - just actionable steps based on assignment type

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || ""
const OPENAI_URL = "https://api.openai.com/v1/chat/completions"

interface RequestBody {
  userId: string
  assignmentContent: string
  dueDate: string          // YYYY-MM-DD
  hoursPerDay: number      // How many hours per day user can work
  timezone?: string
}

interface TaskBreakdown {
  goalSummary: string
  assignmentType: string   // "essay", "math", "research", "project", "coding", etc.
  totalDays: number
  dailyTasks: Array<{
    dayNumber: number
    title: string
    description: string
    estimatedMinutes: number
    deliverable: string
    checkpoints: string[]
  }>
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

const getLocalToday = (tz: string): Date => {
  const now = new Date()
  const local = new Date(now.toLocaleString("en-US", { timeZone: tz }))
  local.setHours(0, 0, 0, 0)
  return local
}

// Parse YYYY-MM-DD date string as midnight in user's timezone (not UTC)
// This prevents dates from shifting by -1 day due to UTC conversion
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
  
  // Create a date at noon UTC (avoids DST edge cases)
  const utcNoon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0))
  
  // Check if date is valid
  if (isNaN(utcNoon.getTime())) {
    throw new Error(`Invalid date created from: ${dateStr}`)
  }
  
  try {
    // Get what UTC noon represents in the user's timezone
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
    
    // Calculate offset: if UTC noon = 4 AM in user's timezone, offset is +8 hours
    // We want midnight in user's timezone, so adjust UTC by the offset
    const offsetHours = 12 - tzHour
    
    // Create UTC date that represents midnight in user's timezone
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
    const { assignmentContent, dueDate, hoursPerDay, userId } = body
    const userTimeZone = body.timezone || "UTC"

    if (!assignmentContent || !dueDate || !hoursPerDay) {
      return new Response(
        JSON.stringify({ error: "assignmentContent, dueDate, and hoursPerDay are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    console.log("📝 Assignment Helper: Creating task breakdown...")

    const today = getLocalToday(userTimeZone)
    const dueDateObj = parseLocalDate(dueDate, userTimeZone)
    const daysAvailable = daysBetween(today, dueDateObj)
    const minutesPerDay = hoursPerDay * 60

    console.log(`📅 ${daysAvailable} days until due date, ${hoursPerDay}h/day available`)

    // Step 1: Use AI to analyze assignment and create breakdown
    const breakdownPrompt = `You are an expert assignment completion strategist. Create a SHARP, EFFICIENT task breakdown for this assignment.

ASSIGNMENT:
${assignmentContent}

CONSTRAINTS:
- Due in ${daysAvailable} days (due date: ${dueDate})
- Student can work ${hoursPerDay} hours/day (${minutesPerDay} minutes)
- Today is ${formatYmd(today, userTimeZone)}

YOUR MISSION:
Analyze the assignment and create a day-by-day breakdown with SPECIFIC, ACTIONABLE tasks.

CRITICAL RULES:
1. **NO GENERIC TASKS** - Instead of "Work on essay", say "Write introduction paragraph with thesis statement"
2. **BE SPECIFIC** - Instead of "Do math problems", say "Complete problems 1-5 from Chapter 3"
3. **PROGRESSIVE** - Each day builds on the previous day's work
4. **REALISTIC** - Tasks fit within the daily time budget
5. **BUFFER TIME** - Include final review/polish day before due date

TASK TYPES BY ASSIGNMENT TYPE:

**ESSAY/PAPER:**
- Day 1: Brainstorm + create detailed outline
- Day 2-3: Write intro + body paragraphs
- Day 4: Write conclusion + first revision
- Day 5: Final polish + citations

**MATH/PROBLEM SET:**
- Day 1: Problems 1-5 (show work, check answers)
- Day 2: Problems 6-10 (show work, check answers)
- Day 3: Review all + fix mistakes

**RESEARCH PAPER:**
- Day 1: Find 8-10 sources
- Day 2: Read & annotate sources
- Day 3: Create detailed outline
- Day 4-5: Write draft sections
- Day 6: Revise + format
- Day 7: Final polish + citations

**CODING PROJECT:**
- Day 1: Set up project + plan structure
- Day 2: Implement core functionality (Feature A)
- Day 3: Implement Feature B
- Day 4: Testing + bug fixes
- Day 5: Documentation + final testing

**LAB REPORT:**
- Day 1: Organize data + create graphs
- Day 2: Write methods + results sections
- Day 3: Write intro + discussion
- Day 4: Abstract + references + final check

RETURN THIS JSON FORMAT:

{
  "goalSummary": "Assignment: [Title from assignment]",
  "assignmentType": "essay|math|research|project|coding|lab|other",
  "totalDays": ${daysAvailable},
  "dailyTasks": [
    {
      "dayNumber": 1,
      "title": "SPECIFIC task title (e.g., 'Write Introduction + Thesis Statement')",
      "description": "What to focus on and why it matters",
      "estimatedMinutes": ${minutesPerDay},
      "deliverable": "Concrete outcome (e.g., '3-paragraph intro with clear thesis')",
      "checkpoints": [
        "Specific action step 1 (10-15 min)",
        "Specific action step 2 (10-15 min)",
        "Specific action step 3 (10-15 min)",
        "Specific action step 4 (10-15 min)"
      ]
    },
    {
      "dayNumber": 2,
      "title": "...",
      ...
    },
    ...
    {
      "dayNumber": ${daysAvailable},
      "title": "Final Review & Submit",
      "description": "Last check before submission",
      "estimatedMinutes": 30,
      "deliverable": "Assignment submitted on time",
      "checkpoints": [
        "Read through entire assignment one last time",
        "Check all requirements are met",
        "Verify format and file type",
        "Submit and celebrate!"
      ]
    }
  ]
}

CRITICAL:
- Create tasks for EVERY day from day 1 to day ${daysAvailable}
- Make each task SPECIFIC to the assignment content
- NO vague tasks like "work on assignment" or "continue working"
- Each task should have a CLEAR deliverable
- Checkpoints should be actionable (15-20 min each)
- Last day should be light (final check + submit)

Analyze the assignment content and return ONLY valid JSON with the task breakdown.`

    const breakdownResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an expert at breaking down assignments into specific, actionable tasks. Return ONLY valid JSON." },
          { role: "user", content: breakdownPrompt }
        ],
        max_tokens: 4000,
        temperature: 0.3,
        response_format: { type: "json_object" }
      })
    })

    if (!breakdownResponse.ok) {
      const error = await breakdownResponse.text()
      console.error("❌ OpenAI breakdown failed:", error)
      return new Response(
        JSON.stringify({ error: "Failed to create task breakdown", details: error }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      )
    }

    const breakdownData = await breakdownResponse.json()
    const breakdownContent = breakdownData.choices?.[0]?.message?.content

    let breakdown: TaskBreakdown

    try {
      breakdown = JSON.parse(breakdownContent)
      console.log(`✅ Created ${breakdown.dailyTasks.length} tasks for ${breakdown.assignmentType} assignment`)
    } catch (e) {
      console.error("❌ Failed to parse breakdown JSON:", e)
      return new Response(
        JSON.stringify({ error: "Failed to parse task breakdown" }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      )
    }

    // Step 2: Save to database
    const { data: goal, error: goalError } = await supabase
      .from("user_goals")
      .insert({
        user_id: user.id,
        summary: breakdown.goalSummary,
        total_days: breakdown.totalDays,
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
    console.log(`✅ Goal created: ${goalId}`)

    // Create tasks with dates
    const tasks: any[] = []
    const checkpoints: any[] = []

    // Get today's date as simple YYYY-MM-DD string - NO timezone conversions
    const todayStr = getTodayString()
    console.log(`📅 TODAY: ${todayStr} (simple date, no timezone conversion)`)
    
    breakdown.dailyTasks.forEach((task, index) => {
      // Simple date calculation: dayNumber 1 = today, dayNumber 2 = today + 1, etc.
      let dateKey: string
      if (task.dayNumber === 1) {
        // Day 1 = today, use directly
        dateKey = todayStr
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

      // Add checkpoints
      if (task.checkpoints && task.checkpoints.length > 0) {
        task.checkpoints.forEach((checkpoint, cpIndex) => {
          checkpoints.push({
            id: crypto.randomUUID(),
            task_id: taskId,
            user_id: user.id,
            content: checkpoint,
            is_completed: false,
            position: cpIndex,
            created_at: new Date().toISOString()
          })
        })
      }
    })

    // Insert tasks
    const { error: taskError } = await supabase.from("task_items").insert(tasks)
    if (taskError) {
      console.error("❌ Task creation failed:", taskError)
      return new Response(
        JSON.stringify({ error: "Failed to create tasks", details: taskError.message }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      )
    }

    // Insert checkpoints
    if (checkpoints.length > 0) {
      await supabase.from("task_checklist_items").insert(checkpoints)
    }

    console.log(`✅ Created ${tasks.length} tasks with ${checkpoints.length} checkpoints`)
    console.log(`⚡ Total time: ${Date.now() - startTime}ms`)

    return new Response(
      JSON.stringify({
        success: true,
        goalId,
        assignmentType: breakdown.assignmentType,
        tasksCreated: tasks.length,
        checkpointsCreated: checkpoints.length,
        daysUntilDue: daysAvailable
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
