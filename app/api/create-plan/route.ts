import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const EDGE_URL = process.env.NEXT_PUBLIC_EDGE_FUNCTION_CREATE_GOAL_PLAN

export async function POST(req: Request) {
  if (!EDGE_URL) {
    return NextResponse.json({ error: 'Missing edge function URL' }, { status: 500 })
  }

  try {
    const { 
      messages, 
      userId, 
      timezone, 
      goalId, 
      isIncremental,
      academicType,
      syllabusContent,
      assignmentContent,
      examContent,
      metadata
    } = await req.json()
    
    if (!messages || !Array.isArray(messages) || !userId) {
      return NextResponse.json({ error: 'messages and userId are required' }, { status: 400 })
    }

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    // Call the edge function to create the plan
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({
        messages,
        userId,
        timezone,
        goalId,
        isIncremental: !!isIncremental,
        academicType,
        syllabusContent,
        assignmentContent,
        examContent,
        metadata,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ error: data?.error || 'Edge function error', details: data }, { status: res.status })
    }

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
        // Don't fail the request, just log it
      } else {
        console.log('✅ Set active goal:', data.goalId)
      }
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('create-plan route error', error)
    return NextResponse.json({ error: 'Server error', details: error?.message }, { status: 500 })
  }
}

