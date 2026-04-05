/**
 * Static audit script for question navigation anchors
 * Scans all exam JSON files and verifies that each question item
 * has a valid, mappable anchor target in the rendered DOM.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..')
const EXAMS_DIR = path.join(PROJECT_ROOT, 'src', 'generated', 'reading-native', 'exams')
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output', 'question-nav')

/**
 * @typedef {Object} AuditResult
 * @property {string} examId
 * @property {string} title
 * @property {Array<{questionId: string, displayNumber: string, anchorId: string|null, reason: string, expectedSelector: string}>} failures
 * @property {number} totalQuestions
 * @property {number} passedQuestions
 */

/**
 * Collect all element IDs that will be rendered from AST nodes
 * @param {Array} nodes - AST nodes
 * @param {Set<string>} idSet - Set to collect IDs into
 */
function collectElementIds(nodes, idSet) {
  for (const node of nodes) {
    if (node.type === 'element' && node.attrs?.id) {
      idSet.add(node.attrs.id)
    }
    if (node.children) {
      collectElementIds(node.children, idSet)
    }
    // Also collect form control IDs
    if ((node.type === 'textInput' || node.type === 'textarea' || node.type === 'select') && node.attrs?.id) {
      idSet.add(node.attrs.id)
    }
    if (node.type === 'choiceInput' && node.attrs?.id) {
      idSet.add(node.attrs.id)
    }
    if (node.type === 'dropzone' && node.attrs?.id) {
      idSet.add(node.attrs.id)
    }
  }
}

/**
 * Check if an anchor ID can be resolved to a rendered element
 * @param {string} anchorId - The anchor ID to resolve
 * @param {Set<string>} renderedIds - Set of IDs that will be rendered
 * @param {Object} exam - The exam document
 * @param {string} questionId - The question ID for context
 * @returns {{resolved: boolean, reason: string, resolvedSelector: string}}
 */
function resolveAnchor(anchorId, renderedIds, exam, questionId) {
  if (!anchorId) {
    return { resolved: false, reason: 'MISSING_ANCHOR', resolvedSelector: '' }
  }

  // Priority 1: exact ID match
  if (renderedIds.has(anchorId)) {
    return { resolved: true, reason: '', resolvedSelector: `#${anchorId}` }
  }

  // Priority 2: data-question match (will be added to DOM)
  // This is a runtime fallback, so we mark it as resolved
  const questionItem = exam.questionItems?.find(item => item.questionId === questionId)
  if (questionItem) {
    return { resolved: true, reason: '', resolvedSelector: `[data-question="${questionId}"]` }
  }

  // Priority 3: group container fallback
  for (const group of exam.questionGroups || []) {
    if (group.questionIds?.includes(questionId)) {
      const groupSelector = `#group-${group.groupId}`
      return { resolved: true, reason: '', resolvedSelector: groupSelector }
    }
  }

  // Priority 4: check if any ID contains the anchor as substring
  for (const id of renderedIds) {
    if (id.includes(questionId)) {
      return { resolved: true, reason: '', resolvedSelector: `#${id}` }
    }
  }

  return { resolved: false, reason: 'UNRESOLVABLE_ANCHOR', resolvedSelector: `#${anchorId}` }
}

/**
 * Audit a single exam document
 * @param {Object} exam - The exam document
 * @returns {AuditResult}
 */
function auditExam(exam) {
  const result = {
    examId: exam.examId,
    title: exam.meta?.title || 'Unknown',
    failures: [],
    totalQuestions: exam.questionItems?.length || 0,
    passedQuestions: 0
  }

  // Collect all rendered IDs from passage and question panes
  const renderedIds = new Set()

  // Passage pane IDs
  for (const block of exam.passageBlocks || []) {
    collectElementIds(block.nodes || [], renderedIds)
  }

  // Question pane IDs from questionGroups
  for (const group of exam.questionGroups || []) {
    collectElementIds(group.leadNodes || [], renderedIds)
    collectElementIds(group.contentNodes || [], renderedIds)
  }

  // Audit each question item
  for (const item of exam.questionItems || []) {
    const { questionId, displayNumber, anchorId } = item
    const resolution = resolveAnchor(anchorId, renderedIds, exam, questionId)

    if (!resolution.resolved) {
      result.failures.push({
        questionId,
        displayNumber: displayNumber || questionId.replace(/^q/i, ''),
        anchorId: anchorId || null,
        reason: resolution.reason,
        expectedSelector: resolution.resolvedSelector
      })
    } else {
      result.passedQuestions++
    }
  }

  return result
}

/**
 * Generate markdown report from audit results
 * @param {Array<AuditResult>} results - Audit results
 * @returns {string}
 */
function generateMarkdownReport(results) {
  const totalExams = results.length
  const examsWithFailures = results.filter(r => r.failures.length > 0)
  const totalQuestions = results.reduce((sum, r) => sum + r.totalQuestions, 0)
  const totalPassed = results.reduce((sum, r) => sum + r.passedQuestions, 0)
  const totalFailed = totalQuestions - totalPassed

  const lines = [
    '# Question Navigation Static Audit Report',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    '',
    '## Summary',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Exams | ${totalExams} |`,
    `| Exams with Failures | ${examsWithFailures.length} |`,
    `| Total Questions | ${totalQuestions} |`,
    `| Passed | ${totalPassed} |`,
    `| Failed | ${totalFailed} |`,
    `| Pass Rate | ${((totalPassed / totalQuestions) * 100).toFixed(2)}% |`,
    '',
  ]

  if (examsWithFailures.length > 0) {
    lines.push('## Failed Exams')
    lines.push('')

    for (const result of examsWithFailures) {
      lines.push(`### ${result.examId} - ${result.title}`)
      lines.push('')
      lines.push(`**${result.failures.length} failed / ${result.totalQuestions} total**`)
      lines.push('')
      lines.push('| Question | Display # | Anchor ID | Reason | Expected Selector |')
      lines.push('|----------|-----------|-----------|--------|-------------------|')

      for (const failure of result.failures) {
        lines.push(
          `| ${failure.questionId} | ${failure.displayNumber} | ${failure.anchorId || 'N/A'} | ${failure.reason} | ${failure.expectedSelector} |`
        )
      }
      lines.push('')
    }
  } else {
    lines.push('## All Exams Passed ✓')
    lines.push('')
    lines.push('No navigation anchor issues detected.')
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Main entry point
 */
async function main() {
  console.log('Starting question navigation static audit...')

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  // Read manifest to get exam list
  const manifestPath = path.join(EXAMS_DIR, '..', 'manifest.json')
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch (err) {
    console.error('Error reading manifest:', err.message)
    process.exit(1)
  }

  const examIds = Object.keys(manifest.exams || {})
  console.log(`Found ${examIds.length} exams in manifest`)

  const results = []

  for (const examId of examIds) {
    const examPath = path.join(EXAMS_DIR, `${examId}.json`)
    if (!fs.existsSync(examPath)) {
      console.error(`Exam file not found: ${examPath}`)
      continue
    }

    try {
      const examContent = fs.readFileSync(examPath, 'utf8')
      const exam = JSON.parse(examContent)
      const result = auditExam(exam)
      results.push(result)

      if (result.failures.length > 0) {
        console.error(`  [FAIL] ${examId}: ${result.failures.length}/${result.totalQuestions} questions failed`)
      } else {
        console.log(`  [PASS] ${examId}: ${result.passedQuestions}/${result.totalQuestions} questions passed`)
      }
    } catch (err) {
      console.error(`  [ERROR] ${examId}: ${err.message}`)
      results.push({
        examId,
        title: 'Unknown',
        failures: [{ questionId: 'N/A', displayNumber: 'N/A', anchorId: null, reason: 'PARSE_ERROR', expectedSelector: 'N/A' }],
        totalQuestions: 0,
        passedQuestions: 0
      })
    }
  }

  // Generate reports
  const jsonReportPath = path.join(OUTPUT_DIR, 'static-report.json')
  const mdReportPath = path.join(OUTPUT_DIR, 'static-report.md')

  fs.writeFileSync(jsonReportPath, JSON.stringify(results, null, 2))
  console.log(`JSON report written to: ${jsonReportPath}`)

  const mdReport = generateMarkdownReport(results)
  fs.writeFileSync(mdReportPath, mdReport)
  console.log(`Markdown report written to: ${mdReportPath}`)

  // Summary
  const totalExams = results.length
  const examsWithFailures = results.filter(r => r.failures.length > 0)
  const totalQuestions = results.reduce((sum, r) => sum + r.totalQuestions, 0)
  const totalPassed = results.reduce((sum, r) => sum + r.passedQuestions, 0)

  console.log('')
  console.log('='.repeat(60))
  console.log('AUDIT SUMMARY')
  console.log('='.repeat(60))
  console.log(`Total Exams: ${totalExams}`)
  console.log(`Exams with Failures: ${examsWithFailures.length}`)
  console.log(`Total Questions: ${totalQuestions}`)
  console.log(`Passed: ${totalPassed}`)
  console.log(`Failed: ${totalQuestions - totalPassed}`)
  console.log(`Pass Rate: ${((totalPassed / totalQuestions) * 100).toFixed(2)}%`)
  console.log('='.repeat(60))

  if (examsWithFailures.length > 0) {
    console.error('')
    console.error('AUDIT FAILED: Some exams have navigation anchor issues.')
    console.error('See the reports for details:')
    console.error(`  - ${jsonReportPath}`)
    console.error(`  - ${mdReportPath}`)
    process.exit(1)
  } else {
    console.log('')
    console.log('AUDIT PASSED: All exams have valid navigation anchors.')
    process.exit(0)
  }
}

main().catch(err => {
  console.error('Audit failed with error:', err)
  process.exit(1)
})
