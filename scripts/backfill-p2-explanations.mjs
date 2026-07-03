import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { Window } from 'happy-dom'

const ROOT = process.cwd()
const EXAMS_DIR = path.join(ROOT, 'public', 'assets', 'generated', 'reading-exams')
const EXPLANATIONS_DIR = path.join(ROOT, 'public', 'assets', 'generated', 'reading-explanations')
const EXAM_MANIFEST_PATH = path.join(EXAMS_DIR, 'manifest.js')
const EXPLANATION_MANIFEST_PATH = path.join(EXPLANATIONS_DIR, 'manifest.js')
const INDEX_PATH = path.join(ROOT, 'src', 'utils', 'questionIndex.json')

const windowRef = new Window()
const { DOMParser } = windowRef

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function loadManifestPayload(filePath, manifestName) {
  const code = fs.readFileSync(filePath, 'utf8')
  const globalObject = {}
  const sandbox = {
    window: globalObject,
    global: globalObject,
    globalThis: globalObject
  }
  vm.runInNewContext(code, sandbox, { filename: filePath })
  return globalObject[manifestName] ?? {}
}

function loadRegistryPayload(filePath, registryName) {
  const code = fs.readFileSync(filePath, 'utf8')
  const registry = new Map()
  const globalObject = {
    [registryName]: {
      register(key, value) {
        registry.set(key, value)
      }
    }
  }
  const sandbox = {
    window: globalObject,
    global: globalObject,
    globalThis: globalObject
  }
  vm.runInNewContext(code, sandbox, { filename: filePath })
  return [...registry.values()][0] ?? null
}

function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeQuestionId(rawValue) {
  if (rawValue == null) return ''
  const value = String(rawValue).trim()
  if (!value) return ''
  const direct = value.match(/^q\d+$/i)
  if (direct) {
    return direct[0].toLowerCase()
  }
  const match = value.match(/q\d+/i) || value.match(/(\d+)(?!.*\d)/)
  if (!match) return ''
  if (match[0].toLowerCase().startsWith('q')) {
    return match[0].toLowerCase()
  }
  return `q${match[0]}`
}

function createDocument(html) {
  return new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html')
}

function textFromHtml(html) {
  return cleanText(createDocument(html).body.textContent || '')
}

function snippet(value, maxLength = 360) {
  const text = cleanText(value)
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, maxLength - 1).trim()}...`
}

function answerValues(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? '').trim()).filter(Boolean)
  }
  if (value == null) {
    return []
  }
  return [String(value).trim()].filter(Boolean)
}

function formatAnswer(value) {
  const values = answerValues(value)
  return values.length ? values.join(' / ') : 'N/A'
}

function normalizeSelectorValue(value) {
  return String(value || '').replace(/"/g, '\\"')
}

function findQuestionContainer(document, questionId) {
  const q = normalizeSelectorValue(questionId)
  const selectors = [
    `input[name="${q}"]`,
    `textarea[name="${q}"]`,
    `select[name="${q}"]`,
    `[data-question="${q}"]`,
    `[data-question-id="${q}"]`,
    `#${q}`
  ]

  for (const selector of selectors) {
    const element = document.querySelector(selector)
    if (!element) {
      continue
    }
    return (
      element.closest('.match-question-item, .question-item, tr, li, p, .summary-completion, .group')
      || element.parentElement
      || element
    )
  }

  return null
}

function questionPrompt(group, questionId) {
  const document = createDocument(`${group.leadHtml || ''}\n${group.bodyHtml || ''}`)
  const container = findQuestionContainer(document, questionId)
  const text = container ? cleanText(container.textContent || '') : textFromHtml(group.bodyHtml || group.leadHtml || '')
  return snippet(text, 460)
}

function collectOptionLabels(rawExam) {
  const labels = new Map()

  for (const group of rawExam.questionGroups || []) {
    const document = createDocument(`${group.leadHtml || ''}\n${group.bodyHtml || ''}`)

    document.querySelectorAll('.drag-item, .drag-item-clone, .draggable-word, [data-option], [data-key], [data-value]').forEach((element) => {
      const value = cleanText(
        element.getAttribute('data-option')
          || element.getAttribute('data-key')
          || element.getAttribute('data-value')
          || element.getAttribute('value')
          || element.id
      )
      const label = cleanText(element.textContent || '')
      if (value && label && !labels.has(value)) {
        labels.set(value, label)
      }
    })

    document.querySelectorAll('label').forEach((labelElement) => {
      const input = labelElement.querySelector('input')
      const value = cleanText(input?.getAttribute('value') || '')
      const label = cleanText(labelElement.textContent || '')
      if (value && label && !labels.has(value)) {
        labels.set(value, label)
      }
    })

    document.querySelectorAll('option').forEach((option) => {
      const value = cleanText(option.getAttribute('value') || '')
      const label = cleanText(option.textContent || '')
      if (value && label && !labels.has(value)) {
        labels.set(value, label)
      }
    })
  }

  return labels
}

function collectParagraphs(rawExam) {
  const paragraphs = new Map()
  const blocks = rawExam.passage?.blocks || []

  for (const block of blocks) {
    const document = createDocument(block.bodyHtml || block.html || '')
    document.querySelectorAll('p').forEach((paragraph) => {
      const label = cleanText(paragraph.querySelector('strong')?.textContent || '').toUpperCase()
      if (/^[A-Z]$/.test(label) && !paragraphs.has(label)) {
        paragraphs.set(label, cleanText(paragraph.textContent || '').replace(new RegExp(`^${label}\\s*`), ''))
      }
    })
  }

  return paragraphs
}

function findParagraphContaining(paragraphs, answer) {
  const normalized = cleanText(answer)
  if (normalized.length < 3 || /^[A-Z]$/.test(normalized)) {
    return null
  }

  const lower = normalized.toLowerCase()
  for (const [label, paragraph] of paragraphs.entries()) {
    const paragraphLower = paragraph.toLowerCase()
    const index = paragraphLower.indexOf(lower)
    if (index < 0) {
      continue
    }
    const start = Math.max(0, index - 120)
    const end = Math.min(paragraph.length, index + normalized.length + 220)
    return {
      label,
      text: `${start > 0 ? '...' : ''}${paragraph.slice(start, end).trim()}${end < paragraph.length ? '...' : ''}`
    }
  }

  return null
}

function usesParagraphAnswers(group) {
  const text = textFromHtml(`${group.leadHtml || ''}\n${group.bodyHtml || ''}`).toLowerCase()
  return (
    String(group.kind || '').toLowerCase().includes('paragraph')
    || text.includes('which paragraph')
    || text.includes('paragraph contains')
    || /\bhas\s+(?:\w+|\d+)\s+paragraphs\b/.test(text)
  )
}

function evidenceText(answer, paragraphs, optionLabels, preferParagraphs) {
  const values = answerValues(answer)
  const evidence = []

  for (const value of values) {
    const upper = value.toUpperCase()

    const optionLabel = optionLabels.get(value) || optionLabels.get(upper)
    if (!preferParagraphs && optionLabel) {
      evidence.push(`Option ${value}: ${optionLabel}`)
      continue
    }

    if (preferParagraphs && paragraphs.has(upper)) {
      evidence.push(`Paragraph ${upper}: ${snippet(paragraphs.get(upper), 300)}`)
      continue
    }

    const containing = findParagraphContaining(paragraphs, value)
    if (containing) {
      evidence.push(`Paragraph ${containing.label}: ${snippet(containing.text, 300)}`)
      continue
    }

    if (optionLabel) {
      evidence.push(`Option ${value}: ${optionLabel}`)
    }
  }

  if (!evidence.length) {
    return 'This item is backed by the current structured answer key. Use the question prompt and passage/PDF as the reference for detailed positioning.'
  }

  return `This item is backed by the current structured answer key. Reference: ${evidence.join(' | ')}`
}

function questionRangeForGroup(rawExam, group) {
  const numbers = (group.questionIds || [])
    .map((questionId) => Number(rawExam.questionDisplayMap?.[questionId]))
    .filter((value) => Number.isFinite(value))

  if (!numbers.length) {
    return null
  }

  return {
    start: Math.min(...numbers),
    end: Math.max(...numbers)
  }
}

function buildQuestionExplanation(rawExam, group, questionId, paragraphs, optionLabels) {
  const questionNumber = Number(rawExam.questionDisplayMap?.[questionId]) || null
  const answer = rawExam.answerKey?.[questionId]
  const prompt = questionPrompt(group, questionId)
  const answerText = formatAnswer(answer)
  const detail = evidenceText(answer, paragraphs, optionLabels, usesParagraphAnswers(group))

  return {
    questionNumber,
    text: `Question ${questionNumber || questionId}: ${prompt}\nAnswer: ${answerText}\nExplanation: ${detail}`,
    questionId
  }
}

function buildExplanationPayload(examId, rawExam) {
  const paragraphs = collectParagraphs(rawExam)
  const optionLabels = collectOptionLabels(rawExam)

  const questionExplanations = (rawExam.questionGroups || [])
    .filter((group) => Array.isArray(group.questionIds) && group.questionIds.length)
    .map((group, index) => {
      const items = group.questionIds.map((questionId) =>
        buildQuestionExplanation(rawExam, group, questionId, paragraphs, optionLabels)
      )
      const range = questionRangeForGroup(rawExam, group)
      const rangeLabel = range ? `Questions ${range.start}-${range.end}` : `Group ${index + 1}`

      return {
        sectionTitle: `${index + 1}. ${String(group.kind || 'questions').replace(/_/g, ' ')} (${rangeLabel})`,
        mode: 'group',
        items,
        questionRange: range,
        text: items.map((item) => item.text).join('\n\n')
      }
    })

  return {
    schemaVersion: 'ReadingExplanationV1',
    examId,
    meta: {
      examId,
      title: rawExam.meta?.title || examId,
      category: rawExam.meta?.category || 'P2',
      sourceDoc: rawExam.meta?.pdfFilename || rawExam.sourceRefs?.shuiPdf || '',
      noteType: 'answer_key_summary',
      matchedTitle: rawExam.meta?.title || examId
    },
    passageNotes: [
      {
        label: 'Coverage note',
        text: 'This baseline explanation was generated from the current structured question prompt, answer key, and passage text so every P2 review card has answer and reference material.'
      }
    ],
    questionExplanations
  }
}

function writeExplanationSource(examId, payload) {
  const target = path.join(EXPLANATIONS_DIR, `${examId}.js`)
  const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''
  if (existing && !existing.includes('"noteType": "answer_key_summary"')) {
    return false
  }

  writeExplanationPayload(examId, payload)
  return true
}

function writeExplanationPayload(examId, payload) {
  const target = path.join(EXPLANATIONS_DIR, `${examId}.js`)

  const json = JSON.stringify(payload, null, 2)
  const source = `(function registerReadingExplanationData(global) {
  'use strict';
  if (!global.__READING_EXPLANATION_DATA__ || typeof global.__READING_EXPLANATION_DATA__.register !== "function") {
    throw new Error("reading_explanation_registry_missing");
  }
  global.__READING_EXPLANATION_DATA__.register(${JSON.stringify(examId)}, ${json}
  );
})(typeof window !== "undefined" ? window : globalThis);
`
  fs.writeFileSync(target, source, 'utf8')
}

function collectExplanationQuestionIds(rawExplanation) {
  const ids = new Set()
  for (const section of rawExplanation?.questionExplanations || []) {
    for (const item of section.items || []) {
      const questionId = normalizeQuestionId(item.questionId || item.questionNumber)
      if (questionId) {
        ids.add(questionId)
      }
    }
  }
  return ids
}

function buildSupplementSection(rawExam, baselinePayload, missingQuestionIds) {
  const missing = new Set(missingQuestionIds)
  const items = baselinePayload.questionExplanations
    .flatMap((section) => section.items || [])
    .filter((item) => missing.has(item.questionId))

  const numbers = items
    .map((item) => Number(item.questionNumber))
    .filter((value) => Number.isFinite(value))

  return {
    sectionTitle: 'Coverage supplement',
    mode: 'group',
    items,
    questionRange: numbers.length
      ? {
          start: Math.min(...numbers),
          end: Math.max(...numbers)
        }
      : null,
    text: items.map((item) => item.text).join('\n\n')
  }
}

function mergeCoverageSupplement(examId, rawExam, rawExplanation) {
  const questionOrder = Array.isArray(rawExam.questionOrder) ? rawExam.questionOrder : Object.keys(rawExam.answerKey || {})
  const covered = collectExplanationQuestionIds(rawExplanation)
  const missing = questionOrder.filter((questionId) => !covered.has(questionId))
  if (!missing.length) {
    return false
  }

  const baselinePayload = buildExplanationPayload(examId, rawExam)
  const supplement = buildSupplementSection(rawExam, baselinePayload, missing)
  if (!supplement.items.length) {
    throw new Error(`missing_supplement_items:${examId}:${missing.join(',')}`)
  }

  const sections = Array.isArray(rawExplanation.questionExplanations)
    ? rawExplanation.questionExplanations.filter((section) => section.sectionTitle !== 'Coverage supplement')
    : []

  writeExplanationPayload(examId, {
    ...rawExplanation,
    examId,
    meta: {
      ...rawExplanation.meta,
      examId
    },
    questionExplanations: [...sections, supplement]
  })
  return true
}

function writeExplanationManifest(manifest) {
  const sorted = Object.fromEntries(
    Object.entries(manifest).sort(([left], [right]) => left.localeCompare(right, 'en'))
  )
  const source = `(function registerReadingExplanationManifest(global) {
  'use strict';
  global.__READING_EXPLANATION_MANIFEST__ = ${JSON.stringify(sorted, null, 2)};
})(typeof window !== "undefined" ? window : globalThis);
`
  fs.writeFileSync(EXPLANATION_MANIFEST_PATH, source, 'utf8')
}

function ensureQuestionIndexCoverage(manifest) {
  const list = readJson(INDEX_PATH)
  const next = list.map((item) => {
    if (item.category !== 'P2' || item.launchMode !== 'unified' || !manifest[item.id]) {
      return item
    }

    const nextItem = {}
    let insertedExplanation = false
    for (const [key, value] of Object.entries(item)) {
      if (key === 'explanationKey') {
        continue
      }
      if (key === 'hasExplanation') {
        nextItem.explanationKey = item.id
        nextItem.hasExplanation = true
        insertedExplanation = true
        continue
      }
      nextItem[key] = value
    }

    if (!insertedExplanation) {
      nextItem.explanationKey = item.id
      nextItem.hasExplanation = true
    }

    return nextItem
  })

  writeJson(INDEX_PATH, next)
}

function main() {
  const examManifest = loadManifestPayload(EXAM_MANIFEST_PATH, '__READING_EXAM_MANIFEST__')
  const explanationManifest = loadManifestPayload(EXPLANATION_MANIFEST_PATH, '__READING_EXPLANATION_MANIFEST__')
  const questionIndex = readJson(INDEX_PATH)
  const p2Unified = questionIndex.filter((item) => item.category === 'P2' && item.launchMode === 'unified')

  let generated = 0
  let connectedExisting = 0
  let supplementedExisting = 0

  for (const item of p2Unified) {
    const existingPath = path.join(EXPLANATIONS_DIR, `${item.id}.js`)
    const examEntry = examManifest[item.dataKey || item.id] || examManifest[item.id]
    if (!examEntry?.script) {
      throw new Error(`missing_exam_manifest:${item.id}`)
    }
    const rawExam = loadRegistryPayload(path.join(EXAMS_DIR, path.basename(examEntry.script)), '__READING_EXAM_DATA__')
    if (!rawExam) {
      throw new Error(`missing_exam_payload:${item.id}`)
    }

    if (explanationManifest[item.id]?.script) {
      const rawExplanation = loadRegistryPayload(
        path.join(EXPLANATIONS_DIR, path.basename(explanationManifest[item.id].script)),
        '__READING_EXPLANATION_DATA__'
      )
      if (mergeCoverageSupplement(item.id, rawExam, rawExplanation)) {
        supplementedExisting += 1
      }
      continue
    }

    if (fs.existsSync(existingPath)) {
      connectedExisting += 1
      const rawExplanation = loadRegistryPayload(existingPath, '__READING_EXPLANATION_DATA__')
      if (mergeCoverageSupplement(item.id, rawExam, rawExplanation)) {
        supplementedExisting += 1
      }
    } else {
      const payload = buildExplanationPayload(item.id, rawExam)
      if (writeExplanationSource(item.id, payload)) {
        generated += 1
      }
    }

    explanationManifest[item.id] = {
      examId: item.id,
      dataKey: item.id,
      script: `../reading-explanations/${item.id}.js`,
      title: rawExam?.meta?.title || item.displayTitle || item.title || item.id,
      sourceDoc: rawExam?.meta?.pdfFilename || rawExam?.sourceRefs?.shuiPdf || '',
      matchedTitle: rawExam?.meta?.title || item.displayTitle || item.title || item.id
    }
  }

  writeExplanationManifest(explanationManifest)
  ensureQuestionIndexCoverage(explanationManifest)

  console.log(`[backfill-p2-explanations] generated ${generated} explanation file(s), connected ${connectedExisting} existing file(s), supplemented ${supplementedExisting} existing file(s)`)
}

main()
