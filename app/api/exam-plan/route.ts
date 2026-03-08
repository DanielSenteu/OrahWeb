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
      studyMaterials,
      documents = [], // Array of {name, type, text}
      examId = null, // Optional exam ID from course context
      courseId = null // Optional course ID
    } = await req.json()
    
    if (!courseName || !totalChapters || !hoursPerDay || !examDate || !userId) {
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

    let resolvedCourseId: string | null = courseId || null
    let resolvedExamId: string | null = examId || null
    let resolvedExamName: string = (courseName || 'Exam').trim()

    if (resolvedExamId) {
      const { data: existingExam } = await supabase
        .from('course_exams')
        .select('id, exam_name, course_id')
        .eq('id', resolvedExamId)
        .eq('user_id', userId)
        .maybeSingle()

      if (existingExam) {
        resolvedExamName = existingExam.exam_name || resolvedExamName
        resolvedCourseId = existingExam.course_id || resolvedCourseId
      }
    }

    if (resolvedCourseId && !resolvedExamId) {
      const { data: existingCourseExam } = await supabase
        .from('course_exams')
        .select('id, exam_name')
        .eq('course_id', resolvedCourseId)
        .eq('user_id', userId)
        .eq('exam_name', resolvedExamName)
        .eq('exam_date', examDate)
        .maybeSingle()

      if (existingCourseExam?.id) {
        resolvedExamId = existingCourseExam.id
        resolvedExamName = existingCourseExam.exam_name || resolvedExamName
      } else {
        const { data: insertedExam, error: insertExamError } = await supabase
          .from('course_exams')
          .insert({
            course_id: resolvedCourseId,
            user_id: userId,
            exam_name: resolvedExamName,
            exam_date: examDate,
            topics: [],
            status: 'studying',
          })
          .select('id, exam_name')
          .single()

        if (insertExamError) {
          console.warn('Could not create course exam record:', insertExamError)
        } else {
          resolvedExamId = insertedExam?.id || null
          resolvedExamName = insertedExam?.exam_name || resolvedExamName
        }
      }
    }

    // SAVE DOCUMENTS FIRST - before edge function - so we never lose them
    if (resolvedExamId && Array.isArray(documents) && documents.length > 0) {
      try {
        const docsToInsert = documents.map((d: { name?: string; type?: string; text?: string }) => ({
          exam_id: resolvedExamId,
          user_id: userId,
          document_name: d.name || 'Untitled',
          document_type: (d.type === 'application/pdf' || d.type?.includes?.('pdf')) ? 'pdf' :
            (d.type?.startsWith?.('image/') ? 'image' : 'text'),
          extracted_text: d.text || '',
          topics: [],
        }))
        const { error: saveErr } = await supabase.from('exam_documents').insert(docsToInsert)
        if (saveErr) console.warn('Document save error:', saveErr)
        else console.log('✅ Saved', docsToInsert.length, 'documents to exam_documents (before edge fn)')
      } catch (e) {
        console.warn('Document save failed:', e)
      }
    }

    // Combine all document texts with study materials
    const allNotes = [
      studyMaterials || '',
      ...documents.map((d: any) => d.text || '').filter(Boolean)
    ].filter(Boolean).join('\n\n---\n\n')

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
          studyMaterials: allNotes, // Combined notes from all documents
          documents: documents, // Pass documents for topic extraction
          examId: resolvedExamId || null,
          courseId: resolvedCourseId || null,
        }),
    })

    const data = await res.json()
    
    if (!res.ok) {
      console.error('❌ Exam prep error:', data)
      return NextResponse.json({ error: data?.error || 'Edge function error', details: data }, { status: res.status })
    }

    console.log('✅ Exam plan created:', data.goalId)

    // Set as active goal + persist exam/course linkage
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

      const goalSummary = resolvedExamName.toLowerCase().startsWith('exam:')
        ? resolvedExamName
        : `Exam: ${resolvedExamName}`

      const { error: goalLinkError } = await supabase
        .from('user_goals')
        .update({
          summary: goalSummary,
          course_id: resolvedCourseId,
          exam_id: resolvedExamId,
        } as any)
        .eq('id', data.goalId)
        .eq('user_id', userId)

      if (goalLinkError) {
        console.warn('Goal link update warning:', goalLinkError)
      }

      if (resolvedExamId) {
        const { error: examPlanError } = await supabase
          .from('course_exams')
          .update({
            study_plan: {
              created: true,
              goal_id: data.goalId,
              created_at: new Date().toISOString(),
            },
            status: 'studying',
          })
          .eq('id', resolvedExamId)
          .eq('user_id', userId)

        if (examPlanError) {
          console.warn('Exam plan link warning:', examPlanError)
        }
      }
    }

    return NextResponse.json({
      ...data,
      examId: resolvedExamId,
      courseId: resolvedCourseId,
      examName: resolvedExamName,
    })
  } catch (error: any) {
    console.error('exam-plan route error', error)
    return NextResponse.json({ error: 'Server error', details: error?.message }, { status: 500 })
  }
}
