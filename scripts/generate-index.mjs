import { promises as fs } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const ROOT = process.cwd()
const DEFAULT_REFERENCE_ROOT = 'C:\\Users\\ttop5\\Downloads\\4月网页版（V260401）'
const referenceRoot = path.resolve(process.env.READING_REFERENCE_ROOT || DEFAULT_REFERENCE_ROOT)

const PUBLIC_DIR = path.join(ROOT, 'public')
const INDEX_PATH = path.join(ROOT, 'src', 'utils', 'questionIndex.json')
const META_PATH = path.join(ROOT, 'src', 'utils', 'questionMeta.json')

const READING_EXAMS_SOURCE = path.join(referenceRoot, 'assets', 'generated', 'reading-exams')
const READING_EXAMS_DEST = path.join(PUBLIC_DIR, 'assets', 'generated', 'reading-exams')
const READING_EXPLANATIONS_SOURCE = path.join(referenceRoot, 'assets', 'generated', 'reading-explanations')
const READING_EXPLANATIONS_DEST = path.join(PUBLIC_DIR, 'assets', 'generated', 'reading-explanations')
const PDF_SOURCE = path.join(referenceRoot, 'ReadingPractice', 'PDF')
const PDF_DEST = path.join(PUBLIC_DIR, 'ReadingPractice', 'PDF')
const LEGACY_QUESTION_BANK_DIR = path.join(PUBLIC_DIR, 'questionBank')

const RUNTIME_FILE_SPECS = [
  {
    source: path.join(referenceRoot, 'js', 'runtime', 'readingExamRegistry.js'),
    dest: path.join(PUBLIC_DIR, 'js', 'runtime', 'readingExamRegistry.js')
  },
  {
    source: path.join(referenceRoot, 'js', 'runtime', 'readingExplanationRegistry.js'),
    dest: path.join(PUBLIC_DIR, 'js', 'runtime', 'readingExplanationRegistry.js')
  },
  {
    source: path.join(referenceRoot, 'js', 'runtime', 'unifiedReadingPage.js'),
    dest: path.join(PUBLIC_DIR, 'js', 'runtime', 'unifiedReadingPage.js')
  },
  {
    source: path.join(referenceRoot, 'js', 'utils', 'answerMatchCore.js'),
    dest: path.join(PUBLIC_DIR, 'js', 'utils', 'answerMatchCore.js')
  },
  {
    source: path.join(referenceRoot, 'js', 'practice-page-ui.js'),
    dest: path.join(PUBLIC_DIR, 'js', 'practice-page-ui.js')
  }
]

function ensureForwardSlashes(value) {
  return String(value || '').replace(/\\/g, '/')
}

function splitDisplayTitle(displayTitle) {
  const normalized = String(displayTitle || '').replace(/\s+/g, ' ').trim()

  // 提取所有连续的中文片段
  const chineseSegments = normalized.match(/[\u3400-\u9fff]+/g) || []
  // 最后一个中文片段通常是真正的中文标题
  const lastChineseSegment = chineseSegments.length > 0 ? chineseSegments[chineseSegments.length - 1] : ''

  // 提取最长的不以数字开头的英文字母开头的连续片段
  // 匹配以英文字母开头的片段（允许空格和常见符号）
  const englishMatches = normalized.match(/[A-Za-z][A-Za-z0-9\s\[\]\(\)\-'\.,!?]+/g) || []
  // 找到不以数字开头、长度最长的英文片段作为 title
  let bestEnglishMatch = ''
  for (const match of englishMatches) {
    const trimmed = match.trim()
    // 排除纯数字或以数字开头的片段
    if (!/^\d/.test(trimmed) && trimmed.length > bestEnglishMatch.length) {
      bestEnglishMatch = trimmed
    }
  }

  // 如果成功提取了有效的英文和中文部分
  if (bestEnglishMatch && lastChineseSegment) {
    return {
      title: bestEnglishMatch,
      titleCN: lastChineseSegment
    }
  }

  // 回退：查找第一个中文字符位置分割
  const chineseIndex = normalized.search(/[\u3400-\u9fff]/)
  if (chineseIndex <= 0) {
    return {
      title: normalized,
      titleCN: chineseIndex === 0 ? normalized : ''
    }
  }

  return {
    title: normalized.slice(0, chineseIndex).trim(),
    titleCN: normalized.slice(chineseIndex).trim()
  }
}

function sortEntries(left, right) {
  const categoryOrder = { P1: 1, P2: 2, P3: 3 }
  const categoryDiff = (categoryOrder[left.category] ?? 99) - (categoryOrder[right.category] ?? 99)
  if (categoryDiff !== 0) {
    return categoryDiff
  }

  const numericPart = (value) => {
    const match = String(value).match(/(\d+)(?!.*\d)/)
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
  }

  const numberDiff = numericPart(left.id) - numericPart(right.id)
  if (numberDiff !== 0) {
    return numberDiff
  }

  return left.id.localeCompare(right.id)
}

async function ensureReferenceRoot() {
  await fs.access(referenceRoot)
}

async function recreateDir(dir) {
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
}

async function copyDirectory(source, dest) {
  await fs.rm(dest, { recursive: true, force: true })
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.cp(source, dest, { recursive: true, force: true, errorOnExist: false })
}

async function copyFileTo(source, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.copyFile(source, dest)
}

function runManifestScript(filePath, options = {}) {
  const code = vm.runInNewContext(`(function(){ return ${JSON.stringify(awaitText(filePath))}; })()`, {})
  return code
}

function awaitText(filePath) {
  throw new Error(`awaitText placeholder should not be called directly for ${filePath}`)
}

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8')
}

async function loadCompleteExamIndex() {
  const filePath = path.join(referenceRoot, 'assets', 'scripts', 'complete-exam-data.js')
  const text = await readText(filePath)
  const sandbox = { window: {} }
  vm.runInNewContext(text, sandbox, { filename: filePath })
  return sandbox.window.completeExamIndex
}

async function loadAssignedObject(filePath, expression) {
  const text = await readText(filePath)
  const sandbox = {
    window: {},
    globalThis: {},
    console
  }
  sandbox.window = sandbox.globalThis
  vm.runInNewContext(text, sandbox, { filename: filePath })
  return sandbox.globalThis[expression]
}

async function loadReadingExamManifest() {
  const filePath = path.join(referenceRoot, 'assets', 'generated', 'reading-exams', 'manifest.js')
  const text = await readText(filePath)
  const sandbox = { window: {}, globalThis: {}, console }
  sandbox.window = sandbox.globalThis
  vm.runInNewContext(text, sandbox, { filename: filePath })
  return sandbox.globalThis.__READING_EXAM_MANIFEST__
}

async function loadReadingExplanationManifest() {
  const filePath = path.join(referenceRoot, 'assets', 'generated', 'reading-explanations', 'manifest.js')
  const text = await readText(filePath)
  const sandbox = { window: {}, globalThis: {}, console }
  sandbox.window = sandbox.globalThis
  vm.runInNewContext(text, sandbox, { filename: filePath })
  return sandbox.globalThis.__READING_EXPLANATION_MANIFEST__
}

async function loadReadingExamData(dataKey) {
  const filePath = path.join(referenceRoot, 'assets', 'generated', 'reading-exams', `${dataKey}.js`)
  const text = await readText(filePath)
  let captured = null
  const sandbox = {
    window: {},
    globalThis: {},
    console
  }
  sandbox.window = sandbox.globalThis
  sandbox.globalThis.__READING_EXAM_DATA__ = {
    register(_id, payload) {
      captured = payload
    }
  }
  vm.runInNewContext(text, sandbox, { filename: filePath })
  return captured
}

function buildPdfPath(pdfFilename) {
  const normalized = ensureForwardSlashes(pdfFilename).replace(/^\/+/, '')
  return normalized.startsWith('ReadingPractice/PDF/')
    ? `/${normalized}`
    : `/ReadingPractice/PDF/${path.posix.basename(normalized)}`
}

function buildQuestionEntry(baseEntry, manifestEntry, explanationEntry, examData) {
  const displayTitle = String(baseEntry.title || '').trim()
  const { title, titleCN } = splitDisplayTitle(displayTitle)
  const totalQuestions = Array.isArray(examData?.questionOrder) ? examData.questionOrder.length : undefined

  return {
    id: baseEntry.id,
    title,
    titleCN,
    displayTitle,
    category: baseEntry.category,
    frequency: baseEntry.frequency,
    type: 'reading',
    pdfPath: buildPdfPath(baseEntry.pdfFilename),
    launchMode: manifestEntry ? 'unified' : 'pdf_only',
    dataKey: manifestEntry?.dataKey || manifestEntry?.examId,
    explanationKey: explanationEntry?.dataKey || explanationEntry?.examId,
    hasExplanation: Boolean(explanationEntry),
    ...(typeof totalQuestions === 'number' ? { totalQuestions } : {})
  }
}

async function buildGeneratedFiles() {
  const [completeExamIndex, examManifest, explanationManifest] = await Promise.all([
    loadCompleteExamIndex(),
    loadReadingExamManifest(),
    loadReadingExplanationManifest()
  ])

  const meta = {}
  const entries = []

  for (const baseEntry of completeExamIndex) {
    const manifestEntry = examManifest?.[baseEntry.id] ?? null
    const explanationEntry = explanationManifest?.[baseEntry.id] ?? null
    const examData = manifestEntry ? await loadReadingExamData(manifestEntry.dataKey || manifestEntry.examId || baseEntry.id) : null

    entries.push(buildQuestionEntry(baseEntry, manifestEntry, explanationEntry, examData))

    if (examData?.questionDisplayMap) {
      meta[baseEntry.id] = {
        questionDisplayMap: examData.questionDisplayMap,
        questionOrder: Array.isArray(examData.questionOrder) ? examData.questionOrder : []
      }
    }
  }

  entries.sort(sortEntries)
  return { entries, meta }
}

async function main() {
  await ensureReferenceRoot()

  const { entries, meta } = await buildGeneratedFiles()
  const structuredCount = entries.filter((entry) => entry.launchMode === 'unified').length
  const pdfOnlyCount = entries.filter((entry) => entry.launchMode === 'pdf_only').length

  if (entries.length !== 218 || structuredCount !== 217 || pdfOnlyCount !== 1) {
    throw new Error(`Unexpected reading index size: total=${entries.length}, unified=${structuredCount}, pdfOnly=${pdfOnlyCount}`)
  }

  await fs.rm(LEGACY_QUESTION_BANK_DIR, { recursive: true, force: true })
  await recreateDir(path.join(PUBLIC_DIR, 'assets', 'generated'))
  await copyDirectory(READING_EXAMS_SOURCE, READING_EXAMS_DEST)
  await copyDirectory(READING_EXPLANATIONS_SOURCE, READING_EXPLANATIONS_DEST)
  await copyDirectory(PDF_SOURCE, PDF_DEST)

  for (const spec of RUNTIME_FILE_SPECS) {
    await copyFileTo(spec.source, spec.dest)
  }

  await fs.writeFile(INDEX_PATH, JSON.stringify(entries, null, 2), 'utf8')
  await fs.writeFile(META_PATH, JSON.stringify(meta, null, 2), 'utf8')

  console.log(`Synced reading reference assets from ${referenceRoot}`)
  console.log(`Generated ${entries.length} reading questions (${structuredCount} unified, ${pdfOnlyCount} pdf-only).`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
