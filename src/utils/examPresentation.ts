import type { ReadingAstNode, ReadingElementNode } from '@/types/readingNative'

export interface ExamChoiceCollapseMatch {
  stemIndex: number
  choiceCount: number
}

const CHOICE_QUESTION_CLASSES = new Set([
  'question-item',
  'tfng-item',
  'tfng-question',
  'mc-question-item'
])

const CONTROL_NODE_TYPES = new Set([
  'choiceInput',
  'textInput',
  'textarea',
  'select',
  'dropzone',
  'optionChip'
])

function classTokens(node: ReadingElementNode): string[] {
  return String(node.attrs.class || '').split(/\s+/).filter(Boolean)
}

export function isExamChoiceQuestionElement(node: ReadingElementNode): boolean {
  return classTokens(node).some((token) => CHOICE_QUESTION_CLASSES.has(token))
}

function collectNodes(nodes: ReadingAstNode[], predicate: (node: ReadingAstNode) => boolean): ReadingAstNode[] {
  const matches: ReadingAstNode[] = []
  for (const node of nodes) {
    if (predicate(node)) {
      matches.push(node)
    }
    if (node.type === 'element') {
      matches.push(...collectNodes(node.children, predicate))
    }
  }
  return matches
}

function containsNestedChoiceQuestion(node: ReadingElementNode): boolean {
  return collectNodes(node.children, (child) => (
    child.type === 'element' && isExamChoiceQuestionElement(child)
  )).length > 0
}

function containsControl(nodes: ReadingAstNode[]): boolean {
  return collectNodes(nodes, (node) => CONTROL_NODE_TYPES.has(node.type)).length > 0
}

function textContent(nodes: ReadingAstNode[]): string {
  return nodes.map((node) => {
    if (node.type === 'text') {
      return node.text
    }
    if (node.type === 'element') {
      return textContent(node.children)
    }
    return ''
  }).join('')
}

function firstMeaningfulChildIndex(children: ReadingAstNode[]): number {
  return children.findIndex((child) => (
    child.type !== 'text' || Boolean(child.text.trim())
  ))
}

export function matchExamChoiceCollapse(node: ReadingElementNode): ExamChoiceCollapseMatch | null {
  if (!isExamChoiceQuestionElement(node) || containsNestedChoiceQuestion(node)) {
    return null
  }

  const stemIndex = firstMeaningfulChildIndex(node.children)
  if (stemIndex < 0) {
    return null
  }

  const stem = node.children[stemIndex]
  if (!stem || stem.type !== 'element' || (stem.tag !== 'p' && stem.tag !== 'div')) {
    return null
  }
  if (!textContent(stem.children).trim() || containsControl([stem])) {
    return null
  }

  const beforeStem = node.children.slice(0, stemIndex)
  if (containsControl(beforeStem)) {
    return null
  }

  const trailingNodes = node.children.slice(stemIndex + 1)
  const trailingControls = collectNodes(trailingNodes, (child) => CONTROL_NODE_TYPES.has(child.type))
  if (trailingControls.some((child) => child.type !== 'choiceInput')) {
    return null
  }

  const choices = trailingControls.filter((child) => child.type === 'choiceInput')
  if (choices.length < 2) {
    return null
  }

  const fieldNames = new Set(choices.map((choice) => (
    choice.type === 'choiceInput' ? choice.fieldName : ''
  )))
  if (fieldNames.size !== 1 || fieldNames.has('')) {
    return null
  }

  return { stemIndex, choiceCount: choices.length }
}
