import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const { base64Image, prompt, mimeType } = await request.json()

    console.log('Vision API called with:', {
      hasImage: !!base64Image,
      imageLength: base64Image?.length || 0,
      mimeType,
      promptLength: prompt?.length || 0
    })

    if (!base64Image || !prompt) {
      console.error('Missing required fields:', { hasImage: !!base64Image, hasPrompt: !!prompt })
      return NextResponse.json(
        { error: 'Missing required fields: base64Image and prompt are required' },
        { status: 400 }
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY not set')
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    console.log('Calling OpenAI Vision API...')
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-2024-11-20',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType || 'image/jpeg'};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 4096,
    })

    const extractedText = response.choices[0]?.message?.content || ''
    console.log('Vision API success! Extracted length:', extractedText.length)

    return NextResponse.json({ extractedText })
  } catch (error: any) {
    console.error('Vision API Error:', error)
    return NextResponse.json(
      { error: 'Failed to extract text from image', details: error.message },
      { status: 500 }
    )
  }
}

