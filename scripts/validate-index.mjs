import { promises as fs } from 'fs'
import path from 'path'

const ROOT = process.cwd()
const PUBLIC_DIR = path.join(ROOT, 'public')
const INDEX_PATH = path.join(ROOT, 'src', 'utils', 'questionIndex.json')

const ALLOWED_CATEGORY = new Set(['P1', 'P2', 'P3'])
const ALLOWED_DIFFICULTY = new Set(['高频', '次频'])

function toFsPath(htmlPath) {
  const rel = htmlPath.startsWith('/') ? htmlPath.slice(1) : htmlPath
  return path.join(PUBLIC_DIR, rel)
}

function pdfFromHtml(htmlFile) {
  const base = htmlFile.replace(/【高】|【次】/g, '')
  return base.replace(/\.html?$/i, '.pdf')
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
    // Required fields
    const missing = ['id', 'title', 'titleCN', 'category', 'difficulty', 'htmlPath']
      .filter(k => !(k in item))
    if (missing.length) {
      console.log(formatErr(`${item.id || '(no id)'} missing fields: ${missing.join(', ')}`))
      errors++
      continue
    }

    // Category / difficulty
    if (!ALLOWED_CATEGORY.has(item.category)) {
      console.log(formatErr(`${item.id}: invalid category "${item.category}"`))
      errors++
    }
    if (!ALLOWED_DIFFICULTY.has(item.difficulty)) {
      console.log(formatErr(`${item.id}: invalid difficulty "${item.difficulty}"`))
      errors++
    }

    // HTML existence
    if (!item.htmlPath.startsWith('/questionBank/')) {
      console.log(formatErr(`${item.id}: htmlPath must start with "/questionBank/" -> ${item.htmlPath}`))
      errors++
    } else {
      const htmlFs = toFsPath(item.htmlPath)
      const htmlExists = await exists(htmlFs)
      if (!htmlExists) {
        console.log(formatErr(`${item.id}: HTML not found -> ${htmlFs}`))
        errors++
      }
      // PDF optional but recommended
      const pdfFs = path.join(path.dirname(htmlFs), path.basename(pdfFromHtml(path.basename(htmlFs))))
      const pdfExists = await exists(pdfFs)
      if (!pdfExists) {
        console.log(formatWarn(`${item.id}: PDF missing (optional) -> ${pdfFs}`))
        warnings++
      }
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

main().catch(err => {
  console.error(err)
  process.exit(1)
})

