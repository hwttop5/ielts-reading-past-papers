import { promises as fs } from 'fs'
import path from 'path'

const ROOT = process.cwd()
const PUBLIC_DIR = path.join(ROOT, 'public')
const INDEX_PATH = path.join(ROOT, 'src', 'utils', 'questionIndex.json')
const EXAM_JSON_DIR = path.join(ROOT, 'src', 'generated', 'reading-native', 'exams')
const EXPLANATION_JSON_DIR = path.join(ROOT, 'src', 'generated', 'reading-native', 'explanations')

const ALLOWED_CATEGORY = new Set(['P1', 'P2', 'P3'])
const ALLOWED_FREQUENCY = new Set(['high', 'medium', 'low'])
const ALLOWED_LAUNCH = new Set(['unified', 'pdf_only'])

function toFsPath(urlPath) {
  const rel = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath
  return path.join(PUBLIC_DIR, rel)
}

async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

function formatWarn(msg) {
  return `\x1b[33m[warn]\x1b[0m ${msg}`
}
function formatErr(msg) {
  return `\x1b[31m[err ]\x1b[0m ${msg}`
}
function formatOk(msg) {
  return `\x1b[32m[ ok ]\x1b[0m ${msg}`
}

async function main() {
  const raw = await fs.readFile(INDEX_PATH, 'utf-8')
  const list = JSON.parse(raw)

  let errors = 0
  let warnings = 0

  for (const item of list) {
    const id = item.id || '(no id)'

    const baseRequired = ['id', 'title', 'category', 'frequency', 'type', 'launchMode']
    const missing = baseRequired.filter((k) => !(k in item))
    if (missing.length) {
      console.log(formatErr(`${id} missing fields: ${missing.join(', ')}`))
      errors++
      continue
    }

    if (!ALLOWED_CATEGORY.has(item.category)) {
      console.log(formatErr(`${id}: invalid category "${item.category}"`))
      errors++
    }
    if (!ALLOWED_FREQUENCY.has(item.frequency)) {
      console.log(formatErr(`${id}: invalid frequency "${item.frequency}"`))
      errors++
    }
    if (!ALLOWED_LAUNCH.has(item.launchMode)) {
      console.log(formatErr(`${id}: invalid launchMode "${item.launchMode}"`))
      errors++
    }

    if (item.launchMode === 'unified') {
      const need = ['dataKey', 'pdfPath', 'totalQuestions']
      const miss = need.filter((k) => !(k in item) || item[k] === null || item[k] === undefined)
      if (miss.length) {
        console.log(formatErr(`${id} (unified) missing or null fields: ${miss.join(', ')}`))
        errors++
        continue
      }
      const examFs = path.join(EXAM_JSON_DIR, `${item.dataKey}.json`)
      if (!(await exists(examFs))) {
        console.log(formatErr(`${id}: reading-native exam JSON not found -> ${examFs}`))
        errors++
      }
      if (item.hasExplanation) {
        const key = item.explanationKey ?? item.id
        const explFs = path.join(EXPLANATION_JSON_DIR, `${key}.json`)
        if (!(await exists(explFs))) {
          console.log(formatWarn(`${id}: explanation JSON missing -> ${explFs}`))
          warnings++
        }
      }
    }

    if (item.launchMode === 'pdf_only' && (item.pdfPath === null || item.pdfPath === undefined || item.pdfPath === '')) {
      console.log(formatWarn(`${id}: pdf_only entry has no pdfPath (placeholder / incomplete)`))
      warnings++
      continue
    }

    if (item.pdfPath) {
      if (!String(item.pdfPath).startsWith('/ReadingPractice/')) {
        console.log(formatErr(`${id}: pdfPath must start with "/ReadingPractice/" -> ${item.pdfPath}`))
        errors++
      } else {
        const pdfFs = toFsPath(item.pdfPath)
        const pdfOk = await exists(pdfFs)
        if (!pdfOk) {
          console.log(formatWarn(`${id}: PDF not found in public -> ${pdfFs}`))
          warnings++
        }
      }
    } else if (item.launchMode === 'unified') {
      console.log(formatErr(`${id}: unified entry missing pdfPath`))
      errors++
    }
  }

  const summary = `${list.length} items, ${errors} error(s), ${warnings} warning(s)`
  if (errors > 0) {
    console.log(formatErr(summary))
    process.exit(1)
  } else if (warnings > 0) {
    console.log(formatWarn(summary))
  } else {
    console.log(formatOk(summary))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
