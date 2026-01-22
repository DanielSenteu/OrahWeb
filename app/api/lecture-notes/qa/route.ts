import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(req: Request) {
  try {
    const { noteId, question } = await req.json()

    if (!noteId || !question) {
      return NextResponse.json(
        { error: 'Missing noteId or question' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: note, error: noteError } = await supabase
      .from('lecture_notes')
      .select('id, user_id, original_content, title')
      .eq('id', noteId)
      .single()

    if (noteError || !note || note.user_id !== user.id) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    const transcript = (note.original_content || '').trim()
    if (!transcript) {
      return NextResponse.json(
        { error: 'Transcript not available for this note.' },
        { status: 400 }
      )
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-2024-11-20',
      messages: [
        {
          role: 'system',
          content: `You are a helpful lecture assistant. Answer questions using ONLY the lecture transcript provided below.

Your job:
1. Search the ENTIRE transcript carefully for relevant information
2. Look for synonyms, related concepts, and paraphrased versions of what the student is asking
3. If the information exists in ANY form, provide the answer
4. Combine multiple parts of the transcript if needed to give a complete answer
5. Be flexible - if the student asks about "recursion" and the transcript mentions "recursive functions", that's a match
6. Only say "I couldn't find that information" if you've truly searched everywhere and it's not mentioned in ANY form

Answer style:
- Be clear and concise (2-5 sentences)
- Quote specific parts of the transcript when helpful
- Explain concepts as they were explained in the lecture
- Do NOT add information from outside the transcript`,
        },
        {
          role: 'user',
          content: `LECTURE: ${note.title}\n\nTRANSCRIPT:\n${transcript}\n\n---\n\nSTUDENT QUESTION: ${question}\n\nSearch the transcript carefully and answer based on what was said in the lecture.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    })

    const reply =
      completion.choices[0]?.message?.content ||
      'I could not find that in the lecture transcript.'

    await supabase.from('lecture_notes_qa').insert({
      user_id: user.id,
      note_id: noteId,
      question,
      answer: reply,
    })

    return NextResponse.json({ reply })
  } catch (error: any) {
    console.error('Lecture notes QA error:', error)
    return NextResponse.json(
      { error: 'Failed to answer question', details: error?.message },
      { status: 500 }
    )
  }
}
