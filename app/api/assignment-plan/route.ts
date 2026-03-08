import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const EDGE_URL = process.env.NEXT_PUBLIC_EDGE_FUNCTION_ASSIGNMENT_HELPER

export async function POST(req: Request) {
  if (!EDGE_URL) {
    return NextResponse.json({ error: 'Missing edge function URL' }, { status: 500 })
  }

  try {
    const {
      userId,
      timezone,
      assignmentContent,
      dueDate,
      hoursPerDay,
      assignmentId,
      courseId,
    } = await req.json()
    
    if (!assignmentContent || !userId || !dueDate || !hoursPerDay) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    let resolvedAssignmentId: string | null = assignmentId || null

    const deriveAssignmentName = (content: string) => {
      const firstLine = content
        .split(/\r?\n/)
        .map((line: string) => line.trim())
        .find((line: string) => line.length > 0)
      if (!firstLine) return 'Assignment'
      return firstLine.slice(0, 120)
    }

    if (courseId && !resolvedAssignmentId) {
      const assignmentName = deriveAssignmentName(assignmentContent)

      const { data: existingAssignment } = await supabase
        .from('course_assignments')
        .select('id')
        .eq('course_id', courseId)
        .eq('user_id', userId)
        .eq('assignment_name', assignmentName)
        .eq('due_date', dueDate)
        .maybeSingle()

      if (existingAssignment?.id) {
        resolvedAssignmentId = existingAssignment.id
      } else {
        const { data: insertedAssignment, error: insertAssignmentError } = await supabase
          .from('course_assignments')
          .insert({
            course_id: courseId,
            user_id: userId,
            assignment_name: assignmentName,
            description: assignmentContent.slice(0, 5000),
            due_date: dueDate,
            status: 'in_progress',
          })
          .select('id')
          .single()

        if (insertAssignmentError) {
          console.warn('Could not create course assignment record:', insertAssignmentError)
        } else {
          resolvedAssignmentId = insertedAssignment?.id || null
        }
      }
    }

    console.log('📝 Calling assignment helper edge function...')

    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({
        userId,
        timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        assignmentContent,
        dueDate,
        hoursPerDay,
        assignmentId: resolvedAssignmentId,
        courseId: courseId || null,
      }),
    })

    const data = await res.json()
    
    if (!res.ok) {
      console.error('❌ Assignment helper error:', data)
      return NextResponse.json({ error: data?.error || 'Edge function error', details: data }, { status: res.status })
    }

    console.log('✅ Assignment plan created:', data.goalId)

    // Set as active goal + link goal to course assignment context
    if (data.success && data.goalId) {
      await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: userId,
            active_goal_id: data.goalId,
          },
          { onConflict: 'user_id' }
        )

      if (courseId || resolvedAssignmentId) {
        const { error: goalLinkError } = await supabase
          .from('user_goals')
          .update({
            course_id: courseId || null,
            assignment_id: resolvedAssignmentId,
          } as any)
          .eq('id', data.goalId)
          .eq('user_id', userId)

        if (goalLinkError) {
          console.warn('Goal link update warning:', goalLinkError)
        }
      }

      if (resolvedAssignmentId) {
        const { error: assignmentPlanError } = await supabase
          .from('course_assignments')
          .update({
            step_by_step_plan: {
              created: true,
              goal_id: data.goalId,
              created_at: new Date().toISOString(),
            },
            status: 'in_progress',
          })
          .eq('id', resolvedAssignmentId)
          .eq('user_id', userId)

        if (assignmentPlanError) {
          console.warn('Assignment plan link warning:', assignmentPlanError)
        }
      }
    }

    return NextResponse.json({
      ...data,
      assignmentId: resolvedAssignmentId,
    })
  } catch (error: any) {
    console.error('assignment-plan route error', error)
    return NextResponse.json({ error: 'Server error', details: error?.message }, { status: 500 })
  }
}
