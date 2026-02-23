'use client'

import { useState, useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrahMessage = {
  role: 'user' | 'assistant'
  content: string
  isCheatsheet?: boolean
  cheatsheetTitle?: string
  isMath?: boolean
  taskCreated?: { title: string; date: string }
}

export type QuizOption = { text: string; correct: boolean }

// ─── Mermaid Diagram ──────────────────────────────────────────────────────────

let mermaidLoaded = false
let mermaidLoading = false
const mermaidCallbacks: Array<() => void> = []

export function loadMermaid(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (mermaidLoaded) { resolve(); return }
    mermaidCallbacks.push(resolve)
    if (mermaidLoading) return
    mermaidLoading = true
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js'
    script.onload = () => {
      ;(window as any).mermaid?.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose', darkMode: true })
      mermaidLoaded = true
      mermaidLoading = false
      mermaidCallbacks.forEach(cb => cb())
      mermaidCallbacks.length = 0
    }
    script.onerror = () => { mermaidLoading = false; reject(new Error('Failed to load mermaid')) }
    document.head.appendChild(script)
  })
}

export function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    const id = `mermaid-${Math.random().toString(36).slice(2)}`
    const render = async () => {
      try {
        await loadMermaid()
        if (cancelled) return
        const { svg } = await (window as any).mermaid.render(id, code)
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
          const svgEl = containerRef.current.querySelector('svg')
          if (svgEl) { svgEl.style.maxWidth = '100%'; svgEl.style.height = 'auto' }
          setStatus('done')
        }
      } catch {
        if (!cancelled) setStatus('error')
      }
    }
    render()
    return () => { cancelled = true }
  }, [code])

  if (status === 'error') {
    return <pre className="orah-code-block"><code className="orah-code-lang-label">mermaid</code><code>{code}</code></pre>
  }
  return (
    <div className="orah-diagram" ref={containerRef}>
      {status === 'loading' && <div className="orah-diagram-loading"><span /><span /><span /> Rendering diagram…</div>}
    </div>
  )
}

// ─── SVG Renderer ─────────────────────────────────────────────────────────────

export function SvgRenderer({ code }: { code: string }) {
  const clean = code
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
  return <div className="orah-svg-render" dangerouslySetInnerHTML={{ __html: clean }} />
}

// ─── HTML Preview ─────────────────────────────────────────────────────────────

export function HtmlPreview({ code }: { code: string }) {
  const [expanded, setExpanded] = useState(false)
  const srcdoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{margin:1rem;font-family:system-ui,sans-serif;font-size:13px;color:#111;line-height:1.6}
    *{box-sizing:border-box}
    h1{font-size:1.3rem}h2{font-size:1.1rem}h3{font-size:1rem}
    table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #ddd;padding:6px 10px;text-align:left}
    th{background:#f0f0f0;font-weight:bold}
    code{background:#f5f5f5;padding:2px 5px;border-radius:3px;font-size:0.9em}
    pre{background:#f5f5f5;padding:10px;border-radius:5px;overflow-x:auto}
  </style></head><body>${code}</body></html>`
  return (
    <div className={`orah-html-preview${expanded ? ' orah-html-preview--expanded' : ''}`}>
      <div className="orah-html-bar">
        <span className="orah-html-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          HTML Preview
        </span>
        <button className="orah-html-toggle" onClick={() => setExpanded(e => !e)}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      <iframe srcDoc={srcdoc} sandbox="allow-same-origin" className="orah-html-iframe" title="HTML Preview" />
    </div>
  )
}

// ─── Quiz Card ────────────────────────────────────────────────────────────────

export function QuizQuestion({ question, options }: { question: string; options: QuizOption[] }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  return (
    <div className="orah-quiz-q">
      <div className="orah-quiz-question">{question}</div>
      <div className="orah-quiz-options">
        {options.map((opt, i) => {
          let cls = 'orah-quiz-opt'
          if (revealed) {
            if (opt.correct) cls += ' orah-quiz-opt--correct'
            else if (i === selected && !opt.correct) cls += ' orah-quiz-opt--wrong'
          } else if (i === selected) cls += ' orah-quiz-opt--selected'
          return (
            <button key={i} className={cls} onClick={() => { if (!revealed) setSelected(i) }}>
              <span className="orah-quiz-opt-marker">
                {revealed ? (opt.correct ? '✓' : i === selected ? '✗' : '○') : (i === selected ? '●' : '○')}
              </span>
              {opt.text}
            </button>
          )
        })}
      </div>
      {!revealed && (
        <button className="orah-quiz-reveal" onClick={() => setRevealed(true)}>Reveal Answer</button>
      )}
    </div>
  )
}

// ─── Markdown Parser ──────────────────────────────────────────────────────────

export function renderInline(text: string): React.ReactNode {
  if (!text) return null
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
      return <em key={i}>{part.slice(1, -1)}</em>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return <code key={i} className="orah-inline-code">{part.slice(1, -1)}</code>
    return part
  })
}

export function parseTable(lines: string[]): React.ReactNode | null {
  if (lines.length < 2) return null
  const isTableRow = (l: string) => l.trim().startsWith('|') && l.trim().endsWith('|')
  if (!isTableRow(lines[0])) return null
  const parseCells = (line: string) => line.trim().slice(1, -1).split('|').map(c => c.trim())
  const headers = parseCells(lines[0])
  const rows = lines.slice(2).filter(isTableRow).map(parseCells)
  return (
    <div className="orah-table-wrap">
      <table className="orah-table">
        <thead><tr>{headers.map((h, i) => <th key={i}>{renderInline(h)}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{renderInline(cell)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

export function MarkdownMessage({ content, isMath }: { content: string; isMath?: boolean }) {
  if (!content) return null
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0
  let listBuffer: React.ReactNode[] = []
  let listType: 'ul' | 'ol' | null = null
  let quizQuestions: { question: string; options: QuizOption[] }[] = []
  let currentQuizQ = ''
  let currentQuizOpts: QuizOption[] = []
  let inQuiz = false

  const flushList = () => {
    if (!listBuffer.length) return
    elements.push(listType === 'ul'
      ? <ul key={`ul-${i}`} className="orah-ul">{listBuffer}</ul>
      : <ol key={`ol-${i}`} className="orah-ol">{listBuffer}</ol>
    )
    listBuffer = []; listType = null
  }

  const flushQuiz = () => {
    if (!quizQuestions.length && !currentQuizQ) return
    if (currentQuizQ && currentQuizOpts.length > 0) {
      quizQuestions.push({ question: currentQuizQ, options: currentQuizOpts })
    }
    if (quizQuestions.length > 0) {
      elements.push(
        <div key={`quiz-${i}`} className="orah-quiz-block">
          <div className="orah-quiz-header">Practice Quiz</div>
          {quizQuestions.map((q, qi) => <QuizQuestion key={qi} question={q.question} options={q.options} />)}
        </div>
      )
    }
    quizQuestions = []; currentQuizQ = ''; currentQuizOpts = []; inQuiz = false
  }

  while (i < lines.length) {
    const line = lines[i]

    if (line.trimStart().startsWith('```')) {
      flushList(); flushQuiz()
      const lang = line.trim().slice(3).trim().toLowerCase()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      const code = codeLines.join('\n')
      if (lang === 'mermaid') elements.push(<MermaidDiagram key={`md-${i}`} code={code} />)
      else if (lang === 'svg') elements.push(<SvgRenderer key={`svg-${i}`} code={code} />)
      else if (lang === 'html') elements.push(<HtmlPreview key={`html-${i}`} code={code} />)
      else elements.push(
        <pre key={`code-${i}`} className="orah-code-block">
          {lang && <span className="orah-code-lang-label">{lang}</span>}
          <code>{code}</code>
        </pre>
      )
      i++; continue
    }

    const quizOptMatch = line.match(/^- \[([ x])\] (.+)$/)
    if (quizOptMatch) {
      flushList()
      inQuiz = true
      currentQuizOpts.push({ text: quizOptMatch[2].trim(), correct: quizOptMatch[1] === 'x' })
      i++; continue
    }

    const quizQMatch = line.match(/^\*\*(?:Q(?:\d+)?:|Question\s*\d*:)\*\*\s*(.+)$/)
    if (quizQMatch) {
      flushList()
      if (currentQuizQ && currentQuizOpts.length > 0) quizQuestions.push({ question: currentQuizQ, options: currentQuizOpts })
      currentQuizQ = quizQMatch[1].trim()
      currentQuizOpts = []
      inQuiz = true
      i++; continue
    }

    if (inQuiz && !quizOptMatch && !quizQMatch) flushQuiz()

    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      flushList()
      const tableLines: string[] = []
      while (i < lines.length && (lines[i].trim().startsWith('|') || lines[i].trim().match(/^[\s|:-]+$/))) {
        tableLines.push(lines[i]); i++
      }
      const tableEl = parseTable(tableLines)
      if (tableEl) { elements.push(tableEl); continue }
    }

    if (line.startsWith('# ')) { flushList(); elements.push(<h1 key={`h1-${i}`} className="orah-h1">{renderInline(line.slice(2))}</h1>) }
    else if (line.startsWith('## ')) { flushList(); elements.push(<h2 key={`h2-${i}`} className="orah-h2">{renderInline(line.slice(3))}</h2>) }
    else if (line.startsWith('### ')) { flushList(); elements.push(<h3 key={`h3-${i}`} className="orah-h3">{renderInline(line.slice(4))}</h3>) }
    else if (line.startsWith('#### ')) { flushList(); elements.push(<h4 key={`h4-${i}`} className="orah-h4">{renderInline(line.slice(5))}</h4>) }
    else if (line.trim() === '---' || line.trim() === '***') { flushList(); elements.push(<hr key={`hr-${i}`} className="orah-hr" />) }
    else if (line.match(/^[-*•] /)) {
      if (listType !== 'ul') { flushList(); listType = 'ul' }
      listBuffer.push(<li key={`li-${i}`}>{renderInline(line.replace(/^[-*•] /, ''))}</li>)
    }
    else if (line.match(/^\d+\. /)) {
      if (listType !== 'ol') { flushList(); listType = 'ol' }
      listBuffer.push(<li key={`li-${i}`}>{renderInline(line.replace(/^\d+\. /, ''))}</li>)
    }
    else if (line.startsWith('> ')) { flushList(); elements.push(<blockquote key={`bq-${i}`} className="orah-blockquote">{renderInline(line.slice(2))}</blockquote>) }
    else if (line.trim() === '') { flushList(); if (elements.length > 0) elements.push(<div key={`sp-${i}`} className="orah-spacer" />) }
    else { flushList(); elements.push(<p key={`p-${i}`} className={`orah-p${isMath ? ' orah-math' : ''}`}>{renderInline(line)}</p>) }

    i++
  }

  flushList(); flushQuiz()
  return <div className={`orah-markdown${isMath ? ' orah-math-content' : ''}`}>{elements}</div>
}

// ─── PDF export ───────────────────────────────────────────────────────────────

export function mdToHtml(md: string): string {
  let h = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  h = h.replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
  h = h.replace(/^#### (.+)$/gm,'<h4>$1</h4>')
  h = h.replace(/^### (.+)$/gm,'<h3>$1</h3>')
  h = h.replace(/^## (.+)$/gm,'<h2>$1</h2>')
  h = h.replace(/^# (.+)$/gm,'<h1>$1</h1>')
  h = h.replace(/^---$/gm,'<hr>')
  h = h.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
  h = h.replace(/\*([^*]+)\*/g,'<em>$1</em>')
  h = h.replace(/`([^`]+)`/g,'<code>$1</code>')
  h = h.replace(/^[-*] (.+)$/gm,'<li>$1</li>')
  h = h.replace(/^\d+\. (.+)$/gm,'<li>$1</li>')
  h = h.replace(/\n{2,}/g,'</p><p>').replace(/^(.)/,'<p>$1').replace(/(.)$/,'$1</p>')
  h = h.replace(/<p><(h[1-4]|hr|pre)/g,'<$1').replace(/<\/(h[1-4]|pre)><\/p>/g,'</$1>')
  return h
}

export function downloadCheatsheetPDF(title: string, content: string) {
  const body = mdToHtml(content)
  const doc = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${title}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Georgia',serif;font-size:11pt;line-height:1.65;padding:2cm 2.2cm;color:#111}
h1{font-size:20pt;border-bottom:2px solid #333;padding-bottom:.35em;margin-bottom:.6em}
h2{font-size:14pt;color:#1a1a1a;margin-top:1.5em;margin-bottom:.4em;border-left:3px solid #555;padding-left:.5em}
h3{font-size:12pt;color:#333;margin-top:1em;margin-bottom:.3em;font-style:italic}
h4{font-size:11pt;margin-top:.8em;margin-bottom:.2em}
p{margin-bottom:.5em}ul,ol{margin-left:1.5em;margin-bottom:.5em}li{margin-bottom:.15em}
code{font-family:'Courier New',monospace;background:#f0f0f0;padding:.1em .3em;border-radius:3px;font-size:10pt}
pre{background:#f0f0f0;padding:.85em 1em;border-radius:5px;margin:.5em 0;overflow-x:auto}
pre code{background:none;padding:0}strong{font-weight:bold}em{font-style:italic}
hr{border:none;border-top:1px solid #ccc;margin:1em 0}
.hdr{display:flex;justify-content:space-between;font-size:9pt;color:#888;border-bottom:1px solid #ddd;padding-bottom:.4em;margin-bottom:1.2em}
@page{margin:1.5cm}@media print{body{padding:0}}</style></head>
<body><div class="hdr"><span>Generated by Orah AI</span><span>${new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</span></div>
${body}</body></html>`

  const url = URL.createObjectURL(new Blob([doc], { type: 'text/html;charset=utf-8' }))
  const w = window.open(url, '_blank', 'width=900,height=700')
  if (w) w.onload = () => { setTimeout(() => { w.print(); URL.revokeObjectURL(url) }, 300) }
  else URL.revokeObjectURL(url)
}
