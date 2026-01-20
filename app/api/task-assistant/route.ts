import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(req: Request) {
  try {
    const { messages, context, taskContext } = await req.json()

    // Support both old taskContext and new context format
    const ctx = context || taskContext

    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60)
      return `${mins} minutes`
    }

    let systemPrompt = `You are Orah, a focused and supportive AI assistant helping users achieve their academic and personal goals through structured task completion.`

    if (context) {
      // New comprehensive context
      systemPrompt += `

OVERALL GOAL:
${context.goal ? `- ${context.goal.summary}` : 'Not available'}
${context.goal?.domain ? `- Domain: ${context.goal.domain}` : ''}

CURRENT TASK:
- Title: ${context.task.title}
${context.task.description ? `- Description: ${context.task.description}` : ''}
${context.task.deliverable ? `- Deliverable: ${context.task.deliverable}` : ''}
${context.task.metric ? `- Success Metric: ${context.task.metric}` : ''}
- Estimated Time: ${context.task.estimatedMinutes} minutes

TIMER STATUS:
- Time Remaining: ${formatTime(context.timeRemaining)}
- Total Time Worked: ${formatTime(context.totalTimeWorked)}

CHECKPOINTS:
${context.checkpoints.map((cp: any, i: number) => 
  `${i + 1}. ${cp.isCompleted ? '✅' : '⬜'} ${cp.content}`
).join('\n')}

${context.documentText ? `REFERENCE MATERIALS:
${context.documentText}` : ''}

${context.completedTasks.length > 0 ? `PREVIOUSLY COMPLETED TASKS:
${context.completedTasks.map((title: string) => `- ${title}`).join('\n')}` : ''}

Your role:
- Help the user work through THIS specific task effectively
- Reference the checkpoints to guide progress
- Provide specific, actionable advice based on what they're working on
- Encourage them based on time worked and progress made
- If they're stuck, help break down the current checkpoint into smaller steps
- Keep responses concise (2-4 sentences unless more detail is requested)
- Be motivating but focused on getting work done

Stay laser-focused on completing THIS task. Reference their overall goal to keep them motivated, but guide them back to the immediate work at hand.`
    } else {
      // Old taskContext format (backwards compatibility)
      systemPrompt += `

CURRENT TASK:
Title: ${ctx.title}
${ctx.description ? `Description: ${ctx.description}` : ''}
${ctx.deliverable ? `Deliverable: ${ctx.deliverable}` : ''}
${ctx.metric ? `Success Metric: ${ctx.metric}` : ''}

Your role:
- Help the user work through this specific task
- Answer questions about the task
- Provide guidance, tips, and encouragement
- Break down complex parts into smaller steps
- Keep responses concise and actionable
- Be supportive and motivating`
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      temperature: 0.7,
      max_tokens: 600,
    })

    const reply = completion.choices[0]?.message?.content || 'I had trouble generating a response.'

    return NextResponse.json({ reply })
  } catch (error: any) {
    console.error('Task assistant error:', error)
    return NextResponse.json(
      { error: 'Failed to get response', details: error?.message },
      { status: 500 }
    )
  }
}

