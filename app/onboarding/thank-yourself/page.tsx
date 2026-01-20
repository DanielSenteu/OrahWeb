'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const quoteText =
  '"In a year, you\'ll either remember this as when you took yourself seriously, or you won\'t remember it at all. That\'s the difference."'
const hookText =
  "You've already seen what happens when you have a plan. Imagine where you'd be if you stopped dropping it halfway."

function useTypewriter(text: string, speed = 120, pauseAfter = 1500) {
  const [output, setOutput] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let active = true
    setOutput('')
    setDone(false)
    const run = async () => {
      for (let i = 0; i < text.length && active; i++) {
        setOutput((prev) => prev + text[i])
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator && text[i] !== ' ') {
          if (i % 8 === 0) navigator.vibrate(10)
        }
        await new Promise((r) => setTimeout(r, speed))
      }
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(20)
      await new Promise((r) => setTimeout(r, pauseAfter))
      if (active) setDone(true)
    }
    run()
    return () => {
      active = false
    }
  }, [text, speed, pauseAfter])

  return { output, done }
}

export default function ThankYourself() {
  const [showWave, setShowWave] = useState(false)
  const [showQuoteBlock, setShowQuoteBlock] = useState(false)
  const [showHook, setShowHook] = useState(false)
  const [showTimeline, setShowTimeline] = useState(false)
  const [showCta, setShowCta] = useState(false)

  const { output: typedQuote, done: quoteDone } = useTypewriter(quoteText, 120, 1200)
  const { output: typedHook, done: hookDone } = useTypewriter(hookText, 120, 1200)

  useEffect(() => {
    const t1 = setTimeout(() => setShowWave(true), 600)
    const t2 = setTimeout(() => setShowQuoteBlock(true), 1600)
    const t3 = setTimeout(() => setShowHook(true), 4200)
    const t4 = setTimeout(() => setShowTimeline(true), 6200)
    const t5 = setTimeout(() => setShowCta(true), 8500)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      clearTimeout(t4)
      clearTimeout(t5)
    }
  }, [])

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md mx-auto flex flex-col justify-center">
        {/* Wave */}
        <div
          className={`transition-opacity duration-800 ${showWave ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className="relative h-24 mb-3">
            <svg className="w-full h-24" viewBox="0 0 350 80" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M 10 40 Q 50 50, 85 55 T 160 65"
                stroke="rgba(239, 68, 68, 0.6)"
                strokeWidth="2"
                fill="none"
                strokeDasharray="4 4"
              />
              <path
                d="M 190 65 Q 225 55, 260 45 T 340 30"
                stroke="rgba(139, 92, 246, 0.8)"
                strokeWidth="3"
                fill="none"
              />
            </svg>
          </div>
          <div className="text-center text-[11px] text-[#9CA3AF]">
            Your potential is waiting. The only difference between now and a year from now is the choice you make today.
          </div>
        </div>

        {/* Quote */}
        <div
          className={`mt-6 rounded-2xl border-l-4 border-purple-500 bg-purple-500/10 p-6 transition-all duration-800 ${
            showQuoteBlock ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
          }`}
        >
          <div
            className={`text-[16px] leading-relaxed text-[#E9D5FF] italic min-h-[80px] transition-opacity duration-500 ${
              quoteDone ? 'opacity-100' : 'opacity-100'
            }`}
          >
            {typedQuote}
          </div>
        </div>

        {/* Hook */}
        <div
          className={`mt-6 text-center text-[17px] font-semibold leading-relaxed text-[#E9D5FF] p-6 rounded-2xl bg-purple-500/10 transition-all duration-800 ${
            showHook ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
          }`}
        >
          {typedHook}
        </div>

        {/* Timeline */}
        <div
          className={`mt-8 transition-all duration-800 ${
            showTimeline ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
          }`}
        >
          <div className="text-center text-[16px] font-semibold text-[#E9D5FF] mb-5">
            The Choice Right Now
          </div>
          <div className="space-y-3">
            {[
              { period: 'TODAY', text: "You're here. Ready to change." },
              { period: '30 DAYS', text: 'First real streak. Habits forming.' },
              { period: '90 DAYS', text: 'Unrecognizable progress.' },
              { period: '1 YEAR', text: 'Looking back at the moment everything changed.' },
            ].map((item) => (
              <div
                key={item.period}
                className="flex gap-4 p-4 rounded-2xl bg-purple-500/5 border-l-4 border-purple-500"
              >
                <div className="text-[12px] font-semibold text-purple-400 min-w-[70px]">
                  {item.period}
                </div>
                <div className="text-[14px] text-[#E5E5E5] leading-snug">{item.text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div
          className={`text-center mt-10 transition-all duration-800 ${
            showCta ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
          }`}
        >
          <Link href="/onboarding/choose-agent">
            <button className="px-10 py-4 rounded-full bg-gradient-to-r from-indigo-600 via-purple-500 to-pink-500 text-white font-bold text-[17px] shadow-[0_12px_32px_rgba(139,92,246,0.35)] hover:shadow-[0_16px_40px_rgba(139,92,246,0.45)] transition-all duration-300">
              Lock in with Orah
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}

