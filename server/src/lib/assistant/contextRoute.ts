import type { AssistantQueryRequest } from '../../types/assistant.js'

/** Derived server-side routing (no longer sent by clients as `mode`). */
export type AssistantContextRoute = 'tutor' | 'review' | 'similar'

/**
 * Infer retrieval / response shape from action, surface, attempt context, and wording.
 * - similar: explicit recommend action or similarity-style ask
 * - review: mistake review / workspace / wrong-answer analysis when wrong questions exist
 * - tutor: default grounded coaching (passage + questions, no answer keys in context)
 */
export function resolveContextRoute(request: AssistantQueryRequest): AssistantContextRoute {
  if (request.action === 'recommend_drills') {
    return 'similar'
  }

  const q = (request.userQuery || '').trim()
  if (/相似|类似|同质|同类型|同类题|推荐.*(?:练习|题目|文章)|找.*(?:同类型|类似)|similar\s+(?:practice|passages?|questions?|articles?)|recommend\s+similar/i.test(q)) {
    return 'similar'
  }

  if (request.action === 'review_set' || request.action === 'analyze_mistake') {
    return 'review'
  }

  const wrong = request.attemptContext?.wrongQuestions?.length ?? 0
  if (request.surface === 'review_workspace' && wrong > 0) {
    return 'review'
  }

  if (
    wrong > 0 &&
    /错题|错因|为什么错|复盘|wrong|mistake|为什么|错了吗|review\s+my|analyze\s+(all\s+)?wrong/i.test(q)
  ) {
    return 'review'
  }

  return 'tutor'
}
