import { NextRequest, NextResponse } from 'next/server'
import { extractText } from 'unpdf'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { pdf, filePath, bucket } = await request.json()

    let pdfData: Uint8Array | null = null

    if (filePath) {
      const storageBucket = bucket || 'course-documents'
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!serviceRoleKey) {
        return NextResponse.json(
          { error: 'Missing SUPABASE_SERVICE_ROLE_KEY for storage extraction' },
          { status: 500 }
        )
      }

      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey,
        { auth: { persistSession: false } }
      )

      const { data: downloadData, error: downloadError } = await supabaseAdmin
        .storage
        .from(storageBucket)
        .download(filePath)

      if (downloadError || !downloadData) {
        return NextResponse.json(
          { error: 'Failed to download PDF from storage', details: downloadError?.message },
          { status: 400 }
        )
      }

      const arrayBuffer = await downloadData.arrayBuffer()
      pdfData = new Uint8Array(arrayBuffer)
    }

    if (!pdfData && !pdf) {
      return NextResponse.json(
        { error: 'Missing pdf data or filePath' },
        { status: 400 }
      )
    }

    console.log('📄 Extracting text from PDF using unpdf...')

    if (!pdfData && pdf) {
      // Backward-compatible base64 path (used by older clients).
      const pdfBuffer = Buffer.from(pdf, 'base64')
      pdfData = new Uint8Array(pdfBuffer)
    }

    if (!pdfData) {
      return NextResponse.json(
        { error: 'Failed to load PDF bytes' },
        { status: 400 }
      )
    }
    
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
