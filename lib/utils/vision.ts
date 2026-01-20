import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function extractTextFromImage(
  base64Image: string,
  prompt: string,
  mimeType: string = 'image/jpeg'
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
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
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 4096,
    })

    return response.choices[0]?.message?.content || ''
  } catch (error) {
    console.error('Vision API Error:', error)
    throw new Error('Failed to extract text from image')
  }
}



