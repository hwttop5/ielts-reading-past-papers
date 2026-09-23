import type { ReadingAstNode, ReadingExamDocument } from '@/types/readingNative'
import { EXAM_MATCHING_SPECS } from './examMatchingSpecs'

const text = (value: string): ReadingAstNode => ({ type: 'text', text: value })
const element = (tag: string, children: ReadingAstNode[], attrs: Record<string, string> = {}): ReadingAstNode => ({ type: 'element', tag, attrs, children })

/** Adapt the audited legacy matching sections only; never mutate cached source data. */
export function adaptExamMatching(source: ReadingExamDocument): ReadingExamDocument {
  const spec = EXAM_MATCHING_SPECS[source.examId]
  if (!spec || source.options.some(option => option.poolId === `exam-matching-${spec.groupId}`)) return source
  const exam: ReadingExamDocument = JSON.parse(JSON.stringify(source))
  const group = exam.questionGroups.find(item => item.groupId === spec.groupId)
  if (!group) return source
  const ids = new Set(spec.questionIds)
  const poolId = `exam-matching-${spec.groupId}`
  const first = exam.questionDisplayMap[spec.questionIds[0]]
  const last = exam.questionDisplayMap[spec.questionIds[spec.questionIds.length - 1]]
  const range = `${spec.options[0].value}–${spec.options[spec.options.length - 1].value}`
  const nodes: ReadingAstNode[] = [
    element('h4', [text(`Questions ${first}–${last}`)]),
    element('p', [text(spec.instruction || (spec.kind === 'people'
      ? `Match each statement with the correct person or people, ${range}, below.`
      : `Complete each sentence with the correct ending, ${range}, below.`))]),
    ...(spec.allowOptionReuse ? [element('p', [text('NB You may use any letter more than once.')])] : []),
    ...spec.statements.map(statement => element('div', [
      element('p', [element('strong', [text(exam.questionDisplayMap[statement.questionId])]), text(` ${statement.text}`)]),
      { type: 'dropzone', appearance: 'match', questionId: statement.questionId, paragraph: '', labelText: '', attrs: { id: `exam-match-${statement.questionId}` } } as ReadingAstNode
    ], { class: 'exam-matching-item' })),
    element('h4', [text(spec.poolTitle || (spec.kind === 'people' ? 'List of People' : 'List of Endings'))]),
    element('div', spec.options.map(option => ({ type: 'optionChip', poolId, value: option.value, label: option.label, attrs: {} })), { class: 'exam-matching-pool' })
  ]
  if (source.examId === 'p3-medium-183') {
    // This source puts all four question types in leadNodes of a single group.
    group.leadNodes = group.leadNodes.map(node => node.type === 'element' && node.attrs.id === 'q1-31-section'
      ? element('div', nodes, { id: 'q1-31-section' }) : node)
  } else {
    group.leadNodes = []
    group.contentNodes = nodes
  }
  group.allowOptionReuse = spec.allowOptionReuse
  exam.options.push(...spec.options.map(option => ({ ...option, poolId })))
  exam.fields.choiceGroups = exam.fields.choiceGroups.filter(field => !field.questionIds.some(id => ids.has(id)))
  exam.fields.textQuestions = exam.fields.textQuestions.filter(id => !ids.has(id))
  exam.fields.selectQuestions = exam.fields.selectQuestions.filter(id => !ids.has(id))
  exam.fields.dropzoneQuestions = [...new Set([...exam.fields.dropzoneQuestions, ...spec.questionIds])]
  for (const item of exam.questionItems) {
    if (ids.has(item.questionId)) {
      item.anchorId = `exam-match-${item.questionId}`
      exam.questionAnchors[item.questionId] = item.anchorId
    }
  }
  return exam
}
