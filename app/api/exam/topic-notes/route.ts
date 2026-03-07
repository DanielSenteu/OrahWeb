import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const INTERNAL_REQUEST_TIMEOUT_MS = 90000
const JOB_META_KEY = '__job'

function normalizeTopic(rawTopic: string): string {
  return decodeURIComponent(rawTopic || '').trim().replace(/\s+/g, ' ')
}

function getJobMeta(structuredNotes: unknown): { status?: string; error?: string } | null {
  if (!structuredNotes || typeof structuredNotes !== 'object') return null
  const value = structuredNotes as Record<string, unknown>
  if (!(JOB_META_KEY in value)) return null
  const job = value[JOB_META_KEY]
  if (!job || typeof job !== 'object') return null
  const cast = job as Record<string, unknown>
  return {
    status: typeof cast.status === 'string' ? cast.status : undefined,
    error: typeof cast.error === 'string' ? cast.error : undefined,
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 2): Promise<Response> {
  let lastError: unknown = null
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetchWithTimeout(url, init, INTERNAL_REQUEST_TIMEOUT_MS)
      if (response.ok) return response

      // Retry only on server/transient errors
      if (response.status >= 500 && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)))
        continue
      }
      return response
    } catch (error) {
      lastError = error
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)))
        continue
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Request failed')
}

/**
 * GET or POST: Get notes for a topic (cached) or generate and cache.
 * GET: ?examId=X&topic=Y - returns cached notes if exists
 * POST: { examId, topic } - generates notes if not cached, saves to exam_topic_notes, returns
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const examId = searchParams.get('examId')
  const topic = searchParams.get('topic')

  if (!examId || !topic) {
    return NextResponse.json({ error: 'examId and topic are required' }, { status: 400 })
  }

  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const normalizedTopic = normalizeTopic(topic)

  const { data: cached } = await supabase
    .from('exam_topic_notes')
    .select('prepared_notes, structured_notes')
    .eq('exam_id', examId)
    .eq('user_id', user.id)
    .eq('topic', normalizedTopic)
    .maybeSingle()

  if (cached) {
    const jobMeta = getJobMeta(cached.structured_notes)
    if (jobMeta?.status && jobMeta.status !== 'completed') {
      return NextResponse.json({
        preparedNotes: null,
        structuredNotes: null,
        fromCache: false,
        processing: true,
        status: jobMeta.status,
        error: jobMeta.error || null,
      })
    }

    return NextResponse.json({
      preparedNotes: cached.prepared_notes,
      structuredNotes: cached.structured_notes,
      fromCache: true,
      processing: false,
      status: 'completed',
    })
  }

  return NextResponse.json({
    fromCache: false,
    preparedNotes: null,
    structuredNotes: null,
    processing: false,
    status: 'not_found',
  })
}

export async function POST(req: Request) {
  try {
    const { examId, topic, async: asyncMode } = await req.json()
    if (!examId || !topic) {
      return NextResponse.json({ error: 'examId and topic are required' }, { status: 400 })
    }
    const normalizedTopic = normalizeTopic(topic)

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Check cache first
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: cached } = await supabase
      .from('exam_topic_notes')
      .select('prepared_notes, structured_notes')
      .eq('exam_id', examId)
      .eq('user_id', user.id)
      .eq('topic', normalizedTopic)
      .maybeSingle()

    if (cached) {
      const jobMeta = getJobMeta(cached.structured_notes)
      if (jobMeta?.status && jobMeta.status !== 'completed') {
        return NextResponse.json({
          preparedNotes: null,
          structuredNotes: null,
          fromCache: false,
          processing: true,
          status: jobMeta.status,
          error: jobMeta.error || null,
        })
      }

      return NextResponse.json({
        preparedNotes: cached.prepared_notes,
        structuredNotes: cached.structured_notes,
        fromCache: true,
        processing: false,
        status: 'completed',
      })
    }

    if (asyncMode) {
      await supabase
        .from('exam_topic_notes')
        .upsert(
          {
            exam_id: examId,
            user_id: user.id,
            topic: normalizedTopic,
            prepared_notes: null,
            structured_notes: {
              [JOB_META_KEY]: {
                status: 'pending',
                queued_at: new Date().toISOString(),
              },
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'exam_id,user_id,topic' }
        )

      return NextResponse.json({
        queued: true,
        processing: true,
        status: 'pending',
        preparedNotes: null,
        structuredNotes: null,
        topic: normalizedTopic,
      })
    }

    // Fetch documents for this exam
    const { data: documents } = await supabase
      .from('exam_documents')
      .select('document_name, extracted_text, topics')
      .eq('exam_id', examId)
      .eq('user_id', user.id)

    const relevantDocs = (documents || []).filter(d =>
      !d.topics || d.topics.length === 0 ||
      d.topics.some((t: string) =>
        t.toLowerCase().includes(normalizedTopic.toLowerCase()) ||
        normalizedTopic.toLowerCase().includes(t.toLowerCase())
      )
    )

    if (relevantDocs.length === 0) {
      return NextResponse.json({
        error: 'No documents found for this topic. Upload study materials when creating your exam plan.',
      }, { status: 404 })
    }

    const docsForAPI = relevantDocs.map(d => ({
      name: d.document_name || 'Document',
      text: d.extracted_text || '',
    }))

    // Step 1: Prepare notes - use request origin for internal fetch (avoids localhost/VERCEL_URL issues)
    let baseUrl = 'http://localhost:3000'
    try {
      if (req.headers.get('host')) {
        const proto = req.headers.get('x-forwarded-proto') || 'https'
        baseUrl = `${proto}://${req.headers.get('host')}`
      } else if (process.env.VERCEL_URL) {
        baseUrl = `https://${process.env.VERCEL_URL}`
      }
    } catch (_) {}
    const prepareRes = await fetchWithRetry(`${baseUrl}/api/exam/prepare-topic-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ documents: docsForAPI, topic: normalizedTopic }),
    })

    if (!prepareRes.ok) {
      const err = await prepareRes.text()
      console.error('prepare-topic-notes failed:', err)
      return NextResponse.json({ error: 'Failed to prepare notes' }, { status: 500 })
    }

    const { preparedNotes } = await prepareRes.json()
    if (!preparedNotes || preparedNotes.length < 50) {
      return NextResponse.json({ error: 'Insufficient content in documents for this topic' }, { status: 400 })
    }

    // Step 2: Generate structured notes
    const notesRes = await fetchWithRetry(`${baseUrl}/api/exam/generate-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ examId, topic: normalizedTopic, notes: preparedNotes }),
    })

    if (!notesRes.ok) {
      const err = await notesRes.text()
      console.error('generate-notes failed:', err)
      return NextResponse.json({ error: 'Failed to generate notes' }, { status: 500 })
    }

    const { notes: structuredNotes } = await notesRes.json()

    // Step 3: Save to cache (non-blocking - return notes even if cache fails)
    try {
      await supabase
        .from('exam_topic_notes')
        .upsert({
          exam_id: examId,
          user_id: user.id,
          topic: normalizedTopic,
          prepared_notes: preparedNotes,
          structured_notes: structuredNotes || {},
          updated_at: new Date().toISOString(),
        }, { onConflict: 'exam_id,user_id,topic' })
    } catch (cacheErr) {
      console.warn('Cache save failed (exam_topic_notes may not exist):', cacheErr)
    }

    return NextResponse.json({
      preparedNotes,
      structuredNotes: structuredNotes || {},
      fromCache: false,
      processing: false,
      status: 'completed',
    })
  } catch (error: any) {
    console.error('topic-notes error:', error)
    return NextResponse.json({ error: 'Server error', details: error?.message }, { status: 500 })
  }
}
