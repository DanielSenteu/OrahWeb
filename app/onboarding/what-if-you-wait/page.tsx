'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const headline = "Your first step forward"
const subheadline = "We are happy you're here"

const benefitLines = [
  "Mindset has shifted. You're disciplined.",
  'Accountability from Orah keeps you on track.',
  'Habits become second nature.',
]

function useTypewriter(text: string, speed = 80) {
  const [output, setOutput] = useState('')

  useEffect(() => {
    let active = true
    setOutput('')
    const run = async () => {
      for (let i = 0; i < text.length && active; i++) {
        setOutput((prev) => prev + text[i])
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator && text[i] !== ' ') {
          if (i % 8 === 0) navigator.vibrate(10)
        }
        await new Promise((r) => setTimeout(r, speed))
      }
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(20)
    }
    run()
    return () => {
      active = false
    }
  }, [text, speed])

  return output
}

export default function WhatIfYouWait() {
  const typedHeadline = useTypewriter(headline, 80)
  const typedSub = useTypewriter(subheadline, 70)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showCta, setShowCta] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setShowSuccess(true), 1800)
    const t2 = setTimeout(() => setShowCta(true), 3200)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md mx-auto flex flex-col justify-center">
        <div className="text-center mb-10">
          <div className="text-[26px] font-bold italic leading-snug min-h-[80px]">{typedHeadline}</div>
          <div className="text-[15px] font-bold italic text-[#B4B4B4] leading-relaxed mt-3 min-h-[50px]">
            {typedSub}
          </div>
        </div>

        <div
          className={`transition-all duration-700 ${
            showSuccess ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
          }`}
        >
          <div className="p-6 rounded-2xl border border-purple-400/40 bg-gradient-to-b from-indigo-600/15 to-purple-500/15 shadow-xl animate-[float_3s_ease-in-out_infinite]">
            <div className="text-center text-xl font-bold text-purple-400 mb-4">Lock In</div>
            <div className="text-center text-[15px] text-[#E5E5E5] leading-relaxed mb-4">
              AI guidance from Orah helps you break goals into manageable steps.
            </div>
            <div className="space-y-3 mt-4">
              {benefitLines.map((line) => (
                <div
                  key={line}
                  className="text-[14px] leading-relaxed text-[#E5E5E5] px-4 py-3 rounded-xl bg-purple-500/8 border-l-4 border-purple-500/80"
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className={`text-center mt-10 transition-all duration-700 ${
            showCta ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
          }`}
        >
          <Link href="/onboarding/thank-yourself">
            <button className="px-10 py-4 rounded-full bg-gradient-to-r from-indigo-600 via-purple-500 to-pink-500 text-white font-bold text-[17px] shadow-[0_12px_32px_rgba(139,92,246,0.35)] hover:shadow-[0_16px_40px_rgba(139,92,246,0.45)] transition-all duration-300">
              Lock in with Orah
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}

