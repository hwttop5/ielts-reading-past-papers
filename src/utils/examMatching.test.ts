import { describe, expect, it } from 'vitest'
import type { ReadingAstNode, ReadingExamDocument } from '@/types/readingNative'
import { adaptExamMatching } from './examMatching'
import { EXAM_MATCHING_SPECS } from './examMatchingSpecs'
import {
  assignDropzoneValue,
  buildPracticeSessionResult,
  buildQuestionGroupMeta,
  collectAnswers,
  createEmptyDraftState,
  hydrateDraftState
} from './readingPractice'

const modules = import.meta.glob('../generated/reading-native/exams/*.json', { eager: true })
const documents = Object.fromEntries(Object.values(modules).map(module => {
  const exam = (module as { default: ReadingExamDocument }).default
  return [exam.examId, exam]
}))
const auditedIds = [
  'p2-low-135', 'p1-low-35', 'p2-low-051', 'p3-low-158', 'p3-high-170',
  'p3-low-165', 'p3-high-161', 'p3-low-153', 'p3-medium-183', 'p2-medium-146',
  'p2-medium-058', 'p3-low-172', 'p3-high-180', 'p2-low-222', 'p3-high-159',
  'p2-high-120', 'p2-low-147', 'p3-high-178', 'p3-low-74'
]

function flatten(nodes: ReadingAstNode[]): ReadingAstNode[] {
  return nodes.flatMap(node => node.type === 'element' ? [node, ...flatten(node.children)] : [node])
}
function questionNodes(exam: ReadingExamDocument) {
  return flatten(exam.questionGroups.flatMap(group => [...group.leadNodes, ...group.contentNodes]))
}
function nonTargetControls(exam: ReadingExamDocument, ids: Set<string>) {
  return questionNodes(exam).filter(node => 'questionId' in node && !ids.has(node.questionId))
}

 describe('audited exam matching presentation', () => {
  it('covers exactly the nineteen approved records and leaves unaudited documents alone', () => {
    expect(Object.keys(EXAM_MATCHING_SPECS).sort()).toEqual([...auditedIds].sort())
    const unaudited = Object.values(documents).filter(exam => !auditedIds.includes(exam.examId))
    expect(unaudited.length).toBeGreaterThan(100)
    for (const exam of unaudited) expect(adaptExamMatching(exam)).toBe(exam)
  })

  for (const examId of auditedIds) {
    it(`${examId}: converts only matching controls and preserves source, grading and saved answers`, () => {
      const source = documents[examId]
      const before = JSON.stringify(source)
      const spec = EXAM_MATCHING_SPECS[examId]
      const exam = adaptExamMatching(source)
      const target = new Set(spec.questionIds)
      const nodes = questionNodes(exam)
      expect(exam).not.toBe(source)
      expect(JSON.stringify(source)).toBe(before)
      expect(exam.answerKey).toEqual(source.answerKey)
      expect(exam.questionOrder).toEqual(source.questionOrder)
      expect(exam.questionDisplayMap).toEqual(source.questionDisplayMap)
      expect(exam.passageBlocks).toEqual(source.passageBlocks)
      expect(nonTargetControls(exam, target)).toEqual(nonTargetControls(source, target))
      expect(exam.fields.choiceGroups).toEqual(source.fields.choiceGroups.filter(field => !field.questionIds.some(id => target.has(id))))
      expect(exam.fields.textQuestions).toEqual(source.fields.textQuestions.filter(id => !target.has(id)))
      expect(exam.fields.selectQuestions).toEqual(source.fields.selectQuestions.filter(id => !target.has(id)))
      expect(exam.fields.textareaQuestions).toEqual(source.fields.textareaQuestions)
      expect(exam.fields.dropzoneQuestions).toEqual([...new Set([...source.fields.dropzoneQuestions, ...spec.questionIds])])

      const meta = buildQuestionGroupMeta(exam)
      for (const id of spec.questionIds) {
        const controls = nodes.filter(node => 'questionId' in node && node.questionId === id)
        expect(controls).toHaveLength(1)
        expect(controls[0].type).toBe('dropzone')
        expect(meta[id].poolIds).toHaveLength(1)
        expect(meta[id].allowOptionReuse).toBe(spec.allowOptionReuse)
        const chips = nodes.filter(node => node.type === 'optionChip' && meta[id].poolIds.includes(node.poolId))
        expect(chips.map(node => node.type === 'optionChip' && ({ value: node.value, label: node.label }))).toEqual(spec.options)
        expect(nodes.filter(node => node.type !== 'text' && node.attrs.id === exam.questionAnchors[id])).toHaveLength(1)
      }

      const originalAnswers = Object.fromEntries(spec.questionIds.map(id => [id, source.answerKey[id]]))
      const draft = hydrateDraftState(exam, originalAnswers)
      const answers = collectAnswers(exam, draft)
      const result = buildPracticeSessionResult({ exam, answers, markedQuestions: [], highlights: [], mode: 'simulation' })
      for (const id of spec.questionIds) {
        expect(result.answerComparison[id].isCorrect).toBe(true)
        expect(draft.dropzoneAnswers[id]?.poolId).toBe(meta[id].poolIds[0])
        const chosen = spec.options.find(option => option.value === draft.dropzoneAnswers[id]?.value)
        expect(chosen).toBeDefined()
        expect(draft.dropzoneAnswers[id]?.label).toBe(chosen?.label)
      }

      const [first, second] = spec.questionIds
      const option = { ...spec.options[0], poolId: meta[first].poolIds[0] }
      const once = assignDropzoneValue(createEmptyDraftState(), exam, first, option, meta)
      const twice = assignDropzoneValue(once, exam, second, option, meta)
      expect(twice.dropzoneAnswers[second]).toEqual(option)
      expect(twice.dropzoneAnswers[first]).toEqual(spec.allowOptionReuse ? option : null)
      expect(once.dropzoneAnswers[first]).toEqual(option)
      const removed = assignDropzoneValue(twice, exam, second, null, meta)
      expect(collectAnswers(exam, removed)[second]).toBe('')
    })
  }

  it('retains every other question and instruction in the mixed multitasking group', () => {
    const source = documents['p3-medium-183']
    const exam = adaptExamMatching(source)
    const group = source.questionGroups.find(item => item.groupId === EXAM_MATCHING_SPECS[source.examId].groupId)!
    const adaptedGroup = exam.questionGroups.find(item => item.groupId === group.groupId)!
    const keep = (node: ReadingAstNode) => !(node.type === 'element' && node.attrs.id === 'q1-31-section')
    expect(adaptedGroup.leadNodes.filter(keep)).toEqual(group.leadNodes.filter(keep))
    expect(adaptedGroup.contentNodes).toEqual(group.contentNodes)
  })
})
