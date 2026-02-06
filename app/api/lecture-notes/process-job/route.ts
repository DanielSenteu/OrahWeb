import { NextRequest, NextResponse } from 'next/server'

// Worker Edge Function URL
const WORKER_URL = process.env.NEXT_PUBLIC_EDGE_FUNCTION_LECTURE_NOTES_WORKER || 
                   'https://ffudidfxurrjcjredfjg.supabase.co/functions/v1/lecture_notes_worker'

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json()

    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing jobId' },
        { status: 400 }
      )
    }

    if (!WORKER_URL) {
      return NextResponse.json(
        { error: 'Missing worker URL. Please set NEXT_PUBLIC_EDGE_FUNCTION_LECTURE_NOTES_WORKER' },
        { status: 500 }
      )
    }

    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Missing authorization header' },
        { status: 401 }
      )
    }

    // Call the worker Edge Function
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({ jobId }),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error || 'Worker error', details: data },
        { status: res.status }
      )
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Process job error:', error)
    return NextResponse.json(
      { error: 'Server error', details: error?.message },
      { status: 500 }
    )
  }
}
