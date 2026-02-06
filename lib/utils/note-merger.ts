/**
 * Note Merger
 * Intelligently merges notes from multiple transcript chunks
 */

export interface ChunkNotes {
  title?: string
  summary?: string
  sections: Array<{ title: string; content: string[] }>
  definitions: Array<{ term: string; definition: string }>
  keyTakeaways: string[]
  chunkIndex: number
}

export interface MergedNotes {
  title: string
  summary: string
  sections: Array<{ title: string; content: string[] }>
  definitions: Array<{ term: string; definition: string }>
  keyTakeaways: string[]
}

/**
 * Merge notes from multiple chunks into a single coherent set of notes
 */
export function mergeNotes(chunkNotes: ChunkNotes[]): MergedNotes {
  if (chunkNotes.length === 0) {
    throw new Error('No notes to merge')
  }

  if (chunkNotes.length === 1) {
    return {
      title: chunkNotes[0].title || 'Lecture Notes',
      summary: chunkNotes[0].summary || '',
      sections: chunkNotes[0].sections,
      definitions: chunkNotes[0].definitions,
      keyTakeaways: chunkNotes[0].keyTakeaways,
    }
  }

  // Use title from first chunk (usually most accurate)
  const title = chunkNotes[0].title || chunkNotes.find(n => n.title)?.title || 'Lecture Notes'

  // Merge summaries - combine or use first + last
  const summaries = chunkNotes.filter(n => n.summary).map(n => n.summary!)
  const summary = summaries.length > 0
    ? summaries.length === 1
      ? summaries[0]
      : `${summaries[0]} ${summaries[summaries.length - 1]}`
    : ''

  // Merge sections - group by similarity and merge content
  const mergedSections = mergeSections(chunkNotes.flatMap(n => n.sections.map(s => ({ ...s, chunkIndex: n.chunkIndex }))))

  // Merge definitions - deduplicate by term, keep most complete
  const mergedDefinitions = mergeDefinitions(chunkNotes.flatMap(n => n.definitions))

  // Merge takeaways - deduplicate similar ones, prioritize from conclusion
  const mergedTakeaways = mergeTakeaways(chunkNotes.map(n => ({ takeaways: n.keyTakeaways, chunkIndex: n.chunkIndex })))

  return {
    title,
    summary,
    sections: mergedSections,
    definitions: mergedDefinitions,
    keyTakeaways: mergedTakeaways,
  }
}

/**
 * Merge sections by grouping similar titles and combining content
 */
function mergeSections(sections: Array<{ title: string; content: string[]; chunkIndex: number }>): Array<{ title: string; content: string[] }> {
  const sectionMap = new Map<string, { title: string; content: string[]; chunkIndices: number[] }>()

  for (const section of sections) {
    const normalizedTitle = normalizeTitle(section.title)
    
    // Find similar existing section
    let found = false
    for (const [key, existing] of sectionMap.entries()) {
      if (areTitlesSimilar(normalizedTitle, key)) {
        // Merge into existing section
        existing.content.push(...section.content)
        existing.chunkIndices.push(section.chunkIndex)
        found = true
        break
      }
    }

    if (!found) {
      // Create new section
      sectionMap.set(normalizedTitle, {
        title: section.title, // Keep original title
        content: [...section.content],
        chunkIndices: [section.chunkIndex],
      })
    }
  }

  // Convert to array and sort by first occurrence
  return Array.from(sectionMap.values())
    .sort((a, b) => {
      const aFirst = Math.min(...a.chunkIndices)
      const bFirst = Math.min(...b.chunkIndices)
      return aFirst - bFirst
    })
    .map(({ title, content }) => ({
      title,
      content: deduplicateContent(content),
    }))
}

/**
 * Merge definitions, keeping the most complete one for each term
 */
function mergeDefinitions(definitions: Array<{ term: string; definition: string }>): Array<{ term: string; definition: string }> {
  const defMap = new Map<string, string>()

  for (const def of definitions) {
    const normalizedTerm = def.term.toLowerCase().trim()
    const existing = defMap.get(normalizedTerm)

    if (!existing || def.definition.length > existing.length) {
      // Keep longer/more complete definition
      defMap.set(normalizedTerm, def.definition)
    }
  }

  return Array.from(defMap.entries()).map(([term, definition]) => ({
    term: definitions.find(d => d.term.toLowerCase().trim() === term)?.term || term,
    definition,
  }))
}

/**
 * Merge takeaways, deduplicating similar ones
 */
function mergeTakeaways(takeawayGroups: Array<{ takeaways: string[]; chunkIndex: number }>): string[] {
  // Sort by chunk index (prioritize later chunks/conclusions)
  const sorted = [...takeawayGroups].sort((a, b) => b.chunkIndex - a.chunkIndex)
  
  const merged: string[] = []
  const seen = new Set<string>()

  for (const group of sorted) {
    for (const takeaway of group.takeaways) {
      const normalized = normalizeText(takeaway)
      
      // Check if similar takeaway already exists
      let isDuplicate = false
      for (const existing of merged) {
        if (areTextsSimilar(normalized, normalizeText(existing))) {
          isDuplicate = true
          break
        }
      }

      if (!isDuplicate) {
        merged.push(takeaway)
        seen.add(normalized)
      }
    }
  }

  return merged
}

/**
 * Deduplicate content items (remove exact duplicates)
 */
function deduplicateContent(content: string[]): string[] {
  const seen = new Set<string>()
  const unique: string[] = []

  for (const item of content) {
    const normalized = normalizeText(item)
    if (!seen.has(normalized)) {
      seen.add(normalized)
      unique.push(item)
    }
  }

  return unique
}

/**
 * Normalize title for comparison
 */
function normalizeTitle(title: string): string {
  return title.toLowerCase().trim().replace(/[^\w\s]/g, '')
}

/**
 * Normalize text for comparison
 */
function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Check if two titles are similar (fuzzy matching)
 */
function areTitlesSimilar(title1: string, title2: string): boolean {
  const norm1 = normalizeTitle(title1)
  const norm2 = normalizeTitle(title2)

  // Exact match
  if (norm1 === norm2) return true

  // One contains the other (for variations like "Introduction" vs "Introduction to...")
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true

  // Word overlap (if >70% words match)
  const words1 = new Set(norm1.split(/\s+/))
  const words2 = new Set(norm2.split(/\s+/))
  const intersection = new Set([...words1].filter(w => words2.has(w)))
  const union = new Set([...words1, ...words2])
  const similarity = intersection.size / union.size

  return similarity > 0.7
}

/**
 * Check if two texts are similar
 */
function areTextsSimilar(text1: string, text2: string): boolean {
  const norm1 = normalizeText(text1)
  const norm2 = normalizeText(text2)

  // Exact match
  if (norm1 === norm2) return true

  // High word overlap
  const words1 = new Set(norm1.split(/\s+/))
  const words2 = new Set(norm2.split(/\s+/))
  const intersection = new Set([...words1].filter(w => words2.has(w)))
  const union = new Set([...words1, ...words2])
  const similarity = intersection.size / union.size

  return similarity > 0.8
}
