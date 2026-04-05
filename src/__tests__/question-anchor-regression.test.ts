import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '../..')
const EXAMS_DIR = path.join(PROJECT_ROOT, 'src', 'generated', 'reading-native', 'exams')

interface QuestionAnchorMapping {
  examId: string
  missingAnchors: string[]
  invalidAnchors: Array<{ questionId: string; anchorId: string; reason: string }>
}

describe('Question Anchor Regression', () => {
  let examFiles: string[]
  let examResults: QuestionAnchorMapping[]

  beforeAll(() => {
    examFiles = fs
      .readdirSync(EXAMS_DIR)
      .filter((file) => file.endsWith('.json'))
      .sort()
  })

  beforeEach(() => {
    examResults = []
  })

  it('should have all questionItems mappable to DOM elements (runtime simulation)', () => {
    for (const file of examFiles) {
      const examPath = path.join(EXAMS_DIR, file)
      const exam = JSON.parse(fs.readFileSync(examPath, 'utf8'))

      const result: QuestionAnchorMapping = {
        examId: exam.examId,
        missingAnchors: [],
        invalidAnchors: []
      }

      // Collect elements that will be rendered in passage pane
      const passageDomElements = new Set<string>()
      function collectPassageElementIds(nodes: any[]) {
        for (const node of nodes) {
          if (node.type === 'element' && node.attrs?.id) {
            passageDomElements.add(node.attrs.id)
          }
          if (node.children) {
            collectPassageElementIds(node.children)
          }
        }
      }
      for (const block of exam.passageBlocks || []) {
        collectPassageElementIds(block.nodes)
      }

      // Collect elements that will be rendered in question pane
      const questionDomElements = new Set<string>()
      function collectQuestionElementIds(nodes: any[]) {
        for (const node of nodes) {
          if (node.type === 'element' && node.attrs?.id) {
            questionDomElements.add(node.attrs.id)
          }
          if (node.type === 'textInput' && node.attrs?.id) {
            questionDomElements.add(node.attrs.id)
          }
          if (node.type === 'textarea' && node.attrs?.id) {
            questionDomElements.add(node.attrs.id)
          }
          if (node.type === 'select' && node.attrs?.id) {
            questionDomElements.add(node.attrs.id)
          }
          if (node.type === 'choiceInput' && node.attrs?.id) {
            questionDomElements.add(node.attrs.id)
          }
          if (node.children) {
            collectQuestionElementIds(node.children)
          }
        }
      }
      for (const group of exam.questionGroups || []) {
        collectQuestionElementIds(group.contentNodes)
        collectQuestionElementIds(group.leadNodes)
      }

      // Check each question item - simulate runtime lookup
      for (const item of exam.questionItems || []) {
        const { questionId, anchorId } = item

        // Check 1: anchorId should exist
        if (!anchorId) {
          result.missingAnchors.push(questionId)
          continue
        }

        // Simulate runtime lookup:
        // Priority 1: exact anchorId in passage pane
        let found = passageDomElements.has(anchorId)
        // Priority 2: exact anchorId in question pane
        if (!found) found = questionDomElements.has(anchorId)
        // Priority 3: data-question match (simplified check)
        // Priority 4: group container match
        if (!found) {
          for (const group of exam.questionGroups || []) {
            if (group.questionIds?.includes(questionId)) {
              found = true
              break
            }
          }
        }

        if (!found) {
          result.missingAnchors.push(questionId)
        }
      }

      examResults.push(result)
    }

    // Report results
    const examsWithIssues = examResults.filter(
      (r) => r.missingAnchors.length > 0 || r.invalidAnchors.length > 0
    )

    if (examsWithIssues.length > 0) {
      const report = examsWithIssues
        .map((r) => {
          const lines = [`Exam: ${r.examId}`]
          if (r.missingAnchors.length > 0) {
            lines.push(`  Missing anchors: ${r.missingAnchors.join(', ')}`)
          }
          if (r.invalidAnchors.length > 0) {
            lines.push(`  Invalid anchors:`)
            r.invalidAnchors.forEach((issue) => {
              lines.push(`    - ${issue.questionId}: ${issue.reason} (anchor: ${issue.anchorId})`)
            })
          }
          return lines.join('\n')
        })
        .join('\n\n')

      throw new Error(`Found ${examsWithIssues.length} exams with anchor issues:\n\n${report}`)
    }
  })

  it('should have correct anchor patterns for shared choice groups', () => {
    const sharedGroupIssues: Array<{ examId: string; questionId: string; anchorId: string; reason: string }> = []

    for (const file of examFiles) {
      const examPath = path.join(EXAMS_DIR, file)
      const exam = JSON.parse(fs.readFileSync(examPath, 'utf8'))

      // Find choice groups with multiple questions
      const choiceGroups = exam.fields?.choiceGroups || []

      for (const group of choiceGroups) {
        if (!group.questionIds || group.questionIds.length <= 1) {
          continue
        }

        // All questions in the same group should map to the same group anchor
        const groupAnchor = `${group.name}_group`
        const anchorsForGroup = new Set<string>()

        for (const questionId of group.questionIds) {
          const anchorId = exam.questionAnchors?.[questionId]
          if (anchorId) {
            anchorsForGroup.add(anchorId)
          }
        }

        // All questions should map to the same anchor
        if (anchorsForGroup.size > 1) {
          for (const questionId of group.questionIds) {
            const anchorId = exam.questionAnchors?.[questionId]
            sharedGroupIssues.push({
              examId: exam.examId,
              questionId,
              anchorId: anchorId || 'N/A',
              reason: `Questions in same group have different anchors: ${Array.from(anchorsForGroup).join(', ')}`
            })
          }
        }
      }
    }

    if (sharedGroupIssues.length > 0) {
      const report = sharedGroupIssues
        .map((issue) => `${issue.examId} - ${issue.questionId}: ${issue.reason} (got: ${issue.anchorId})`)
        .join('\n')
      throw new Error(`Found ${sharedGroupIssues.length} shared group anchor issues:\n\n${report}`)
    }
  })
})
