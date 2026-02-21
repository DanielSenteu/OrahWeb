import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: NextRequest) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })

  try {
    const { base64Image, prompt, mimeType } = await request.json()

    if (!base64Image || !prompt) {
      return NextResponse.json(
        { error: 'Missing required fields: base64Image and prompt are required' },
        { status: 400 }
      )
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 })
    }

    const supportedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
    type SupportedMimeType = typeof supportedMimeTypes[number]
    const resolvedMime: SupportedMimeType = supportedMimeTypes.includes(mimeType as SupportedMimeType)
      ? (mimeType as SupportedMimeType)
      : 'image/jpeg'

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: resolvedMime,
                data: base64Image,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    })

    const extractedText = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ extractedText })
  } catch (error: any) {
    console.error('Vision API Error:', error)
    return NextResponse.json(
      { error: 'Failed to extract text from image', details: error.message },
      { status: 500 }
    )
  }
}
