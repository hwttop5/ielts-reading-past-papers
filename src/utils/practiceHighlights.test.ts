import { describe, expect, it } from 'vitest'
import {
  buildHighlightSegments,
  createRangeHighlightRecord,
  normalizePracticeHighlightRecord,
  sameHighlightRecord
} from './practiceHighlights'

describe('practice highlight utils', () => {
  it('normalizes legacy and anchored highlight records', () => {
    const legacy = normalizePracticeHighlightRecord({
      scope: 'passage',
      text: '  solar   wind  '
    })
    const anchored = normalizePracticeHighlightRecord({
      scope: 'questions',
      text: ' answer ',
      startPath: '2.1',
      startOffset: '3',
      endPath: '2.1',
      endOffset: 9
    })

    expect(legacy).toMatchObject({
      scope: 'passage',
      text: 'solar wind'
    })
    expect(legacy?.id).toContain('legacy:')

    expect(anchored).toMatchObject({
      scope: 'questions',
      text: 'answer',
      startPath: '2.1',
      startOffset: 3,
      endPath: '2.1',
      endOffset: 9
    })
    expect(anchored?.id).toContain('range:')
  })

  it('preserves note metadata while normalizing a highlight record', () => {
    const noted = normalizePracticeHighlightRecord({
      scope: 'passage',
      text: '  tea ceremony  ',
      startPath: '1.2',
      startOffset: 4,
      endPath: '1.2',
      endOffset: 16,
      note: '  Ritual clue  ',
      noteUpdatedAt: '2026-05-17T10:00:00.000Z'
    })

    expect(noted).toMatchObject({
      scope: 'passage',
      text: 'tea ceremony',
      note: 'Ritual clue',
      noteUpdatedAt: '2026-05-17T10:00:00.000Z'
    })
    expect(noted?.id).toContain('range:')
  })

  it('highlights only the selected occurrence when the same word appears multiple times', () => {
    const anchored = createRangeHighlightRecord({
      scope: 'passage',
      text: 'alpha',
      startPath: '0',
      startOffset: 11,
      endPath: '0',
      endOffset: 16
    })

    const segments = buildHighlightSegments('alpha beta alpha', '0', anchored ? [anchored] : [])

    expect(segments).toEqual([
      {
        text: 'alpha beta ',
        highlight: false,
        startOffset: 0,
        endOffset: 11
      },
      {
        text: 'alpha',
        highlight: true,
        startOffset: 11,
        endOffset: 16
      }
    ])
  })

  it('replays a highlight across multiple text nodes', () => {
    const anchored = createRangeHighlightRecord({
      scope: 'passage',
      text: 'world again',
      startPath: '1.0',
      startOffset: 6,
      endPath: '1.1',
      endOffset: 5
    })

    const firstNodeSegments = buildHighlightSegments('Hello world', '1.0', anchored ? [anchored] : [])
    const secondNodeSegments = buildHighlightSegments('again soon', '1.1', anchored ? [anchored] : [])

    expect(firstNodeSegments).toEqual([
      {
        text: 'Hello ',
        highlight: false,
        startOffset: 0,
        endOffset: 6
      },
      {
        text: 'world',
        highlight: true,
        startOffset: 6,
        endOffset: 11
      }
    ])

    expect(secondNodeSegments).toEqual([
      {
        text: 'again',
        highlight: true,
        startOffset: 0,
        endOffset: 5
      },
      {
        text: ' soon',
        highlight: false,
        startOffset: 5,
        endOffset: 10
      }
    ])
  })

  it('treats a new anchored selection and a legacy text-only highlight as the same fallback match', () => {
    const legacy = normalizePracticeHighlightRecord({
      scope: 'passage',
      text: 'keyword'
    })
    const anchored = createRangeHighlightRecord({
      scope: 'passage',
      text: 'keyword',
      startPath: '0',
      startOffset: 12,
      endPath: '0',
      endOffset: 19
    })

    expect(sameHighlightRecord(legacy, anchored)).toBe(true)
  })

  it('marks note-backed segments as clickable note highlights', () => {
    const noted = createRangeHighlightRecord({
      scope: 'passage',
      text: 'tea',
      startPath: '0',
      startOffset: 4,
      endPath: '0',
      endOffset: 7
    })
    const segments = buildHighlightSegments('hot tea today', '0', noted ? [{ ...noted, note: 'Key drink' }] : [])

    expect(segments).toEqual([
      {
        text: 'hot ',
        highlight: false,
        startOffset: 0,
        endOffset: 4
      },
      expect.objectContaining({
        text: 'tea',
        highlight: true,
        startOffset: 4,
        endOffset: 7,
        note: 'Key drink',
        highlightId: noted?.id,
        record: expect.objectContaining({
          note: 'Key drink'
        })
      }),
      {
        text: ' today',
        highlight: false,
        startOffset: 7,
        endOffset: 13
      }
    ])
  })
})
