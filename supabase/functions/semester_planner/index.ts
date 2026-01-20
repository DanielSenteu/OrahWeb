// Edge Function: semester_planner
// SIMPLE approach: Extract dates from syllabus, place on calendar, add prep tasks
// Distributes prep tasks based on user's preferred days/week

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || ""
const OPENAI_URL = "https://api.openai.com/v1/chat/completions"

interface RequestBody {
  userId: string
  syllabusContent: string
  timezone?: string
  metadata?: {
    courseName?: string
    courseCode?: string
    semesterEndDate?: string
    preferredTime?: string      // "morning" | "afternoon" | "evening" | "night"
    focusDuration?: number      // minutes per session (25, 45, 90)
    daysPerWeek?: number        // how many study days per week (1-7)
  }
}

interface ExtractedEvent {
  type: 'class' | 'tutorial' | 'lab' | 'assignment' | 'quiz' | 'midterm' | 'final' | 'project'
  title: string
  description?: string
  dayOfWeek?: string  // "Monday", "Tuesday", etc.
  time?: string       // "10:00 AM"
  date?: string       // "2025-02-14"
  dueTime?: string    // "11:59 PM"
}

interface CalendarTask {
  title: string
  description?: string
  scheduledDate: string  // YYYY-MM-DD
  estimatedMinutes: number
  eventType: string
  isPrep: boolean
}

// Simple date formatting
const formatYmd = (date: Date): string => {
  const yyyy = date.getFullYear()
  const mm = `${date.getMonth() + 1}`.padStart(2, "0")
  const dd = `${date.getDate()}`.padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

// Get today in user's timezone
const getLocalToday = (tz: string): Date => {
  const now = new Date()
  const local = new Date(now.toLocaleString("en-US", { timeZone: tz }))
  local.setHours(0, 0, 0, 0)
  return local
}

// Day of week string to number (0 = Sunday)
const dayOfWeekToNumber = (day: string): number => {
  const map: Record<string, number> = {
    sunday: 0, sun: 0,
    monday: 1, mon: 1,
    tuesday: 2, tue: 2, tues: 2,
    wednesday: 3, wed: 3,
    thursday: 4, thu: 4, thurs: 4,
    friday: 5, fri: 5,
    saturday: 6, sat: 6
  }
  return map[day.toLowerCase()] ?? -1
}

// Get all dates for a specific weekday between start and end
const getWeekdayDates = (startDate: Date, endDate: Date, dayOfWeek: number): Date[] => {
  const dates: Date[] = []
  const current = new Date(startDate)
  
  while (current.getDay() !== dayOfWeek && current <= endDate) {
    current.setDate(current.getDate() + 1)
  }
  
  while (current <= endDate) {
    dates.push(new Date(current))
    current.setDate(current.getDate() + 7)
  }
  
  return dates
}

// Get available study dates - X days per week, excluding class days
const getAvailableStudyDates = (
  startDate: Date,
  endDate: Date,
  daysPerWeek: number,
  classDays: Set<string>
): Date[] => {
  const dates: Date[] = []
  const current = new Date(startDate)
  
  // Group dates by week
  const weekMap: Map<number, Date[]> = new Map()
  
  while (current <= endDate) {
    const dateKey = formatYmd(current)
    
    // Skip class days
    if (!classDays.has(dateKey)) {
      // Calculate week number
      const weekNum = Math.floor((current.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
      
      if (!weekMap.has(weekNum)) {
        weekMap.set(weekNum, [])
      }
      weekMap.get(weekNum)!.push(new Date(current))
    }
    current.setDate(current.getDate() + 1)
  }
  
  // For each week, pick up to daysPerWeek study days (spread throughout the week)
  weekMap.forEach((weekDates) => {
    // Take up to daysPerWeek dates, spread evenly
    const count = Math.min(daysPerWeek, weekDates.length)
    if (count === 0) return
    
    if (count >= weekDates.length) {
      // Use all available days
      dates.push(...weekDates)
    } else {
      // Spread evenly across the week
      const step = weekDates.length / count
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(i * step)
        dates.push(weekDates[idx])
      }
    }
  })
  
  return dates.sort((a, b) => a.getTime() - b.getTime())
}

// Create simple work blocks based on user's preferred days/week
const createWorkBlocks = (
  availableDates: Date[],
  focusDuration: number,
  courseCode: string
): CalendarTask[] => {
  const tasks: CalendarTask[] = []
  
  // Create a simple work block for each available study date
  availableDates.forEach(date => {
    tasks.push({
      title: `Work Block: ${courseCode} (${focusDuration} min)`,
      description: `Use this time to work on assignments, review material, or prepare for upcoming quizzes/exams.`,
      scheduledDate: formatYmd(date),
      estimatedMinutes: focusDuration,
      eventType: "study",
      isPrep: true
    })
  })
  
  return tasks
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
    const { syllabusContent, metadata } = body
    const userTimeZone = body.timezone || "UTC"

    if (!syllabusContent || syllabusContent.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Syllabus content is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    // Get user preferences with defaults
    const preferredTime = metadata?.preferredTime || "afternoon"
    const focusDuration = metadata?.focusDuration || 45
    const daysPerWeek = metadata?.daysPerWeek || 3

    console.log("🎓 Semester Planner: Extracting events from syllabus...")

    // Step 1: Use AI to extract events from syllabus
    const extractionPrompt = `You are a syllabus parser. Extract ALL events from this syllabus.

SYLLABUS:
${syllabusContent}

Extract the course information and ALL events into this JSON format. Be VERY precise with dates and times.

{
  "courseName": "The full course name (e.g., 'Introduction to Artificial Intelligence')",
  "courseCode": "The course code (e.g., 'CMPT 310', 'CS 101', 'MATH 200')",
  "semesterEndDate": "YYYY-MM-DD (last day of classes or final exam date)",
  "events": [
    {
      "type": "class|tutorial|lab|assignment|quiz|midterm|final|project",
      "title": "Event name/title",
      "description": "Any details from syllabus",
      "dayOfWeek": "Monday (for recurring events like classes)",
      "time": "10:00 AM (start time if mentioned)",
      "date": "YYYY-MM-DD (for one-time events)",
      "dueTime": "11:59 PM (for assignments)"
    }
  ]
}

CRITICAL RULES:
1. courseName and courseCode MUST be extracted from the syllabus. Look for course titles, codes like "CMPT 310", "CS 101", etc.

2. For RECURRING events (class, tutorial, lab):
   - Set "dayOfWeek" (e.g., "Monday", "Wednesday")
   - Set "time" if mentioned
   - Do NOT set "date"

3. For ONE-TIME events (assignment, quiz, midterm, final, project):
   - Set "date" as YYYY-MM-DD
   - Set "dueTime" if mentioned
   - Do NOT set "dayOfWeek"

4. Extract EXACT dates from syllabus - don't guess or make up dates
5. For "Lectures: Mon/Wed 10:00" → Create TWO separate class events (one for Monday, one for Wednesday)

Return ONLY valid JSON.`

    const extractionResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You extract structured data from syllabi. Return ONLY valid JSON." },
          { role: "user", content: extractionPrompt }
        ],
        max_tokens: 4000,
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    })

    if (!extractionResponse.ok) {
      const error = await extractionResponse.text()
      console.error("❌ OpenAI extraction failed:", error)
      return new Response(
        JSON.stringify({ error: "Failed to parse syllabus", details: error }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      )
    }

    const extractionData = await extractionResponse.json()
    const extractedContent = extractionData.choices?.[0]?.message?.content

    let extracted: {
      courseName: string
      courseCode: string
      semesterEndDate: string
      events: ExtractedEvent[]
    }

    try {
      extracted = JSON.parse(extractedContent)
      console.log(`✅ Extracted ${extracted.events.length} events from syllabus`)
    } catch (e) {
      console.error("❌ Failed to parse extracted JSON:", e)
      return new Response(
        JSON.stringify({ error: "Failed to parse syllabus structure" }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      )
    }

    // Step 2: Build calendar
    const today = getLocalToday(userTimeZone)
    const currentYear = today.getFullYear()
    
    let semesterEnd: Date
    if (metadata?.semesterEndDate) {
      semesterEnd = new Date(metadata.semesterEndDate)
    } else if (extracted.semesterEndDate) {
      semesterEnd = new Date(extracted.semesterEndDate)
    } else {
      semesterEnd = new Date(today)
      semesterEnd.setMonth(semesterEnd.getMonth() + 4)
    }

    // FIX: If semester end is in the past, adjust to current/next year
    if (semesterEnd <= today) {
      // The syllabus probably has an old year - update to current or next year
      const extractedMonth = semesterEnd.getMonth()
      const todayMonth = today.getMonth()
      
      if (extractedMonth >= todayMonth) {
        // Same year is fine (e.g., today is Jan, semester ends in April)
        semesterEnd.setFullYear(currentYear)
      } else {
        // Semester end month already passed this year, use next year
        semesterEnd.setFullYear(currentYear + 1)
      }
      
      // If still in the past (edge case), default to 4 months from now
      if (semesterEnd <= today) {
        semesterEnd = new Date(today)
        semesterEnd.setMonth(semesterEnd.getMonth() + 4)
      }
      
      console.log(`📅 Adjusted semester end date to: ${formatYmd(semesterEnd)}`)
    }

    console.log(`📅 Semester: ${formatYmd(today)} to ${formatYmd(semesterEnd)}`)

    const allTasks: CalendarTask[] = []
    const classDays = new Set<string>()  // Track class days to exclude from study days

    // Helper function to fix event dates with old years
    const fixEventDate = (dateStr: string): string => {
      const eventDate = new Date(dateStr)
      if (eventDate <= today) {
        const eventMonth = eventDate.getMonth()
        const todayMonth = today.getMonth()
        
        if (eventMonth >= todayMonth) {
          eventDate.setFullYear(currentYear)
        } else {
          eventDate.setFullYear(currentYear + 1)
        }
        
        // If still in the past, it's probably within the next few days - use current year
        if (eventDate < today) {
          eventDate.setFullYear(currentYear)
        }
      }
      return formatYmd(eventDate)
    }

    // Step 3: Add FIXED events (classes, tutorials, labs, deadlines)
    for (const event of extracted.events) {
      if (event.type === 'class' || event.type === 'tutorial' || event.type === 'lab') {
        // Recurring event
        if (event.dayOfWeek) {
          const dayNum = dayOfWeekToNumber(event.dayOfWeek)
          if (dayNum >= 0) {
            const dates = getWeekdayDates(today, semesterEnd, dayNum)
            
            for (const date of dates) {
              const dateKey = formatYmd(date)
              classDays.add(dateKey)  // Track this as a class day
              
              const courseLabel = extracted.courseCode || extracted.courseName
              const eventLabel = event.type.charAt(0).toUpperCase() + event.type.slice(1)
              
              allTasks.push({
                title: `${eventLabel}: ${courseLabel}`,
                description: event.time ? `${event.time} - ${event.description || event.type + ' session'}` : (event.description || `${event.type} session`),
                scheduledDate: dateKey,
                estimatedMinutes: event.type === 'class' ? 80 : 50,
                eventType: event.type,
                isPrep: false
              })
            }
          }
        }
      } else if (event.date) {
        // One-time event (assignment due, quiz, midterm, final)
        // Fix the date if it has an old year
        const fixedDate = fixEventDate(event.date)
        
        allTasks.push({
          title: event.title,
          description: event.dueTime ? `Due: ${event.dueTime}. ${event.description || ''}` : (event.description || ''),
          scheduledDate: fixedDate,
          estimatedMinutes: event.type === 'final' ? 180 : event.type === 'midterm' ? 120 : 60,
          eventType: event.type,
          isPrep: false
        })
      }
    }

    // Step 4: Get available study days (X days per week, excluding class days)
    const availableStudyDates = getAvailableStudyDates(today, semesterEnd, daysPerWeek, classDays)

    console.log(`📚 ${availableStudyDates.length} available study dates (${daysPerWeek} days/week, excluding ${classDays.size} class days)`)

    // Step 5: Create simple work blocks for available study dates
    const courseCode = extracted.courseCode || extracted.courseName || "Course"
    const workBlocks = createWorkBlocks(availableStudyDates, focusDuration, courseCode)
    allTasks.push(...workBlocks)

    // Sort all tasks by date
    allTasks.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))

    console.log(`📝 Generated ${allTasks.length} total tasks`)

    // Step 6: Save to database
    // Goal name: "CMPT 310: Artificial Intelligence" or just "CMPT 310" if no full name
    const goalSummary = extracted.courseCode && extracted.courseName 
      ? `${extracted.courseCode}: ${extracted.courseName}`
      : (extracted.courseCode || extracted.courseName || "Semester Plan")
    const totalDays = Math.ceil((semesterEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    const { data: goal, error: goalError } = await supabase
      .from("user_goals")
      .insert({
        user_id: user.id,
        summary: goalSummary,
        total_days: totalDays,
        daily_minutes_budget: focusDuration * 2,
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

    // Create tasks (WITHOUT scheduled_time to avoid timestamp errors)
    const tasks = allTasks.map((task, index) => ({
      id: crypto.randomUUID(),
      user_id: user.id,
      goal_id: goalId,
      title: task.title,
      notes: task.description,
      estimated_minutes: task.estimatedMinutes,
      scheduled_date_key: task.scheduledDate,
      status: "notStarted",
      is_completed: false,
      day_number: index + 1,
      created_at: new Date().toISOString()
    }))

    // Insert tasks in batches
    const batchSize = 500
    let insertedCount = 0

    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize)
      const { error: taskError } = await supabase.from("task_items").insert(batch)
      
      if (taskError) {
        console.error(`❌ Task batch failed:`, taskError)
      } else {
        insertedCount += batch.length
      }
    }

    console.log(`✅ Inserted ${insertedCount}/${tasks.length} tasks`)
    console.log(`⚡ Total time: ${Date.now() - startTime}ms`)

    return new Response(
      JSON.stringify({
        success: true,
        goalId,
        courseName: extracted.courseName,
        courseCode: extracted.courseCode,
        eventsExtracted: extracted.events.length,
        tasksCreated: insertedCount,
        semesterStart: formatYmd(today),
        semesterEnd: formatYmd(semesterEnd)
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
