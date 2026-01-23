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

// Simple date formatting - NO timezone conversions, just get YYYY-MM-DD
const formatYmd = (date: Date): string => {
  const yyyy = date.getFullYear()
  const mm = `${date.getMonth() + 1}`.padStart(2, "0")
  const dd = `${date.getDate()}`.padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

// Get today's date as YYYY-MM-DD string - simple, no timezone conversions
const getTodayString = (): string => {
  const now = new Date()
  return formatYmd(now)
}

// Simple date parsing - just parse YYYY-MM-DD to Date object, NO timezone conversions
const parseDateString = (dateStr: string): Date => {
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
  
  // Simple date creation - no timezone conversion
  const date = new Date(year, month - 1, day)
  
  // Validate
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date created from: ${dateStr}`)
  }
  
  return date
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

// Simple date arithmetic - add days to YYYY-MM-DD string
const addDaysToDateString = (dateStr: string, days: number): string => {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day + days)
  return formatYmd(date)
}

// Get all dates for a specific weekday between start and end
// Returns dates as YYYY-MM-DD strings - simple, no timezone conversions
const getWeekdayDates = (startStr: string, endStr: string, dayOfWeek: number): string[] => {
  const dates: string[] = []
  const [startYear, startMonth, startDay] = startStr.split('-').map(Number)
  
  // Start from the start date
  let currentDate = new Date(startYear, startMonth - 1, startDay)
  
  // Find first occurrence of the target weekday
  while (currentDate.getDay() !== dayOfWeek && formatYmd(currentDate) <= endStr) {
    currentDate.setDate(currentDate.getDate() + 1)
  }
  
  // Collect all occurrences (every 7 days)
  let currentStr = formatYmd(currentDate)
  while (currentStr <= endStr) {
    dates.push(currentStr)
    currentDate.setDate(currentDate.getDate() + 7)
    currentStr = formatYmd(currentDate)
  }
  
  return dates
}

// Get available study dates - X days per week, excluding class days
// Returns date strings (YYYY-MM-DD), simple, no timezone conversions
const getAvailableStudyDates = (
  startStr: string,
  endStr: string,
  daysPerWeek: number,
  classDays: Set<string>
): string[] => {
  const dates: string[] = []
  const startDate = parseDateString(startStr)
  const endDate = parseDateString(endStr)
  const current = new Date(startDate)
  
  // Group dates by week
  const weekMap: Map<number, string[]> = new Map()
  
  while (current <= endDate) {
    const dateKey = formatYmd(current)
    
    // Skip class days
    if (!classDays.has(dateKey)) {
      // Calculate week number
      const weekNum = Math.floor((current.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
      
      if (!weekMap.has(weekNum)) {
        weekMap.set(weekNum, [])
      }
      weekMap.get(weekNum)!.push(dateKey)
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
  
  return dates.sort()
}

// Create simple work blocks based on user's preferred days/week
const createWorkBlocks = (
  availableDates: string[],
  focusDuration: number,
  courseCode: string
): CalendarTask[] => {
  const tasks: CalendarTask[] = []
  
  // Create a simple work block for each available study date (already YYYY-MM-DD strings)
  availableDates.forEach(dateStr => {
    tasks.push({
      title: `Work Block: ${courseCode} (${focusDuration} min)`,
      description: `Use this time to work on assignments, review material, or prepare for upcoming quizzes/exams.`,
      scheduledDate: dateStr,
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

    // Get today as simple date string - NO timezone conversions
    const todayStr = getTodayString()
    const todayDate = parseDateString(todayStr)
    const currentYear = todayDate.getFullYear()
    const currentMonth = todayDate.getMonth() + 1 // 1-12

    // Step 1: Use AI to extract events from syllabus
    const extractionPrompt = `You are a syllabus parser. Extract ALL events from this syllabus.

SYLLABUS:
${syllabusContent}

CURRENT DATE CONTEXT:
- Today is ${todayStr}
- Current year: ${currentYear}
- Current month: ${currentMonth}

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
      "dayOfWeek": "Monday (for recurring events like classes, tutorials, labs)",
      "time": "10:00 AM (start time if mentioned, or 'TBD' if not specified)",
      "date": "YYYY-MM-DD (for one-time events - MUST include full year)",
      "dueTime": "11:59 PM (for assignments)"
    }
  ]
}

CRITICAL RULES FOR DATE EXTRACTION:
1. courseName and courseCode MUST be extracted from the syllabus. Look for course titles, codes like "CMPT 310", "CS 101", etc.

2. For RECURRING events (class, tutorial, lab):
   - MANDATORY: Set "dayOfWeek" (e.g., "Monday", "Wednesday", "Friday") - this is REQUIRED
   - Set "time" if mentioned (e.g., "11:30 AM", "10:30 AM"), or "TBD" if time is not specified
   - Do NOT set "date" for recurring events
   - FOR CLASSES: Look ONLY in the "Lectures:" or "Class Times:" section. Ignore mentions of days in other contexts (like "No class on Monday" or "Monday is a holiday"). Extract ONLY the days listed in the official lecture schedule.
   - LABS: Labs can be recurring (need dayOfWeek) OR one-time (need date). If syllabus says "Labs: Monday" or "Lab sessions: W 2:00 PM", extract as recurring with dayOfWeek. If it says "Lab 1: Jan 28" or "Lab on Feb 4", extract as one-time with date.
   - If a lab has NO dayOfWeek AND NO date, DO NOT include it in events (skip it)

3. For ONE-TIME events (assignment, quiz, midterm, final, project):
   - MANDATORY: Set "date" as YYYY-MM-DD with FULL YEAR (e.g., "2025-01-28", "2025-02-04")
   - For dates like "W Jan. 28" or "Jan. 28": Convert to "YYYY-01-28" (use ${currentYear} if month >= ${currentMonth}, otherwise ${currentYear + 1})
   - For dates like "Feb. 4" or "W Feb. 4": Convert to "YYYY-02-04" (use ${currentYear} if month >= ${currentMonth}, otherwise ${currentYear + 1})
   - For dates like "Mar. 11" or "W Mar. 11": Convert to "YYYY-03-11" (use ${currentYear} if month >= ${currentMonth}, otherwise ${currentYear + 1})
   - For dates like "Apr. 8" or "W Apr. 8": Convert to "YYYY-04-08" (use ${currentYear} if month >= ${currentMonth}, otherwise ${currentYear + 1})
   - Set "dueTime" if mentioned (e.g., "5:30 PM")
   - Do NOT set "dayOfWeek" for one-time events
   - If date is "TBA" or "TBD", DO NOT include the event (skip finals/exams with TBA dates)

4. DATE CONVERSION EXAMPLES:
   - "W Jan. 28" → "2025-01-28" (if current month is Jan or earlier) or "2026-01-28" (if current month is after Jan)
   - "Feb. 4" → "2025-02-04" (if current month is Feb or earlier) or "2026-02-04" (if current month is after Feb)
   - "W Mar. 4" → "2025-03-04" (if current month is Mar or earlier) or "2026-03-04" (if current month is after Mar)
   - "W Apr. 8" → "2025-04-08" (if current month is Apr or earlier) or "2026-04-08" (if current month is after Apr)

5. DAY OF WEEK ABBREVIATIONS (CRITICAL - use these mappings):
   - M/Mon = Monday
   - T/Tue/Tues = Tuesday
   - W/Wed = Wednesday
   - R/Thu/Thurs = Thursday
   - F/Fri = Friday
   - S/Sat = Saturday
   - U/Sun = Sunday
   
   IMPORTANT: When you see "W" it ALWAYS means Wednesday, NOT Monday. When you see "F" it ALWAYS means Friday.
   Example: "Lectures: W 11:30am, F 10:30am" means Wednesday AND Friday, NOT Monday and Wednesday.

6. PRIORITIZE LECTURE SCHEDULE SECTION:
   - Look for sections titled "Lectures:", "Class Times:", "Schedule:", or similar
   - Extract class days ONLY from the official lecture schedule, not from other mentions
   - If syllabus says "Lectures: W 11:30am - 12:20pm, F 10:30am - 12:20pm", extract:
     * One class event: dayOfWeek: "Wednesday", time: "11:30 AM"
     * One class event: dayOfWeek: "Friday", time: "10:30 AM"
   - Do NOT extract Monday if the lecture schedule says "W" (Wednesday) and "F" (Friday)

7. For "Labs: Monday 2:00 PM" or "Lab sessions: W 2:00 PM" → Create lab event with:
   - type: "lab"
   - dayOfWeek: "Monday" or "Wednesday" (using abbreviation mapping above)
   - time: "2:00 PM"

8. For "Lab 1: Jan 28" or "Lab on Feb 4" → Create lab event with:
   - type: "lab"
   - date: "YYYY-01-28" or "YYYY-02-04"
   - Do NOT set dayOfWeek

9. MONTH ABBREVIATIONS:
   - Jan/Jan. = January (01)
   - Feb/Feb. = February (02)
   - Mar/Mar. = March (03)
   - Apr/Apr. = April (04)
   - May/May. = May (05)
   - Jun/Jun. = June (06)
   - Jul/Jul. = July (07)
   - Aug/Aug. = August (08)
   - Sep/Sept/Sep. = September (09)
   - Oct/Oct. = October (10)
   - Nov/Nov. = November (11)
   - Dec/Dec. = December (12)

10. VALIDATION: Every event MUST have either:
    - (dayOfWeek) for recurring events, OR
    - (date) for one-time events
    If an event has neither, DO NOT include it.

11. DOUBLE-CHECK CLASS DAYS:
    - After extracting class events, verify you used the correct days from the lecture schedule
    - If the syllabus says "W" and "F", you MUST extract "Wednesday" and "Friday", NOT "Monday" and "Wednesday"
    - If you see "Lectures: W 11:30am, F 10:30am", the correct extraction is:
      * dayOfWeek: "Wednesday" (NOT Monday)
      * dayOfWeek: "Friday" (NOT Wednesday)
    - Common mistake: "W" does NOT mean Monday. "W" = Wednesday, "F" = Friday, "M" = Monday

12. FINAL VALIDATION CHECKLIST (MUST COMPLETE BEFORE RETURNING JSON):
    - [ ] Did I extract class days ONLY from the "Lectures:" or "Class Times:" section?
    - [ ] If the syllabus shows "W" (Wednesday abbreviation), did I extract "Wednesday" (NOT "Monday")?
    - [ ] If the syllabus shows "F" (Friday abbreviation), did I extract "Friday" (NOT "Wednesday")?
    - [ ] If I see "W" and "F" together, did I extract "Wednesday" and "Friday" (NOT "Monday" and "Wednesday")?
    - [ ] Did I ignore mentions of days in other contexts (like "No class on Monday")?
    
    CRITICAL: If you extracted "Monday" when the syllabus says "W", you made an error. "W" = Wednesday, always.

Return ONLY valid JSON with ALL dates in YYYY-MM-DD format.`

    const extractionResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-2024-11-20",
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
      console.log(`📋 Course: ${extracted.courseCode} - ${extracted.courseName}`)
      
      // Log extracted events for debugging
      extracted.events.forEach((event, idx) => {
        if (event.type === 'class' || event.type === 'tutorial' || event.type === 'lab') {
          console.log(`  Event ${idx + 1}: ${event.type} - ${event.dayOfWeek} ${event.time || ''}`)
        } else {
          console.log(`  Event ${idx + 1}: ${event.type} - ${event.date || 'NO DATE'} - ${event.title}`)
        }
      })
      
      // VALIDATION: Check for common day extraction errors
      const classEvents = extracted.events.filter(e => e.type === 'class' && e.dayOfWeek)
      if (classEvents.length >= 2) {
        const days = classEvents.map(e => e.dayOfWeek?.toLowerCase() || '')
        const hasMonday = days.includes('monday')
        const hasWednesday = days.includes('wednesday')
        const hasFriday = days.includes('friday')
        
        // If we see Monday + Wednesday but no Friday, this might be wrong (should be Wednesday + Friday)
        if (hasMonday && hasWednesday && !hasFriday) {
          console.warn(`⚠️  WARNING: Extracted Monday + Wednesday for classes. If syllabus says "W" and "F", this should be Wednesday + Friday!`)
          console.warn(`    Check the syllabus - "W" = Wednesday, "F" = Friday, NOT Monday + Wednesday`)
        }
      }
    } catch (e) {
      console.error("❌ Failed to parse extracted JSON:", e)
      return new Response(
        JSON.stringify({ error: "Failed to parse syllabus structure" }),
        { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      )
    }

    // Step 2: Build calendar - work with date strings, NO timezone conversions
    let semesterEndStr: string
    if (metadata?.semesterEndDate) {
      semesterEndStr = metadata.semesterEndDate
    } else if (extracted.semesterEndDate) {
      semesterEndStr = extracted.semesterEndDate
    } else {
      // Default to 4 months from today
      const endDate = new Date(todayDate)
      endDate.setMonth(endDate.getMonth() + 4)
      semesterEndStr = formatYmd(endDate)
    }

    // FIX: If semester end is in the past, adjust to current/next year
    const semesterEndDate = parseDateString(semesterEndStr)
    if (semesterEndDate <= todayDate) {
      // The syllabus probably has an old year - update to current or next year
      const [endYear, endMonth, endDay] = semesterEndStr.split('-').map(Number)
      const extractedMonth = endMonth
      const todayMonth = todayDate.getMonth() + 1
      
      let newYear = currentYear
      if (extractedMonth < todayMonth) {
        // Semester end month already passed this year, use next year
        newYear = currentYear + 1
      }
      
      semesterEndStr = `${newYear}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
      
      // If still in the past (edge case), default to 4 months from now
      const checkDate = parseDateString(semesterEndStr)
      if (checkDate <= todayDate) {
        const endDate = new Date(todayDate)
        endDate.setMonth(endDate.getMonth() + 4)
        semesterEndStr = formatYmd(endDate)
      }
      
      console.log(`📅 Adjusted semester end date to: ${semesterEndStr}`)
    }

    console.log(`📅 Semester: ${todayStr} to ${semesterEndStr}`)

    const allTasks: CalendarTask[] = []
    const classDays = new Set<string>()  // Track class days to exclude from study days

    // Helper function to fix event dates with old years - simple, no timezone
    const fixEventDate = (dateStr: string): string => {
      if (!dateStr || typeof dateStr !== 'string' || dateStr.trim() === '') {
        console.warn(`Invalid date string in fixEventDate: ${dateStr}`)
        return todayStr // Fallback to today
      }
      
      try {
        const eventDate = parseDateString(dateStr)
        if (eventDate <= todayDate) {
          const [year, month, day] = dateStr.split('-').map(Number)
          const eventMonth = month
          const todayMonth = todayDate.getMonth() + 1
          
          let newYear = currentYear
          if (eventMonth < todayMonth) {
            newYear = currentYear + 1
          }
          
          const fixedStr = `${newYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          
          // If still in the past, use current year
          const checkDate = parseDateString(fixedStr)
          if (checkDate < todayDate) {
            return `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          }
          
          return fixedStr
        }
        return dateStr
      } catch (error) {
        console.error(`Error fixing event date ${dateStr}:`, error)
        // Fallback: return today's date
        return todayStr
      }
    }

    // Step 3: Add FIXED events (classes, tutorials, labs, deadlines)
    for (const event of extracted.events) {
      if (event.type === 'class' || event.type === 'tutorial' || event.type === 'lab') {
        // Recurring event - MUST have dayOfWeek
        if (event.dayOfWeek) {
          const dayNum = dayOfWeekToNumber(event.dayOfWeek)
          if (dayNum >= 0) {
            const dateStrings = getWeekdayDates(todayStr, semesterEndStr, dayNum)
            
            for (const dateKey of dateStrings) {
              classDays.add(dateKey)  // Track this as a class day
              
              const courseLabel = extracted.courseCode || extracted.courseName
              const eventLabel = event.type.charAt(0).toUpperCase() + event.type.slice(1)
              
              // Handle TBD times - show clearer description
              let timeDesc = ''
              if (event.time && event.time.toUpperCase() !== 'TBD') {
                timeDesc = `${event.time} - `
              } else if (event.time && event.time.toUpperCase() === 'TBD') {
                timeDesc = 'Time TBD - '
              }
              
              allTasks.push({
                title: `${eventLabel}: ${courseLabel}`,
                description: timeDesc + (event.description || `${event.type} session`),
                scheduledDate: dateKey,
                estimatedMinutes: event.type === 'class' ? 80 : 50,
                eventType: event.type,
                isPrep: false
              })
            }
          } else {
            console.warn(`  ✗ Invalid dayOfWeek "${event.dayOfWeek}" for ${event.type}: ${event.title}`)
          }
        } else if (event.date) {
          // Lab might be one-time event with a date instead of recurring
          if (typeof event.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
            try {
              const fixedDate = fixEventDate(event.date)
              console.log(`  ✓ Added ${event.type}: ${event.title} on ${fixedDate}`)
              
              allTasks.push({
                title: event.title,
                description: event.description || `${event.type} session`,
                scheduledDate: fixedDate,
                estimatedMinutes: 50,
                eventType: event.type,
                isPrep: false
              })
            } catch (error) {
              console.error(`  ✗ Error processing ${event.type} date ${event.date} for ${event.title}:`, error)
            }
          } else {
            console.warn(`  ✗ ${event.type} "${event.title}" has invalid date format: "${event.date}". Expected YYYY-MM-DD.`)
          }
        } else {
          // Recurring event with no dayOfWeek and no date - skip it
          console.warn(`  ✗ ${event.type} "${event.title}" has no dayOfWeek (for recurring) or date (for one-time) - skipping`)
        }
      } else if (event.date) {
        // One-time event (assignment due, quiz, midterm, final)
        // Fix the date if it has an old year
        // Validate date format (should be YYYY-MM-DD)
        if (typeof event.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
          try {
            const fixedDate = fixEventDate(event.date)
            
            console.log(`  ✓ Added ${event.type}: ${event.title} on ${fixedDate}`)
            
            allTasks.push({
              title: event.title,
              description: event.dueTime ? `Due: ${event.dueTime}. ${event.description || ''}` : (event.description || ''),
              scheduledDate: fixedDate,
              estimatedMinutes: event.type === 'final' ? 180 : event.type === 'midterm' ? 120 : 60,
              eventType: event.type,
              isPrep: false
            })
          } catch (error) {
            console.error(`  ✗ Error processing event date ${event.date} for ${event.title}:`, error)
            // Skip this event if date parsing fails
          }
        } else {
          console.warn(`  ✗ Invalid date format for event "${event.title}": "${event.date}". Expected YYYY-MM-DD format.`)
          console.warn(`    Event type: ${event.type}, Full event:`, JSON.stringify(event, null, 2))
          // Skip this event if date format is invalid
        }
      } else {
        console.warn(`  ✗ Event "${event.title}" (type: ${event.type}) has no date or dayOfWeek - skipping`)
      }
    }

    // Step 4: Get available study days (X days per week, excluding class days)
    const availableStudyDates = getAvailableStudyDates(todayStr, semesterEndStr, daysPerWeek, classDays)

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
    const totalDays = Math.ceil((semesterEndDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))

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
        semesterStart: todayStr,
        semesterEnd: semesterEndStr
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
