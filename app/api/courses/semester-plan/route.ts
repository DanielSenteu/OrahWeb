import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// This calls the semester planner edge function but creates course_semester_plan instead of goal
const EDGE_URL = process.env.NEXT_PUBLIC_EDGE_FUNCTION_SEMESTER_PLANNER || 
                 process.env.NEXT_PUBLIC_EDGE_FUNCTION_CREATE_GOAL_PLAN

export async function POST(req: Request) {
  if (!EDGE_URL) {
    return NextResponse.json({ error: 'Missing edge function URL' }, { status: 500 })
  }

  try {
    const { 
      courseId,
      userId, 
      timezone, 
      syllabusContent,
      metadata
    } = await req.json()
    
    if (!syllabusContent || !userId || !courseId) {
      return NextResponse.json({ 
        error: 'courseId, syllabusContent, and userId are required' 
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

    // Verify course exists and belongs to user
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, course_name, semester, year, syllabus_text')
      .eq('id', courseId)
      .eq('user_id', userId)
      .single()

    if (courseError || !course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 })
    }

    console.log('📚 Calling semester planner edge function for course:', courseId)

    // Call the edge function to create the plan
    // We'll create a temporary goal, then convert it to course_semester_plan
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({
        userId,
        timezone: timezone || 'UTC',
        syllabusContent,
        metadata: {
          courseName: course.course_name,
          courseCode: null,
          semesterEndDate: null,
          preferredTime: metadata?.preferredTime || 'afternoon',
          focusDuration: metadata?.focusDuration || 45,
          daysPerWeek: metadata?.daysPerWeek || 3,
        },
      }),
    })

    const data = await res.json()
    
    if (!res.ok) {
      console.error('❌ Semester planner error:', data)
      return NextResponse.json({ 
        error: data?.error || 'Edge function error', 
        details: data 
      }, { status: res.status })
    }

    // If edge function created a goal, we need to:
    // 1. Get the goal's plan data
    // 2. Create course_semester_plan with that data
    // 3. Optionally delete the temporary goal (or keep it for migration)
    
    if (data.success && data.goalId) {
      // Get the goal to extract plan data
      const { data: goal, error: goalError } = await supabase
        .from('user_goals')
        .select('*')
        .eq('id', data.goalId)
        .eq('user_id', userId)
        .single()

      if (!goalError && goal) {
        // Get tasks from the goal
        const { data: tasks } = await supabase
          .from('task_items')
          .select('*')
          .eq('goal_id', data.goalId)
          .eq('user_id', userId)
          .order('day_number', { ascending: true })

        // Create course_semester_plan
        const { data: semesterPlan, error: planError } = await supabase
          .from('course_semester_plans')
          .insert({
            course_id: courseId,
            user_id: userId,
            study_hours_per_day: metadata?.focusDuration ? Math.ceil(metadata.focusDuration / 60) : 2,
            preferred_study_times: metadata?.preferredTime ? [metadata.preferredTime] : ['afternoon'],
            plan_data: {
              total_days: goal.total_days || 0,
              daily_minutes_budget: goal.daily_minutes_budget || 0,
              tasks: tasks || [],
              goal_summary: goal.summary,
              goal_current_summary: goal.current_summary,
            },
          })
          .select()
          .single()

        if (planError) {
          console.error('❌ Error creating course semester plan:', planError)
          // Don't fail - we can retry or user can set it up manually
        } else {
          console.log('✅ Course semester plan created:', semesterPlan?.id)
        }

        // Optionally: Delete the temporary goal (or keep for reference)
        // For now, we'll keep it in case we need to reference it
      }
    }

    // Note: Syllabus extraction happens automatically when syllabus is uploaded
    // The extraction API is called from the syllabus upload page

    return NextResponse.json({ 
      success: true, 
      courseId,
      message: 'Semester plan created successfully' 
    })
  } catch (error: any) {
    console.error('course semester-plan route error', error)
    return NextResponse.json({ 
      error: 'Server error', 
      details: error?.message 
    }, { status: 500 })
  }
}
