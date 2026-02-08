import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

export async function POST(req: Request) {
  try {
    const { courseId, syllabusText } = await req.json()
    
    if (!courseId || !syllabusText) {
      return NextResponse.json({ 
        error: 'courseId and syllabusText are required' 
      }, { status: 400 })
    }

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    // Initialize Supabase with auth
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Verify course exists
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, user_id, course_name, semester, year')
      .eq('id', courseId)
      .single()

    if (courseError || !course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    })

    // Extract lectures, assignments, and exams from syllabus
    const extractionPrompt = `Extract all lectures, assignments, and exams from this syllabus. Return a JSON object with this exact structure:

{
  "lectures": [
    {
      "title": "Lecture title or topic",
      "date": "YYYY-MM-DD",
      "week_number": 1
    }
  ],
  "assignments": [
    {
      "name": "Assignment name",
      "due_date": "YYYY-MM-DD",
      "description": "Brief description if available"
    }
  ],
  "exams": [
    {
      "name": "Exam name (e.g., Midterm, Final)",
      "date": "YYYY-MM-DD",
      "topics": ["topic1", "topic2"]
    }
  ]
}

Syllabus text:
${syllabusText}

Important:
- Extract ALL lectures with their dates and week numbers
- Extract ALL assignments with due dates
- Extract ALL exams (midterms, finals, quizzes) with dates
- Use the course semester/year to determine the correct year for dates
- If a date doesn't have a year, use the course year
- Return only valid JSON, no other text`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini-2024-07-18',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at extracting structured academic information from syllabi. Always return valid JSON only.',
        },
        {
          role: 'user',
          content: extractionPrompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const extractedData = JSON.parse(completion.choices[0]?.message?.content || '{}')

    // Store lectures
    if (extractedData.lectures && Array.isArray(extractedData.lectures)) {
      for (const lecture of extractedData.lectures) {
        // Check if lecture already exists
        const { data: existing } = await supabase
          .from('course_lectures')
          .select('id')
          .eq('course_id', courseId)
          .eq('title', lecture.title || `Lecture ${lecture.week_number || ''}`)
          .eq('lecture_date', lecture.date || null)
          .single()
        
        if (!existing) {
          await supabase
            .from('course_lectures')
            .insert({
              course_id: courseId,
              user_id: course.user_id,
              title: lecture.title || `Lecture ${lecture.week_number || ''}`,
              lecture_date: lecture.date || null,
              week_number: lecture.week_number || null,
              processing_status: 'pending',
            })
        }
      }
    }

    // Store assignments
    if (extractedData.assignments && Array.isArray(extractedData.assignments)) {
      for (const assignment of extractedData.assignments) {
        // Check if assignment already exists
        const { data: existing } = await supabase
          .from('course_assignments')
          .select('id')
          .eq('course_id', courseId)
          .eq('assignment_name', assignment.name)
          .single()
        
        if (!existing) {
          await supabase
            .from('course_assignments')
            .insert({
              course_id: courseId,
              user_id: course.user_id,
              assignment_name: assignment.name,
              due_date: assignment.due_date || null,
              description: assignment.description || null,
              status: 'not_started',
            })
        }
      }
    }

    // Store exams
    if (extractedData.exams && Array.isArray(extractedData.exams)) {
      for (const exam of extractedData.exams) {
        // Check if exam already exists
        const { data: existing } = await supabase
          .from('course_exams')
          .select('id')
          .eq('course_id', courseId)
          .eq('exam_name', exam.name)
          .single()
        
        if (!existing) {
          await supabase
            .from('course_exams')
            .insert({
              course_id: courseId,
              user_id: course.user_id,
              exam_name: exam.name,
              exam_date: exam.date || null,
              topics: exam.topics || [],
              status: 'not_started',
            })
        }
      }
    }

    return NextResponse.json({ 
      success: true,
      extracted: {
        lectures: extractedData.lectures?.length || 0,
        assignments: extractedData.assignments?.length || 0,
        exams: extractedData.exams?.length || 0,
      }
    })
  } catch (error: any) {
    console.error('Error extracting syllabus items:', error)
    return NextResponse.json({ 
      error: 'Server error', 
      details: error?.message 
    }, { status: 500 })
  }
}
