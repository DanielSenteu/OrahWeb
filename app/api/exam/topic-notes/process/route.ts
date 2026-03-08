import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const JOB_META_KEY = '__job'
const MAX_DOCS_FOR_PREP = 8
const MAX_DOC_CHARS = 45000
const MAX_FALLBACK_NOTES_CHARS = 30000

function normalizeTopic(rawTopic: string): string {
  return decodeURIComponent(rawTopic || '').trim().replace(/\s+/g, ' ')
}

function buildStructuredNotes(topic: string, preparedNotes: string) {
  const lines = preparedNotes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('[From '))

  const summary = preparedNotes.slice(0, 1200)
  const content = lines.slice(0, 24)
  const keyTakeaways = lines
    .filter((line) => line.length > 35)
    .slice(0, 6)

  return {
    title: `Study Notes: ${topic}`,
    summary,
    sections: [
      {
        title: 'Core Notes',
        content,
      },
    ],
    keyTakeaways,
    practiceTips: [
      `Summarize the main idea of each point in your own words for ${topic}.`,
      'Use the quiz immediately after reviewing these notes to check understanding.',
    ],
  }
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

    const docsForAPI = relevantDocs.slice(0, MAX_DOCS_FOR_PREP).map((d) => ({
      name: d.document_name || 'Document',
      text: (d.extracted_text || '').slice(0, MAX_DOC_CHARS),
    }))

    const fallbackPreparedNotes = docsForAPI
      .map((d) => `[From ${d.name}]\n${d.text || ''}`)
      .join('\n\n---\n\n')
      .slice(0, MAX_FALLBACK_NOTES_CHARS)

    // Deterministic path for reliability: build notes directly from exam documents.
    const preparedNotes = fallbackPreparedNotes

    if (!preparedNotes || preparedNotes.length < 50) {
      throw new Error('Insufficient content in documents for this topic')
    }

    const structuredNotes = buildStructuredNotes(normalizedTopic, preparedNotes)

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
