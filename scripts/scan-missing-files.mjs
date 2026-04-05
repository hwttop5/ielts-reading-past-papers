/**
 * Scan for missing PDFs and exam JSON files
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

// Read question index
const questionIndexPath = path.join(rootDir, 'src/utils/questionIndex.json')
const questions = JSON.parse(fs.readFileSync(questionIndexPath, 'utf-8'))

// PDF directory
const pdfDir = path.join(rootDir, 'public/ReadingPractice/PDF')
const pdfFiles = fs.existsSync(pdfDir) ? fs.readdirSync(pdfDir) : []

// Exam JSON directory
const examJsonDir = path.join(rootDir, 'src/generated/reading-native/exams')
const examJsonFiles = fs.existsSync(examJsonDir) ? fs.readdirSync(examJsonDir) : []

// Explanation JSON directory
const explanationJsonDir = path.join(rootDir, 'src/generated/reading-native/explanations')
const explanationJsonFiles = fs.existsSync(explanationJsonDir) ? fs.readdirSync(explanationJsonDir) : []

const missingPDFs = []
const missingExamJSONs = []
const missingExplanationJSONs = []
const hasPDF = []
const hasExamJSON = []
const hasExplanationJSON = []

questions.forEach(q => {
  // Check PDF
  if (q.pdfPath) {
    const pdfFileName = q.pdfPath.split('/').pop()
    const pdfExists = pdfFiles.some(f => f === pdfFileName)
    if (pdfExists) {
      hasPDF.push(q.id)
    } else {
      missingPDFs.push({ id: q.id, title: q.title, pdfPath: q.pdfPath })
    }
  } else {
    missingPDFs.push({ id: q.id, title: q.title, pdfPath: null })
  }

  // Check Exam JSON
  const examJsonName = `${q.id}.json`
  const examJsonExists = examJsonFiles.some(f => f === examJsonName)
  if (examJsonExists) {
    hasExamJSON.push(q.id)
  } else {
    missingExamJSONs.push({ id: q.id, title: q.title })
  }

  // Check Explanation JSON if hasExplanation is true
  if (q.hasExplanation) {
    const explanationJsonName = `${q.explanationKey || q.id}.json`
    const explanationJsonExists = explanationJsonFiles.some(f => f === explanationJsonName)
    if (explanationJsonExists) {
      hasExplanationJSON.push(q.id)
    } else {
      missingExplanationJSONs.push({ id: q.id, title: q.title, explanationKey: q.explanationKey || q.id })
    }
  }
})

console.log('='.repeat(80))
console.log('MISSING FILES SCAN REPORT')
console.log('='.repeat(80))
console.log()

console.log(`Total Questions: ${questions.length}`)
console.log()

// PDF Summary
console.log('-'.repeat(80))
console.log(`PDF FILES: ${hasPDF.length}/${questions.length} found, ${missingPDFs.length} missing`)
console.log('-'.repeat(80))
if (missingPDFs.length > 0) {
  console.log(`Missing PDFs (${missingPDFs.length}):`)
  missingPDFs.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.id} - ${item.title}`)
    console.log(`     PDF Path: ${item.pdfPath || 'NOT SPECIFIED'}`)
  })
}
console.log()

// Exam JSON Summary
console.log('-'.repeat(80))
console.log(`EXAM JSON FILES: ${hasExamJSON.length}/${questions.length} found, ${missingExamJSONs.length} missing`)
console.log('-'.repeat(80))
if (missingExamJSONs.length > 0) {
  console.log(`Missing Exam JSONs (${missingExamJSONs.length}):`)
  missingExamJSONs.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.id} - ${item.title}`)
  })
}
console.log()

// Explanation JSON Summary
console.log('-'.repeat(80))
console.log(`EXPLANATION JSON FILES: ${hasExplanationJSON.length}/${questions.length} expected, ${missingExplanationJSONs.length} missing`)
console.log('-'.repeat(80))
if (missingExplanationJSONs.length > 0) {
  console.log(`Missing Explanation JSONs (${missingExplanationJSONs.length}):`)
  missingExplanationJSONs.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.id} - ${item.title} (key: ${item.explanationKey})`)
  })
}
console.log()

// Write reports to files
const outputDir = path.join(rootDir, 'output/missing-files')
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

// Write missing PDFs report
fs.writeFileSync(
  path.join(outputDir, 'missing-pdfs.json'),
  JSON.stringify(missingPDFs, null, 2)
)

// Write missing exam JSONs report
fs.writeFileSync(
  path.join(outputDir, 'missing-exam-jsons.json'),
  JSON.stringify(missingExamJSONs, null, 2)
)

// Write missing explanation JSONs report
fs.writeFileSync(
  path.join(outputDir, 'missing-explanation-jsons.json'),
  JSON.stringify(missingExplanationJSONs, null, 2)
)

// Write summary report
const summary = {
  scannedAt: new Date().toISOString(),
  totalQuestions: questions.length,
  pdfs: { found: hasPDF.length, missing: missingPDFs.length },
  examJsons: { found: hasExamJSON.length, missing: missingExamJSONs.length },
  explanationJsons: { expected: questions.filter(q => q.hasExplanation).length, found: hasExplanationJSON.length, missing: missingExplanationJSONs.length }
}
fs.writeFileSync(
  path.join(outputDir, 'summary.json'),
  JSON.stringify(summary, null, 2)
)

console.log('='.repeat(80))
console.log('Reports written to: output/missing-files/')
console.log('  - missing-pdfs.json')
console.log('  - missing-exam-jsons.json')
console.log('  - missing-explanation-jsons.json')
console.log('  - summary.json')
console.log('='.repeat(80))
