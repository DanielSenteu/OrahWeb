'use client'

import Link from 'next/link'

export default function ChooseAgent() {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg mx-auto text-center space-y-8">
        <div>
          <h1 className="text-4xl font-black tracking-tight mb-3">Welcome to ORAH</h1>
          <p className="text-lg text-orah-text-secondary">
            Your AI-powered academic success platform
          </p>
        </div>

        <div className="space-y-4">
          <Link href="/academic-hub">
            <div className="glass-card p-6 rounded-2xl border border-orah-surface-light shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer bg-gradient-to-r from-indigo-600/15 via-purple-500/10 to-pink-500/15">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-xl font-bold">
                  🎓
                </div>
                <div className="text-left">
                  <div className="text-xl font-semibold">Start Your Journey</div>
                  <div className="text-sm text-orah-text-secondary">Access all academic tools</div>
                </div>
              </div>
            </div>
          </Link>

          <div className="glass-card p-6 rounded-2xl border border-orah-surface-light bg-orah-surface text-left opacity-60 cursor-not-allowed">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center text-xl font-bold">
                🎙️
              </div>
              <div>
                <div className="text-xl font-semibold">More Features</div>
                <div className="text-sm text-orah-text-secondary">Coming soon</div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-sm text-orah-text-muted">
          Semester tracking, assignments, exams, and lecture notes all in one place
        </p>
      </div>
    </div>
  )
}

