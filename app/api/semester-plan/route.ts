import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// This calls the NEW simplified semester_planner edge function
const EDGE_URL = process.env.NEXT_PUBLIC_EDGE_FUNCTION_SEMESTER_PLANNER

export async function POST(req: Request) {
  // If the new edge function URL isn't set, fall back to the old one
  const edgeUrl = EDGE_URL || process.env.NEXT_PUBLIC_EDGE_FUNCTION_CREATE_GOAL_PLAN
  
  if (!edgeUrl) {
    return NextResponse.json({ error: 'Missing edge function URL' }, { status: 500 })
  }

  try {
    const { 
      userId, 
      timezone, 
      syllabusContent,
      metadata
    } = await req.json()
    
    if (!syllabusContent || !userId) {
      return NextResponse.json({ error: 'syllabusContent and userId are required' }, { status: 400 })
    }

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    console.log('📚 Calling semester planner edge function...')

    // Call the new simplified semester planner edge function
    const res = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({
        userId,
        timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        syllabusContent,
        metadata: {
          courseName: metadata?.courseName,
          courseCode: metadata?.courseCode,
          semesterEndDate: metadata?.semesterEndDate,
        },
      }),
    })

    const data = await res.json()
    
    if (!res.ok) {
      console.error('❌ Semester planner error:', data)
      return NextResponse.json({ error: data?.error || 'Edge function error', details: data }, { status: res.status })
    }

    console.log('✅ Semester plan created:', data.goalId)

    // Set the newly created goal as the active goal
    if (data.success && data.goalId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: { Authorization: authHeader },
          },
        }
      )

      // Upsert the active goal in user_preferences
      const { error: prefError } = await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: userId,
            active_goal_id: data.goalId,
          },
          { onConflict: 'user_id' }
        )

      if (prefError) {
        console.error('Failed to set active goal:', prefError)
      }
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('semester-plan route error', error)
    return NextResponse.json({ error: 'Server error', details: error?.message }, { status: 500 })
  }
}
