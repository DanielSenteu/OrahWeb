import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

  const { data: cached } = await supabase
    .from('exam_topic_notes')
    .select('prepared_notes, structured_notes')
    .eq('exam_id', examId)
    .eq('user_id', user.id)
    .eq('topic', decodeURIComponent(topic))
    .maybeSingle()

  if (cached) {
    return NextResponse.json({
      preparedNotes: cached.prepared_notes,
      structuredNotes: cached.structured_notes,
      fromCache: true,
    })
  }

  return NextResponse.json({ fromCache: false, preparedNotes: null, structuredNotes: null })
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
      .eq('topic', topic)
      .maybeSingle()

    if (cached) {
      return NextResponse.json({
        preparedNotes: cached.prepared_notes,
        structuredNotes: cached.structured_notes,
        fromCache: true,
      })
    }

    // Fetch documents for this exam
    const { data: documents } = await supabase
      .from('exam_documents')
      .select('document_name, extracted_text, topics')
      .eq('exam_id', examId)
      .eq('user_id', user.id)

    // Filter documents by topic relevance.
    // Documents with stored topic tags are matched against the requested topic.
    // Documents with no topic tags fall back to keyword-based content filtering.
    const STOP_WORDS = new Set(['chapter', 'unit', 'section', 'part', 'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'will', 'they', 'what', 'when'])
    const topicKeywords = topic
      .toLowerCase()
      .split(/[\s:,\-\/]+/)
      .filter((w: string) => w.length > 3 && !STOP_WORDS.has(w))

    type ExamDoc = { document_name: string | null; extracted_text: string | null; topics: string[] | null }
    const relevantDocs = (documents || []).filter((d: ExamDoc) => {
      // If document has stored topic tags, use those for filtering
      if (d.topics && d.topics.length > 0) {
        return d.topics.some((t: string) =>
          t.toLowerCase().includes(topic.toLowerCase()) ||
          topic.toLowerCase().includes(t.toLowerCase())
        )
      }
      // No topic tags — fall back to keyword matching against document text
      if (topicKeywords.length === 0) return true // No meaningful keywords, include document
      const docText = (d.extracted_text || '').toLowerCase()
      return topicKeywords.some((kw: string) => docText.includes(kw))
    })

    if (relevantDocs.length === 0) {
      return NextResponse.json({
        error: 'No documents found for this topic. Upload study materials when creating your exam plan.',
      }, { status: 404 })
    }

    const docsForAPI = relevantDocs.map((d: ExamDoc) => ({
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
    const prepareRes = await fetch(`${baseUrl}/api/exam/prepare-topic-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ documents: docsForAPI, topic }),
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
    const notesRes = await fetch(`${baseUrl}/api/exam/generate-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({ examId, topic, notes: preparedNotes }),
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
          topic,
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
    })
  } catch (error: any) {
    console.error('topic-notes error:', error)
    return NextResponse.json({ error: 'Server error', details: error?.message }, { status: 500 })
  }
}
