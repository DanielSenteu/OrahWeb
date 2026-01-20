import { NextResponse } from 'next/server'

export async function GET() {
  const hasKey = !!process.env.OPENAI_API_KEY
  const keyPreview = process.env.OPENAI_API_KEY 
    ? `${process.env.OPENAI_API_KEY.substring(0, 7)}...${process.env.OPENAI_API_KEY.substring(process.env.OPENAI_API_KEY.length - 4)}`
    : 'NOT SET'
  
  return NextResponse.json({
    openaiKeySet: hasKey,
    keyPreview,
    allEnvVars: Object.keys(process.env).filter(k => k.includes('OPENAI'))
  })
}



