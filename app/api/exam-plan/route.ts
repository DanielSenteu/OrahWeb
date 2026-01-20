import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const EDGE_URL = process.env.NEXT_PUBLIC_EDGE_FUNCTION_EXAM_PREP

export async function POST(req: Request) {
  if (!EDGE_URL) {
    return NextResponse.json({ error: 'Missing edge function URL' }, { status: 500 })
  }

  try {
    const { 
      userId, 
      timezone, 
      courseName,
      totalChapters,
      weakChapters,
      weakTopics,
      hoursPerDay,
      examDate,
      studyMaterials
    } = await req.json()
    
    if (!courseName || !totalChapters || !hoursPerDay || !examDate || !userId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    console.log('📚 Calling exam prep edge function...')

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
        courseName,
        totalChapters,
        weakChapters: weakChapters || '',
        weakTopics: weakTopics || '',
        hoursPerDay,
        examDate,
        studyMaterials: studyMaterials || ''
      }),
    })

    const data = await res.json()
    
    if (!res.ok) {
      console.error('❌ Exam prep error:', data)
      return NextResponse.json({ error: data?.error || 'Edge function error', details: data }, { status: res.status })
    }

    console.log('✅ Exam plan created:', data.goalId)

    // Set as active goal
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

      await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: userId,
            active_goal_id: data.goalId,
          },
          { onConflict: 'user_id' }
        )
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('exam-plan route error', error)
    return NextResponse.json({ error: 'Server error', details: error?.message }, { status: 500 })
  }
}
