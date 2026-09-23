import { describe, expect, it } from 'vitest'
import { matchExamChoiceCollapse } from './examPresentation'
import type { ReadingAstNode, ReadingElementNode } from '@/types/readingNative'

function choice(value: string, fieldName = 'q1'): ReadingAstNode {
  return {
    type: 'choiceInput',
    inputType: 'radio',
    fieldName,
    questionId: fieldName,
    questionIds: [fieldName],
    value,
    attrs: {}
  }
}

function candidate(children: ReadingAstNode[], className = 'question-item'): ReadingElementNode {
  return { type: 'element', tag: 'div', attrs: { class: className }, children }
}

const textStem: ReadingElementNode = {
  type: 'element',
  tag: 'p',
  attrs: {},
  children: [
    { type: 'element', tag: 'strong', attrs: {}, children: [{ type: 'text', text: '1' }] },
    { type: 'text', text: ' A clear question stem' }
  ]
}

describe('matchExamChoiceCollapse', () => {
  it.each(['question-item', 'tfng-item', 'tfng-question', 'mc-question-item'])(
    'recognizes a conservative %s stem followed by one choice group',
    (className) => {
      const node = candidate([
        { type: 'text', text: '\n  ' },
        textStem,
        {
          type: 'element',
          tag: 'div',
          attrs: { class: 'radio-options' },
          children: [choice('A'), choice('B'), choice('C')]
        }
      ], className)

      expect(matchExamChoiceCollapse(node)).toEqual({ stemIndex: 1, choiceCount: 3 })
    }
  )

  it('recognizes direct option labels after the stem', () => {
    const option = (value: string): ReadingElementNode => ({
      type: 'element',
      tag: 'label',
      attrs: { class: 'mc-option' },
      children: [choice(value), { type: 'text', text: ` ${value} option` }]
    })
    expect(matchExamChoiceCollapse(candidate([textStem, option('A'), option('B')], 'mc-question-item')))
      .toEqual({ stemIndex: 0, choiceCount: 2 })
  })

  it('rejects ambiguous, mixed, nested, and multi-group structures', () => {
    expect(matchExamChoiceCollapse(candidate([choice('A'), choice('B')]))).toBeNull()
    expect(matchExamChoiceCollapse(candidate([
      { ...textStem, children: [choice('A')] }, choice('A'), choice('B')
    ]))).toBeNull()
    expect(matchExamChoiceCollapse(candidate([
      textStem,
      candidate([textStem, choice('A'), choice('B')]),
      choice('A'),
      choice('B')
    ]))).toBeNull()
    expect(matchExamChoiceCollapse(candidate([
      textStem,
      choice('A'),
      { type: 'textInput', questionId: 'q1', fieldName: 'q1', attrs: {} }
    ]))).toBeNull()
    expect(matchExamChoiceCollapse(candidate([
      textStem,
      choice('A', 'q1'),
      choice('B', 'q2')
    ]))).toBeNull()
  })

  it('leaves unrelated containers unchanged', () => {
    expect(matchExamChoiceCollapse(candidate([textStem, choice('A'), choice('B')], 'matching-item')))
      .toBeNull()
  })
})
