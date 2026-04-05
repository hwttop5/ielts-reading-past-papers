export const MODE_CONTEXT_LIMIT: Record<'hint' | 'explain' | 'review', number> = { hint: 4, explain: 6, review: 8 }
export const MODE_SEMANTIC_LIMIT: Record<'hint' | 'explain' | 'review', number> = { hint: 4, explain: 6, review: 8 }
/** Used when `mode === 'similar'` (collectContext still runs; budget must be defined). */
export const SIMILAR_CONTEXT_BUDGET = 8
export const SIMILAR_SEMANTIC_LIMIT = 8

/** Narrow semantic search for vocabulary / synonym questions */
export const VOCAB_QUERY_SEMANTIC_LIMIT = 1
/** Narrow semantic search for single-paragraph content questions */
export const PARAGRAPH_FOCUS_QUERY_SEMANTIC_LIMIT = 2
/** Cap total chunks in context for brief answer styles */
export const BRIEF_MODE_CONTEXT_BUDGET: Record<'hint' | 'explain' | 'review', number> = { hint: 3, explain: 4, review: 5 }

/** Max supplemental passage chunks to add when primary evidence is missing */
export const MAX_SUPPLEMENTAL_PASSAGES = 2
