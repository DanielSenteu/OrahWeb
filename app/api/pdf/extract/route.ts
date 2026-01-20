import { NextRequest, NextResponse } from 'next/server'
import { extractText } from 'unpdf'

export async function POST(request: NextRequest) {
  try {
    const { pdf } = await request.json()

    if (!pdf) {
      return NextResponse.json(
        { error: 'Missing pdf data' },
        { status: 400 }
      )
    }

    console.log('📄 Extracting text from PDF using unpdf...')
    
    // Convert base64 to Uint8Array
    const pdfBuffer = Buffer.from(pdf, 'base64')
    const pdfData = new Uint8Array(pdfBuffer)
    
    // Extract text using unpdf
    const { text, totalPages } = await extractText(pdfData, { mergePages: true })
    
    console.log(`📄 PDF loaded: ${totalPages} pages`)
    console.log('✅ PDF text extracted:', text.length, 'characters')

    return NextResponse.json({ text })
  } catch (error: any) {
    console.error('❌ PDF extraction error:', error)
    return NextResponse.json(
      { error: 'Failed to extract text from PDF', details: error.message },
      { status: 500 }
    )
  }
}
