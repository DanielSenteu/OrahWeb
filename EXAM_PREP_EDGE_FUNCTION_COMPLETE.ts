// Edge Function: exam_prep
// Enhanced version with document support, topic extraction, and deadline-aware planning
// Creates topic-based study plan with references to uploaded notes

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || ""
const OPENAI_URL = "https://api.openai.com/v1/chat/completions"

interface RequestBody {
  userId: string
  courseName: string
  totalChapters: number
  weakChapters?: string
  weakTopics?: string
  hoursPerDay: number
  examDate: string
  studyMaterials?: string
  documents?: Array<{
    name: string
    type: string
    text: string
  }>
  examId?: string  // Optional: if provided, store topics in course_exams table
  timezone?: string
}

interface StudyTask {
  dayNumber: number
  title: string
  description: string
  estimatedMinutes: number
  deliverable: string
  chapter: string
  topic?: string  // Specific topic from documents
  taskType: string
  checkpoints: string[]
}

// Date utility functions
const formatYmd = (date: Date, tz?: string): string => {
  if (tz) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    })
    return formatter.format(date)
  }
  const yyyy = date.getFullYear()
  const mm = `${date.getMonth() + 1}`.padStart(2, "0")
  const dd = `${date.getDate()}`.padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

const addDaysToDateString = (dateStr: string, days: number): string => {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day + days)
  const yyyy = date.getFullYear()
  const mm = `${date.getMonth() + 1}`.padStart(2, "0")
  const dd = `${date.getDate()}`.padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

const getTodayString = (): string => {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = `${now.getMonth() + 1}`.padStart(2, "0")
  const dd = `${now.getDate()}`.padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

const parseLocalDate = (dateStr: string, tz: string): Date => {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new Error(`Invalid date string: ${dateStr}`)
  }
  
  const parts = dateStr.split('-')
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD`)
  }
  
  const [year, month, day] = parts.map(Number)
  
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
    
    if (isNaN(result.getTime())) {
      throw new Error(`Invalid date result from: ${dateStr}`)
    }
    
    return result
  } catch (error) {
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

// Extract topics from combined notes using OpenAI
async function extractTopics(combinedNotes: string): Promise<string[]> {
  try {
    const topicExtractionPrompt = `Extract all major topics and concepts from the following study materials. Return a JSON array of unique topic names.

Study Materials:
${combinedNotes}

Requirements:
- Extract 5-15 distinct topics
- Each topic should be a specific concept or subject area
- Topics should be clear and actionable (e.g., "Recursion", "Binary Search Trees", "Sorting Algorithms")
- Avoid generic terms like "Introduction" or "Overview"
- Return ONLY a JSON array: ["Topic 1", "Topic 2", "Topic 3", ...]

Example output:
["Recursion", "Binary Search Trees", "Graph Algorithms", "Dynamic Programming", "Sorting Algorithms"]`

    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You extract topics from study materials. Return ONLY a valid JSON array." },
          { role: "user", content: topicExtractionPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 500,
      })
    })

    if (!response.ok) {
      console.warn("⚠️ Topic extraction failed, continuing without topics")
      return []
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || "{}"
    
    try {
      const parsed = JSON.parse(content)
      // Handle both {topics: [...]} and [...] formats
      const topics = Array.isArray(parsed) ? parsed : (parsed.topics || parsed.topics_array || [])
      
      if (Array.isArray(topics) && topics.length > 0) {
        return topics.filter((t: any) => typeof t === 'string' && t.trim().length > 0)
      }
    } catch (e) {
      console.warn("⚠️ Failed to parse topics, continuing without topics")
    }
    
    return []
  } catch (error) {
    console.warn("⚠️ Topic extraction error:", error)
    return []
  }
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
    const { 
      courseName, 
      totalChapters, 
      weakChapters, 
      weakTopics, 
      hoursPerDay, 
      examDate, 
      studyMaterials,
      documents = [],
      examId
    } = body
    const userTimeZone = body.timezone || "UTC"

    if (!courseName || !totalChapters || !hoursPerDay || !examDate) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    console.log("📚 Exam Prep: Creating study plan with document support...")

    // Combine all study materials
    const allNotes = [
      studyMaterials || '',
      ...documents.map(d => d.text || '').filter(Boolean)
    ].filter(Boolean).join('\n\n---\n\n')

    console.log(`📄 Combined ${documents.length} documents with study materials (${allNotes.length} chars)`)

    // Extract topics from combined notes
    let extractedTopics: string[] = []
    if (allNotes && allNotes.length > 100) {
      console.log("🔍 Extracting topics from study materials...")
      extractedTopics = await extractTopics(allNotes)
      console.log(`✅ Extracted ${extractedTopics.length} topics:`, extractedTopics)
    }

    // Store topics in exam record if examId provided
    if (examId && extractedTopics.length > 0) {
      try {
        const { error: updateError } = await supabase
          .from('course_exams')
          .update({ topics: extractedTopics })
          .eq('id', examId)
          .eq('user_id', user.id)

        if (updateError) {
          console.warn("⚠️ Failed to update exam topics:", updateError)
        } else {
          console.log("✅ Stored topics in exam record")
        }
      } catch (error) {
        console.warn("⚠️ Error storing topics:", error)
      }
    }

    // Save documents to exam_documents table if examId provided
    if (examId && documents.length > 0) {
      try {
        const documentsToInsert = documents.map(doc => ({
          exam_id: examId,
          user_id: user.id,
          document_name: doc.name || 'Untitled',
          document_type: doc.type === 'application/pdf' ? 'pdf' : 
                        doc.type?.startsWith('image/') ? 'image' : 'text',
          extracted_text: doc.text || '',
          topics: extractedTopics, // Store all topics for now
        }))

        const { error: docError } = await supabase
          .from('exam_documents')
          .insert(documentsToInsert)

        if (docError) {
          console.warn("⚠️ Failed to save exam documents:", docError)
        } else {
          console.log(`✅ Saved ${documents.length} documents to exam_documents`)
        }
      } catch (error) {
        console.warn("⚠️ Error saving documents:", error)
      }
    }

    const today = getLocalToday(userTimeZone)
    const examDateObj = parseLocalDate(examDate, userTimeZone)
    const daysAvailable = daysBetween(today, examDateObj)
    const minutesPerDay = hoursPerDay * 60

    console.log(`📅 ${daysAvailable} days until exam, ${hoursPerDay}h/day available`)

    // Build enhanced prompt with topics
    const topicsSection = extractedTopics.length > 0 
      ? `\n\nEXTRACTED TOPICS FROM YOUR NOTES:\n${extractedTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nCRITICAL: Create tasks that reference these specific topics. Use topic names in task titles and descriptions.`
      : ''

    // Create the study plan using AI
    const studyPlanPrompt = `You are an expert exam preparation strategist. Create a TOPIC-BASED study plan using the provided study materials and extracted topics.

EXAM INFO:
- Course: ${courseName}
- Total Chapters/Units to Study: ${totalChapters} (must cover ALL of them)
- Weak Chapters (need extra practice): ${weakChapters || 'None specified'}
- Weak Topics (student struggles with): ${weakTopics || 'None specified'}
- Days until exam: ${daysAvailable}
- Study time per day: ${hoursPerDay} hours (${minutesPerDay} minutes)
- Exam date: ${examDate}
${topicsSection}

STUDY MATERIALS PROVIDED BY STUDENT:
${allNotes || 'No study materials provided'}

YOUR MISSION:
Create a study plan that:
1. **Covers EVERY SINGLE ONE of the ${totalChapters} chapters** (Chapter 1, 2, 3, 4, 5... up to ${totalChapters})
2. **References specific topics from the study materials** (if topics were extracted)
3. **DEADLINE-AWARE PLANNING:**
   
   **IF ${daysAvailable} ≤ 7 days (LIMITED TIME):**
   - **COVERAGE IS PRIORITY #1** - Every chapter must appear at least once
   - Create MULTIPLE tasks per day if needed to cover all chapters
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
4. **TOPIC-BASED TASK CREATION:**
   - If topics were extracted, create tasks like "Study [Topic Name]" with references to specific notes
   - Include which documents/notes cover this topic in the description
   - Group related topics together when possible
   - Example: "Study Recursion - From your uploaded notes on algorithms, focus on recursive patterns and base cases"
5. Includes 1-2 comprehensive mock exams covering ALL chapters (if ${daysAvailable} ≥ 4 days)

TASK STRUCTURE RULES:

**IF topics were extracted:**
Use specific topic names in task titles:
- "Study ${extractedTopics[0] || 'Topic 1'} - Core Concepts"
- "Practice ${extractedTopics[1] || 'Topic 2'} Problems"
- Reference specific notes: "From your uploaded notes on [document name]..."

**IF NO topics extracted (generic mode):**
Use generic chapter numbers:
- "Chapter 1: Initial Study"
- "Chapter 2: Practice & Review"
- DO NOT invent topics

RETURN THIS JSON:

{
  "goalSummary": "Exam: ${courseName}",
  "totalDays": ${daysAvailable},
  "dailyTasks": [
    {
      "dayNumber": 1,
      "title": "${extractedTopics.length > 0 ? `Study ${extractedTopics[0]}` : 'Chapter 1: Core Concepts'}",
      "description": "First exposure - focus on understanding. ${extractedTopics.length > 0 ? 'Reference your uploaded notes on this topic.' : ''}",
      "estimatedMinutes": ${daysAvailable <= 7 ? Math.floor(minutesPerDay / 2) : minutesPerDay},
      "deliverable": "Notes + concept map${extractedTopics.length > 0 ? ` for ${extractedTopics[0]}` : ' for Chapter 1'}",
      "chapter": "Chapter 1",
      ${extractedTopics.length > 0 ? `"topic": "${extractedTopics[0]}",` : ''}
      "taskType": "learn",
      "checkpoints": [
        "Read materials and highlight key concepts",
        "Create a concept map showing how ideas connect",
        "Work through 3 example problems",
        "Summarize in your own words"
      ]
    }${daysAvailable <= 7 ? `,
    {
      "dayNumber": 1,
      "title": "${extractedTopics.length > 1 ? `Study ${extractedTopics[1]}` : 'Chapter 2: Core Concepts'}",
      "description": "Continue covering all chapters - multiple tasks per day OK with limited time",
      "estimatedMinutes": ${Math.floor(minutesPerDay / 2)},
      "deliverable": "Notes${extractedTopics.length > 1 ? ` for ${extractedTopics[1]}` : ' for Chapter 2'}",
      "chapter": "Chapter 2",
      ${extractedTopics.length > 1 ? `"topic": "${extractedTopics[1]}",` : ''}
      "taskType": "learn",
      "checkpoints": ["Read materials", "Practice problems", "Create summary"]
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
3. **If topics were extracted: Reference them in task titles and descriptions**
4. **DEADLINE-DRIVEN: If ${daysAvailable} ≤ 7 days, ensure ALL topics/chapters are covered even if it means multiple tasks per day**
5. Weak chapters (${weakChapters || 'none'}) get EXTRA practice tasks
6. Weak topics (${weakTopics || 'none'}) get MORE focused practice time
7. Include 1-2 mock exams covering ALL ${totalChapters} chapters (only if ${daysAvailable} ≥ 4 days)

**ABSOLUTE REQUIREMENT - NO EXCEPTIONS:**
- You MUST create tasks that explicitly mention EVERY chapter from 1 to ${totalChapters}
- If you only cover chapters 1-3 when totalChapters = 5, the plan is INVALID
- **With limited time (${daysAvailable} days), you MUST create multiple tasks per day if needed to cover all ${totalChapters} chapters**

Return ONLY valid JSON with the complete study plan.`

    const planResponse = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-2024-11-20",
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

    // Ensure the goal summary has "Exam:" prefix
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
    
    const todayStr = getTodayString()
    console.log(`📅 TODAY: ${todayStr}`)
    
    studyPlan.dailyTasks.forEach(task => {
      if (task.dayNumber === 1) {
        var dateKey = todayStr
      } else {
        const daysToAdd = task.dayNumber - 1
        dateKey = addDaysToDateString(todayStr, daysToAdd)
      }
      
      console.log(`  Task dayNumber ${task.dayNumber} → ${dateKey}`)

      const taskId = crypto.randomUUID()

      // Enhance task notes with topic and document references
      let enhancedNotes = task.description
      if (task.topic && documents.length > 0) {
        const relevantDocs = documents.filter(d => 
          d.text && d.text.toLowerCase().includes(task.topic!.toLowerCase())
        )
        if (relevantDocs.length > 0) {
          enhancedNotes += `\n\n📄 Relevant notes: This topic is covered in your uploaded documents: ${relevantDocs.map(d => d.name).join(', ')}`
        }
      }

      tasks.push({
        id: taskId,
        user_id: user.id,
        goal_id: goalId,
        title: task.title,
        notes: enhancedNotes,
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

    // Insert tasks
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
        examId: examId || null,
        topics: extractedTopics,
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
