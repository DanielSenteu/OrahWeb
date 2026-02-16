import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/** POST: Add documents to an existing exam (for plans created without documents) */
export async function POST(req: Request) {
  try {
    const { examId, documents } = await req.json()
    if (!examId || !Array.isArray(documents) || documents.length === 0) {
      return NextResponse.json({ error: 'examId and documents array required' }, { status: 400 })
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

    const { data: exam } = await supabase
      .from('course_exams')
      .select('id, user_id')
      .eq('id', examId)
      .eq('user_id', user.id)
      .single()

    if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })

    const docsToInsert = documents.map((d: { name?: string; text?: string }) => ({
      exam_id: examId,
      user_id: user.id,
      document_name: d.name || 'Untitled',
      document_type: 'pdf',
      extracted_text: d.text || '',
      topics: [],
    }))

    const { error } = await supabase.from('exam_documents').insert(docsToInsert)
    if (error) {
      console.error('Add documents error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, added: docsToInsert.length })
  } catch (e: any) {
    console.error('add-documents error:', e)
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 })
  }
}
