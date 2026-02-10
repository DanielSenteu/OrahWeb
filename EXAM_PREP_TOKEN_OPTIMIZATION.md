# Exam Prep Edge Function - Token Optimization

## Problem
With 10 documents (20-50 pages each), the prompt exceeds OpenAI's token limits (30k TPM for GPT-4o).

## Solution: Document Summarization

### Approach
1. **Summarize each document first** using GPT-4o-mini (cheaper, faster)
2. **Use summaries in main prompt** instead of full text
3. **Store full documents** in database for quiz generation

### Benefits
- ✅ **90% token reduction**: Summaries are ~10-20% of original size
- ✅ **Faster processing**: Parallel summarization
- ✅ **Cost effective**: GPT-4o-mini for summaries (~10x cheaper)
- ✅ **Preserves full data**: Original documents stored for quiz generation
- ✅ **Better quality**: Summaries focus on key exam-relevant content

### Implementation Details

#### Document Summarization
- Documents < 5k chars: Used as-is
- Documents < 20k tokens: Single summarization call
- Documents > 20k tokens: Chunked and summarized in parallel

#### Token Limits
- **Summarization**: Uses GPT-4o-mini (128k context, cheaper)
- **Main plan**: Uses GPT-4o (128k context, better quality)
- **Chunk size**: 40k chars (~10k tokens) per chunk
- **Summary target**: 20-30% of original length

#### Processing Flow
```
1. Receive 10 documents (potentially 200-500 pages total)
2. For each document:
   - If small: use as-is
   - If medium: summarize once
   - If large: chunk → summarize chunks → combine
3. Combine all summaries + study materials
4. Extract topics from combined summaries
5. Generate study plan using summaries
6. Store FULL documents in database for quiz generation
```

### Example Token Reduction

**Before:**
- 10 documents × 50 pages × ~2000 chars/page = 1,000,000 chars
- Estimated tokens: ~250,000 tokens ❌ (exceeds limit)

**After:**
- 10 summaries × ~10,000 chars = 100,000 chars
- Estimated tokens: ~25,000 tokens ✅ (within limit)

### Error Handling
- If summarization fails: Falls back to truncated version (first 10k chars)
- If chunk summarization fails: Falls back to truncated chunk
- Function continues even if some documents fail to summarize

### Future Optimizations
1. **Caching**: Cache summaries for repeated documents
2. **Progressive summarization**: Multi-level summaries (very brief → detailed)
3. **Topic-based extraction**: Extract only relevant sections per topic
4. **Embeddings**: Use embeddings to find most relevant sections
