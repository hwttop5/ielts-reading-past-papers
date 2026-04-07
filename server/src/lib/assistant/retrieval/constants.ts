import type { AssistantContextRoute } from '../contextRoute.js'

/** Chunk budget by derived route (replaces legacy hint/explain/review modes). */
export const ROUTE_CONTEXT_LIMIT: Record<AssistantContextRoute, number> = { tutor: 6, review: 8, similar: 8 }
export const ROUTE_SEMANTIC_LIMIT: Record<AssistantContextRoute, number> = { tutor: 4, review: 4, similar: 6 }
/** Used when route === 'similar' (collectContext still runs; budget must be defined). */
export const SIMILAR_CONTEXT_BUDGET = 8
export const SIMILAR_SEMANTIC_LIMIT = 6

/** Narrow semantic search for vocabulary / synonym questions */
export const VOCAB_QUERY_SEMANTIC_LIMIT = 1
/** Narrow semantic search for single-paragraph content questions */
export const PARAGRAPH_FOCUS_QUERY_SEMANTIC_LIMIT = 2
/** Cap total chunks in context for brief answer styles */
export const BRIEF_ROUTE_CONTEXT_BUDGET: Record<'tutor' | 'review', number> = { tutor: 4, review: 5 }

/** Max supplemental passage chunks to add when primary evidence is missing */
export const MAX_SUPPLEMENTAL_PASSAGES = 2
