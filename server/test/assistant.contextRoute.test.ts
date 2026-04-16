import { describe, expect, it } from 'vitest'
import { resolveContextRoute } from '../src/lib/assistant/contextRoute.js'

describe('assistant context route', () => {
  it.each([
    '推荐相似题目',
    '推荐相似文章',
    '找同类型练习',
    '推荐文章',
    '类似题'
  ])('routes Chinese similar recommendation intent to similar: %s', (userQuery) => {
    expect(resolveContextRoute({
      questionId: 'sample-question',
      locale: 'zh',
      userQuery
    })).toBe('similar')
  })
})
