import { promises as fs } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const INDEX_PATH = path.join(ROOT, 'src', 'utils', 'questionIndex.json')
const NATIVE_DIR = path.join(ROOT, 'src', 'generated', 'reading-native')
const NATIVE_MANIFEST_PATH = path.join(NATIVE_DIR, 'manifest.json')
const PDF_NOTE_TYPE = 'pdf_answer_explanation_ocr'
const PDF_FALLBACK_MARKER = '未能从 PDF'
const CATEGORY = (process.argv.find((entry) => entry.startsWith('--category='))?.split('=')[1] || 'P2').toUpperCase()
const PDF_ANALYSIS_UNAVAILABLE = {
  P3: new Set(['p3-low-078', 'p3-medium-169'])
}

function formatErr(message) {
  return `\x1b[31m[err ]\x1b[0m ${message}`
}

function formatOk(message) {
  return `\x1b[32m[ ok ]\x1b[0m ${message}`
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function resolveNativePath(relativePath) {
  return path.join(NATIVE_DIR, relativePath.replace(/^\.\//, ''))
}

async function main() {
  const [questionIndex, nativeManifest] = await Promise.all([
    readJson(INDEX_PATH),
    readJson(NATIVE_MANIFEST_PATH)
  ])

  const structuredItems = questionIndex.filter((item) => item.category === CATEGORY && item.launchMode === 'unified')
  const errors = []
  const unavailableIds = PDF_ANALYSIS_UNAVAILABLE[CATEGORY] || new Set()

  for (const item of structuredItems) {
    const examId = item.dataKey || item.id
    const manifestEntry = nativeManifest.exams?.[examId]
    if (unavailableIds.has(item.id)) {
      if (item.hasExplanation || item.explanationKey) {
        errors.push(`${item.id}: source PDF has no answer-analysis table but questionIndex still marks an explanation`)
      }
      if (manifestEntry?.explanationPath) {
        errors.push(`${item.id}: source PDF has no answer-analysis table but reading-native manifest has explanationPath`)
      }
      continue
    }

    if (!item.hasExplanation || !item.explanationKey) {
      errors.push(`${item.id}: questionIndex missing hasExplanation/explanationKey`)
      continue
    }

    if (!manifestEntry) {
      errors.push(`${item.id}: reading-native manifest entry missing`)
      continue
    }

    if (!manifestEntry.explanationPath) {
      errors.push(`${item.id}: reading-native manifest has no explanationPath`)
      continue
    }

    const examPath = resolveNativePath(manifestEntry.examPath || `./exams/${examId}.json`)
    const explanationPath = resolveNativePath(manifestEntry.explanationPath)

    if (!(await exists(examPath))) {
      errors.push(`${item.id}: exam JSON missing -> ${examPath}`)
      continue
    }

    if (!(await exists(explanationPath))) {
      errors.push(`${item.id}: explanation JSON missing -> ${explanationPath}`)
      continue
    }

    const [exam, explanation] = await Promise.all([
      readJson(examPath),
      readJson(explanationPath)
    ])

    const questionMap = explanation.questionMap || {}
    const questionIds = Object.keys(questionMap)
    if (!questionIds.length) {
      errors.push(`${item.id}: explanation questionMap is empty`)
      continue
    }

    if (explanation.meta?.noteType !== PDF_NOTE_TYPE) {
      errors.push(`${item.id}: explanation noteType is not ${PDF_NOTE_TYPE}`)
    }

    if (explanation.meta?.fallbackQuestionCount !== 0) {
      errors.push(`${item.id}: explanation has fallbackQuestionCount=${explanation.meta?.fallbackQuestionCount}`)
    }

    const questionOrder = Array.isArray(exam.questionOrder) ? exam.questionOrder : []
    if (!questionOrder.length) {
      errors.push(`${item.id}: exam questionOrder is empty`)
      continue
    }

    const missingQuestions = questionOrder.filter((questionId) => {
      const entry = questionMap[questionId]
      return !entry || !String(entry.text || '').trim()
    })

    if (missingQuestions.length) {
      errors.push(`${item.id}: explanation questionMap missing ${missingQuestions.join(', ')}`)
    }

    const nonPdfQuestions = questionOrder.filter((questionId) => {
      const text = String(questionMap[questionId]?.text || '')
      return !text.includes('PDF 定位') && !text.includes('PDF 解析')
    })
    if (nonPdfQuestions.length) {
      errors.push(`${item.id}: explanation questionMap has non-PDF text for ${nonPdfQuestions.join(', ')}`)
    }

    const fallbackQuestions = questionOrder.filter((questionId) => {
      const text = String(questionMap[questionId]?.text || '')
      return text.includes(PDF_FALLBACK_MARKER)
    })
    if (fallbackQuestions.length) {
      errors.push(`${item.id}: explanation questionMap has PDF fallback text for ${fallbackQuestions.join(', ')}`)
    }
  }

  if (errors.length) {
    errors.forEach((error) => console.log(formatErr(error)))
    console.log(formatErr(`${structuredItems.length} ${CATEGORY} structured item(s), ${errors.length} coverage error(s)`))
    process.exit(1)
  }

  const unavailableCount = structuredItems.filter((item) => unavailableIds.has(item.id)).length
  const coveredCount = structuredItems.length - unavailableCount
  const unavailableSuffix = unavailableCount
    ? `; ${unavailableCount} item(s) intentionally remain explanation-unavailable because the source PDF has no answer-analysis table`
    : ''
  console.log(formatOk(`${coveredCount}/${structuredItems.length} ${CATEGORY} structured item(s) have PDF-sourced explanationPath and full questionMap coverage${unavailableSuffix}`))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
