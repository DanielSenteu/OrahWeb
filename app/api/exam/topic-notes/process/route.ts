import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const INTERNAL_REQUEST_TIMEOUT_MS = 90000
const JOB_META_KEY = '__job'

function normalizeTopic(rawTopic: string): string {
  return decodeURIComponent(rawTopic || '').trim().replace(/\s+/g, ' ')
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

export async function POST(req: Request) {
  try {
    const { examId, topic } = await req.json()
    if (!examId || !topic) {
      return NextResponse.json({ error: 'examId and topic are required' }, { status: 400 })
    }

    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    const normalizedTopic = normalizeTopic(topic)

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Mark row as processing.
    const { error: markProcessingError } = await supabase
      .from('exam_topic_notes')
      .upsert(
        {
          exam_id: examId,
          user_id: user.id,
          topic: normalizedTopic,
          prepared_notes: '',
          structured_notes: {
            [JOB_META_KEY]: {
              status: 'processing',
              started_at: new Date().toISOString(),
            },
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'exam_id,user_id,topic' }
      )

    if (markProcessingError) {
      return NextResponse.json(
        { error: 'Failed to mark topic-notes job as processing', details: markProcessingError.message },
        { status: 500 }
      )
    }

    // Fetch documents for this exam/topic.
    const { data: documents } = await supabase
      .from('exam_documents')
      .select('document_name, extracted_text, topics')
      .eq('exam_id', examId)
      .eq('user_id', user.id)

    const relevantDocs = (documents || []).filter((d) =>
      !d.topics ||
      d.topics.length === 0 ||
      d.topics.some((t: string) =>
        t.toLowerCase().includes(normalizedTopic.toLowerCase()) ||
        normalizedTopic.toLowerCase().includes(t.toLowerCase())
      )
    )

    if (relevantDocs.length === 0) {
      const { error: markFailedNoDocsError } = await supabase
        .from('exam_topic_notes')
        .upsert(
          {
            exam_id: examId,
            user_id: user.id,
            topic: normalizedTopic,
            prepared_notes: '',
            structured_notes: {
              [JOB_META_KEY]: {
                status: 'failed',
                error: 'No documents found for this topic.',
                failed_at: new Date().toISOString(),
              },
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'exam_id,user_id,topic' }
        )

      if (markFailedNoDocsError) {
        console.error('Failed to mark topic-notes failure (no docs):', markFailedNoDocsError)
      }

      return NextResponse.json({ processing: false, status: 'failed', error: 'No documents found for this topic.' }, { status: 404 })
    }

    const docsForAPI = relevantDocs.map((d) => ({
      name: d.document_name || 'Document',
      text: d.extracted_text || '',
    }))

    let baseUrl = 'http://localhost:3000'
    try {
      if (req.headers.get('host')) {
        const proto = req.headers.get('x-forwarded-proto') || 'https'
        baseUrl = `${proto}://${req.headers.get('host')}`
      } else if (process.env.VERCEL_URL) {
        baseUrl = `https://${process.env.VERCEL_URL}`
      }
    } catch {
      // keep fallback
    }

    const prepareRes = await fetchWithRetry(`${baseUrl}/api/exam/prepare-topic-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ documents: docsForAPI, topic: normalizedTopic }),
    })

    if (!prepareRes.ok) {
      const err = await prepareRes.text()
      throw new Error(`prepare-topic-notes failed: ${err}`)
    }

    const { preparedNotes } = await prepareRes.json()
    if (!preparedNotes || preparedNotes.length < 50) {
      throw new Error('Insufficient content in documents for this topic')
    }

    const notesRes = await fetchWithRetry(`${baseUrl}/api/exam/generate-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ examId, topic: normalizedTopic, notes: preparedNotes }),
    })

    if (!notesRes.ok) {
      const err = await notesRes.text()
      throw new Error(`generate-notes failed: ${err}`)
    }

    const { notes: structuredNotes } = await notesRes.json()

    await supabase
      .from('exam_topic_notes')
      .upsert(
        {
          exam_id: examId,
          user_id: user.id,
          topic: normalizedTopic,
          prepared_notes: preparedNotes,
          structured_notes: structuredNotes || {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'exam_id,user_id,topic' }
      )

    return NextResponse.json({ processing: false, status: 'completed' })
  } catch (error: unknown) {
    console.error('topic-notes process error:', error)
    const message = error instanceof Error ? error.message : String(error)

    try {
      const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
      if (authHeader) {
        const { examId, topic } = await req.clone().json()
        if (examId && topic) {
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { global: { headers: { Authorization: authHeader } } }
          )
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { error: markFailedError } = await supabase
              .from('exam_topic_notes')
              .upsert(
                {
                  exam_id: examId,
                  user_id: user.id,
                  topic: normalizeTopic(topic),
                  prepared_notes: '',
                  structured_notes: {
                    [JOB_META_KEY]: {
                      status: 'failed',
                      error: message,
                      failed_at: new Date().toISOString(),
                    },
                  },
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'exam_id,user_id,topic' }
              )

            if (markFailedError) {
              console.error('Failed to mark topic-notes failure:', markFailedError)
            }
          }
        }
      }
    } catch {
      // best effort failure mark only
    }

    return NextResponse.json({ error: 'Server error', details: message }, { status: 500 })
  }
}
