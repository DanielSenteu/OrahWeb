# Helper Functions Reference

## 📍 These Functions Are in the Worker

The helper functions below are **already in** `supabase/functions/lecture_notes_worker/index.ts`. You do **NOT** need to add them to the main function.

### 1. `generateNotesForChunk` (Lines 332-404)

```typescript
async function generateNotesForChunk(chunkText: string, chunkIndex: number): Promise<GeneratedNotes> {
  const notesPrompt = `You are an ELITE note-taker creating EXAM-READY study notes. Your notes should be so thorough that a student could learn the entire lecture from your notes alone.

CRITICAL DEPTH REQUIREMENTS:
1. **Examples are MANDATORY**: Every concept must include specific examples from the lecture
2. **Explain WHY and HOW**, not just WHAT
3. **Multi-sentence bullets**: Each bullet = 1-3 sentences with complete info
4. **Include ALL details**: Numbers, formulas, step-by-step processes
5. **Study-ready**: Detailed enough to ace the exam using only these notes

Return ONLY valid JSON:
{
  "title": "Lecture title${chunkIndex > 0 ? ` (Part ${chunkIndex + 1})` : ""}",
  "summary": "Comprehensive 2-3 sentence overview",
  "sections": [
    {
      "title": "Section name",
      "content": [
        "Detailed multi-sentence bullet with examples and explanations",
        "Another comprehensive bullet with WHY and HOW, not just WHAT"
      ]
    }
  ],
  "definitions": [
    {"term": "Term", "definition": "Complete definition with context, examples, and why it matters"}
  ],
  "keyTakeaways": ["Comprehensive takeaway with reasoning and examples"]
}

ADDITIONAL CAPTURE REQUIREMENTS:
6. **Exact examples with real data**: Capture EXACT strings, numbers, arrays used in examples
7. **Homework/assignments**: Note any practice problems or homework mentioned
8. **Administrative info**: Office hours, due dates, next lecture topics
9. **Professor's tips**: Study advice, common mistakes, exam hints
10. **Decision frameworks**: "When to use X" or "How to identify Y problems"

Make these notes so comprehensive that students can ace exams AND complete homework using only these notes.`

  const notesResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-2024-07-18",
      messages: [
        { role: "system", content: notesPrompt },
        {
          role: "user",
          content: `Create organized notes from this lecture transcript${chunkIndex > 0 ? ` (chunk ${chunkIndex + 1})` : ""}:\n\n${chunkText}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 16000,
      response_format: { type: "json_object" },
    }),
  })

  if (!notesResponse.ok) {
    const errorText = await notesResponse.text()
    throw new Error(`Notes generation failed: ${notesResponse.status} ${errorText}`)
  }

  const notesData = await notesResponse.json()
  const notesContent = notesData.choices[0]?.message?.content

  if (!notesContent) {
    throw new Error("Failed to generate notes")
  }

  return JSON.parse(notesContent)
}
```

### 2. `chunkTranscript` (Lines 406-467)

```typescript
function chunkTranscript(text: string): Array<{ text: string; index: number }> {
  const OVERLAP_WORDS = 200
  const MAX_CHUNK_TOKENS = 80000
  const TOKENS_PER_CHAR = 0.25

  const estimatedTokens = Math.ceil(text.length * TOKENS_PER_CHAR)

  if (estimatedTokens <= MAX_CHUNK_TOKENS) {
    return [{ text, index: 0 }]
  }

  // Split into sentences
  const sentenceEndings = /[.!?]\s+/g
  const sentences: string[] = []
  let lastIndex = 0
  let match

  while ((match = sentenceEndings.exec(text)) !== null) {
    const sentence = text.substring(lastIndex, match.index + match[0].length)
    if (sentence.trim().length > 0) {
      sentences.push(sentence.trim())
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    const remaining = text.substring(lastIndex).trim()
    if (remaining.length > 0) {
      sentences.push(remaining)
    }
  }

  // Group sentences into chunks
  const chunks: Array<{ text: string; index: number }> = []
  let currentChunk: string[] = []
  let currentTokens = 0
  let chunkIndex = 0

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]
    const sentenceTokens = Math.ceil(sentence.length * TOKENS_PER_CHAR)

    if (currentTokens + sentenceTokens > MAX_CHUNK_TOKENS && currentChunk.length > 0) {
      const chunkText = currentChunk.join(' ')
      chunks.push({ text: chunkText, index: chunkIndex++ })

      const overlapSentences = getOverlapSentences(currentChunk, OVERLAP_WORDS)
      currentChunk = [...overlapSentences, sentence]
      currentTokens = overlapSentences.reduce((sum, s) => sum + Math.ceil(s.length * TOKENS_PER_CHAR), 0) + sentenceTokens
    } else {
      currentChunk.push(sentence)
      currentTokens += sentenceTokens
    }
  }

  if (currentChunk.length > 0) {
    const chunkText = currentChunk.join(' ')
    chunks.push({ text: chunkText, index: chunkIndex })
  }

  return chunks
}
```

### 3. `getOverlapSentences` (Lines 469-481)

```typescript
function getOverlapSentences(sentences: string[], targetWords: number): string[] {
  const overlap: string[] = []
  let wordCount = 0

  for (let i = sentences.length - 1; i >= 0 && wordCount < targetWords; i--) {
    const sentence = sentences[i]
    const words = sentence.split(/\s+/).length
    overlap.unshift(sentence)
    wordCount += words
  }

  return overlap
}
```

### 4. `mergeNotes` (Lines 483-548)

```typescript
function mergeNotes(chunkNotes: Array<GeneratedNotes & { chunkIndex: number }>): GeneratedNotes {
  if (chunkNotes.length === 1) {
    return chunkNotes[0]
  }

  const title = chunkNotes[0].title.replace(/ \(Part \d+\)$/, '') || 'Lecture Notes'
  
  const summaries = chunkNotes.filter(n => n.summary).map(n => n.summary)
  const summary = summaries.length > 0
    ? summaries.length === 1
      ? summaries[0]
      : `${summaries[0]} ${summaries[summaries.length - 1]}`
    : ''

  const sectionMap = new Map<string, { title: string; content: string[] }>()
  for (const note of chunkNotes) {
    for (const section of note.sections) {
      const normalizedTitle = section.title.toLowerCase().trim()
      const existing = sectionMap.get(normalizedTitle)
      
      if (existing) {
        const existingContent = new Set(existing.content.map(c => c.toLowerCase().trim()))
        for (const item of section.content) {
          if (!existingContent.has(item.toLowerCase().trim())) {
            existing.content.push(item)
          }
        }
      } else {
        sectionMap.set(normalizedTitle, { title: section.title, content: [...section.content] })
      }
    }
  }

  const defMap = new Map<string, { term: string; definition: string }>()
  for (const note of chunkNotes) {
    for (const def of note.definitions) {
      const normalizedTerm = def.term.toLowerCase().trim()
      const existing = defMap.get(normalizedTerm)
      
      if (!existing || def.definition.length > existing.definition.length) {
        defMap.set(normalizedTerm, { term: def.term, definition: def.definition })
      }
    }
  }

  const takeawaySet = new Set<string>()
  const takeaways: string[] = []
  
  for (const note of chunkNotes) {
    for (const takeaway of note.keyTakeaways) {
      const normalized = takeaway.toLowerCase().trim()
      if (!takeawaySet.has(normalized)) {
        takeawaySet.add(normalized)
        takeaways.push(takeaway)
      }
    }
  }

  return {
    title,
    summary,
    sections: Array.from(sectionMap.values()),
    definitions: Array.from(defMap.values()),
    keyTakeaways: takeaways,
  }
}
```

## ✅ Summary

**These helper functions are:**
- ✅ Already in the worker (`lecture_notes_worker/index.ts`)
- ❌ **NOT needed** in the main function (`lecture_notes_audio/index.ts`)

**What to do:**
- Remove these functions from the main Edge Function
- They'll be used by the worker instead
