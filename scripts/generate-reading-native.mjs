import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { Window } from 'happy-dom'

const ROOT = process.cwd()
const EXAMS_DIR = path.join(ROOT, 'public', 'assets', 'generated', 'reading-exams')
const EXPLANATIONS_DIR = path.join(ROOT, 'public', 'assets', 'generated', 'reading-explanations')
const OUTPUT_DIR = path.join(ROOT, 'src', 'generated', 'reading-native')
const OUTPUT_EXAMS_DIR = path.join(OUTPUT_DIR, 'exams')
const OUTPUT_EXPLANATIONS_DIR = path.join(OUTPUT_DIR, 'explanations')
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json')

const windowRef = new Window()
const { DOMParser, Node } = windowRef

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true })
}

function writeJson(target, value) {
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
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

function toEnglishTitle(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim()
  const english = raw.replace(/[\u3400-\u9fff]/g, '').replace(/[·•]/g, ' ').replace(/\s+/g, ' ').trim()
  return english || raw
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

function expandQuestionSequence(rawValue) {
  if (!rawValue) return []
  const value = String(rawValue).trim().toLowerCase()
  const numbers = (value.match(/\d+/g) || []).map((entry) => Number(entry))
  if ((value.includes('-') || value.includes('–')) && numbers.length > 2) {
    return numbers.map((entry) => `q${entry}`)
  }
  if ((value.includes('-') || value.includes('–')) && numbers.length === 2 && numbers[1] >= numbers[0]) {
    const ids = []
    for (let current = numbers[0]; current <= numbers[1]; current += 1) {
      ids.push(`q${current}`)
    }
    return ids
  }
  if (value.includes('_') && numbers.length >= 2) {
    return numbers.map((entry) => `q${entry}`)
  }
  const normalized = normalizeQuestionId(value)
  return normalized ? [normalized] : []
}

function sanitizeAttributes(element) {
  const attrs = {}
  Array.from(element.attributes || []).forEach((attr) => {
    if (!attr || !attr.name) return
    if (['draggable', 'checked', 'selected'].includes(attr.name)) return
    attrs[attr.name] = attr.value
  })
  return attrs
}

function createCompilerState() {
  return {
    autoPoolId: 0,
    fields: {
      choiceGroups: new Map(),
      textQuestions: new Set(),
      selectQuestions: new Set(),
      textareaQuestions: new Set(),
      dropzoneQuestions: new Set()
    },
    questionAnchors: {},
    paragraphAnchors: {},
    options: [],
    currentPoolId: null
  }
}

function registerChoiceField(state, fieldName, inputType) {
  const name = String(fieldName || '').trim()
  if (!name) return
  const questionIds = expandQuestionSequence(name)
  if (!state.fields.choiceGroups.has(name)) {
    state.fields.choiceGroups.set(name, {
      name,
      inputType,
      questionIds
    })
  }
}

function registerQuestionAnchor(state, questionId, elementId) {
  if (!questionId || !elementId) return
  if (!state.questionAnchors[questionId]) {
    state.questionAnchors[questionId] = elementId
  }
}

function collectAnchorsFromElement(state, element) {
  const elementId = String(element.getAttribute?.('id') || '').trim()
  if (elementId) {
    const questionId = normalizeQuestionId(elementId)
    if (questionId) {
      registerQuestionAnchor(state, questionId, elementId)
    }
  }

  if (element.classList?.contains('paragraph-wrapper')) {
    const wrapperId = String(element.getAttribute('id') || '').trim()
    const paragraphDropzone = element.querySelector('.paragraph-dropzone[data-paragraph]')
    if (wrapperId && paragraphDropzone) {
      const paragraphLabel = String(paragraphDropzone.getAttribute('data-paragraph') || '').trim()
      if (paragraphLabel && !state.paragraphAnchors[paragraphLabel]) {
        state.paragraphAnchors[paragraphLabel] = wrapperId
      }
      const questionId = normalizeQuestionId(paragraphDropzone.getAttribute('data-question') || wrapperId)
      if (questionId) {
        registerQuestionAnchor(state, questionId, wrapperId)
      }
    }
  }
}

function createDropzoneNode(state, element, appearance) {
  const attrs = sanitizeAttributes(element)
  const questionId = normalizeQuestionId(
    element.getAttribute('data-question')
    || element.getAttribute('data-target')
    || attrs.id
  )
  const paragraph = String(element.getAttribute('data-paragraph') || '').trim()
  const labelElement = element.querySelector('.paragraph-label')
  const labelText = labelElement ? String(labelElement.textContent || '').trim() : ''
  const elementId = String(element.getAttribute('id') || '').trim()
  if (questionId) {
    state.fields.dropzoneQuestions.add(questionId)
    registerQuestionAnchor(state, questionId, elementId || attrs.id || '')
  }
  if (paragraph && !state.paragraphAnchors[paragraph]) {
    const wrapper = element.closest('.paragraph-wrapper')
    const wrapperId = String(wrapper?.getAttribute?.('id') || '').trim()
    if (wrapperId) {
      state.paragraphAnchors[paragraph] = wrapperId
    }
  }
  return {
    type: 'dropzone',
    appearance,
    questionId,
    paragraph,
    labelText,
    attrs
  }
}

function createOptionChipNode(state, element) {
  const attrs = sanitizeAttributes(element)
  const explicitValue = element.getAttribute('data-option')
    || element.getAttribute('data-heading')
    || element.getAttribute('data-value')
    || element.getAttribute('value')
    || element.getAttribute('id')
    || ''
  const label = String(element.textContent || '').replace(/\s+/g, ' ').trim()
  const poolId = state.currentPoolId || ''
  const value = String(explicitValue || label).trim()
  state.options.push({
    poolId,
    value,
    label
  })
  return {
    type: 'optionChip',
    poolId,
    value,
    label,
    attrs
  }
}

function createChoiceInputNode(state, element) {
  const attrs = sanitizeAttributes(element)
  const inputType = element.getAttribute('type') === 'checkbox' ? 'checkbox' : 'radio'
  const fieldName = String(element.getAttribute('name') || '').trim()
  const derivedQuestionIds = expandQuestionSequence(fieldName)
  const questionId = derivedQuestionIds.length === 1
    ? derivedQuestionIds[0]
    : normalizeQuestionId(element.getAttribute('data-question') || attrs.id || '')
  registerChoiceField(state, fieldName, inputType)

  // 为每个题目注册锚点：优先使用 input 的 id，否则使用外层 question wrapper 的 id
  const elementId = attrs.id || ''
  if (questionId) {
    // 尝试查找外层的 question wrapper 或 question-item 容器
    let wrapperId = elementId
    const parent = element.parentElement
    if (parent) {
      const wrapper = parent.closest('.question-item, [data-question], [id*="-anchor"], [id*="-question"]')
      if (wrapper?.id) {
        wrapperId = wrapper.id
      }
    }
    registerQuestionAnchor(state, questionId, wrapperId || elementId)
  }

  // 如果是多选/单选组，为组内所有题目都注册锚点
  // 共享题组允许多个题号映射到同一个组级锚点（fieldName_group）
  if (derivedQuestionIds.length > 1) {
    const groupAnchorId = `${fieldName}_group`
    derivedQuestionIds.forEach((qid) => {
      if (!state.questionAnchors[qid]) {
        state.questionAnchors[qid] = groupAnchorId
      }
    })
  }

  return {
    type: 'choiceInput',
    inputType,
    fieldName,
    questionId,
    questionIds: derivedQuestionIds,
    value: String(element.getAttribute('value') || element.getAttribute('data-option') || '').trim(),
    attrs
  }
}

function createTextInputNode(state, element) {
  const attrs = sanitizeAttributes(element)
  const questionId = normalizeQuestionId(
    element.getAttribute('name')
    || element.getAttribute('data-question-id')
    || attrs.id
    || element.getAttribute('data-question')
  )
  if (element.tagName.toLowerCase() === 'textarea') {
    if (questionId) {
      state.fields.textareaQuestions.add(questionId)
      registerQuestionAnchor(state, questionId, attrs.id || '')
    }
    return {
      type: 'textarea',
      questionId,
      fieldName: String(element.getAttribute('name') || '').trim(),
      attrs
    }
  }
  if (questionId) {
    state.fields.textQuestions.add(questionId)
    registerQuestionAnchor(state, questionId, attrs.id || '')
  }
  return {
    type: 'textInput',
    questionId,
    fieldName: String(element.getAttribute('name') || '').trim(),
    attrs
  }
}

function createSelectNode(state, element) {
  const attrs = sanitizeAttributes(element)
  const questionId = normalizeQuestionId(
    element.getAttribute('name')
    || element.getAttribute('data-question-id')
    || attrs.id
  )
  if (questionId) {
    state.fields.selectQuestions.add(questionId)
    registerQuestionAnchor(state, questionId, attrs.id || '')
  }
  return {
    type: 'select',
    questionId,
    fieldName: String(element.getAttribute('name') || '').trim(),
    attrs,
    options: Array.from(element.querySelectorAll('option')).map((option) => ({
      value: String(option.getAttribute('value') || '').trim(),
      label: String(option.textContent || '').replace(/\s+/g, ' ').trim()
    }))
  }
}

function compileChildren(state, element) {
  const nodes = []
  element.childNodes.forEach((child) => {
    const compiled = compileNode(state, child)
    if (compiled == null) {
      return
    }
    if (Array.isArray(compiled)) {
      nodes.push(...compiled)
      return
    }
    nodes.push(compiled)
  })
  return nodes
}

function compileElementNode(state, element) {
  collectAnchorsFromElement(state, element)

  if (element.classList?.contains('dropped-items')) {
    return null
  }

  if (
    element.classList?.contains('paragraph-dropzone')
    || element.classList?.contains('match-dropzone')
    || element.classList?.contains('drop-target-summary')
  ) {
    const appearance = element.classList.contains('paragraph-dropzone')
      ? 'paragraph'
      : element.classList.contains('match-dropzone')
        ? 'match'
        : 'summary'
    return createDropzoneNode(state, element, appearance)
  }

  if (
    element.classList?.contains('drag-item')
    || element.classList?.contains('drag-item-clone')
    || element.classList?.contains('draggable-word')
    || element.classList?.contains('card')
  ) {
    return createOptionChipNode(state, element)
  }

  const tag = element.tagName.toLowerCase()
  if (tag === 'input') {
    const inputType = String(element.getAttribute('type') || 'text').toLowerCase()
    if (inputType === 'radio' || inputType === 'checkbox') {
      return createChoiceInputNode(state, element)
    }
    return createTextInputNode(state, element)
  }

  if (tag === 'textarea') {
    return createTextInputNode(state, element)
  }

  if (tag === 'select') {
    return createSelectNode(state, element)
  }

  const attrs = sanitizeAttributes(element)
  const previousPoolId = state.currentPoolId
  if (
    element.classList?.contains('pool-items')
    || element.classList?.contains('cardpool')
    || attrs.id === 'word-options'
  ) {
    const poolId = attrs.id || `practice-pool-${state.autoPoolId += 1}`
    attrs.id = poolId
    state.currentPoolId = poolId
  }

  const children = compileChildren(state, element)
  state.currentPoolId = previousPoolId

  return {
    type: 'element',
    tag,
    attrs,
    children
  }
}

function compileNode(state, node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return {
      type: 'text',
      text: node.textContent ?? ''
    }
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null
  }
  return compileElementNode(state, node)
}

function compileHtmlFragment(html, state) {
  const parser = new DOMParser()
  const document = parser.parseFromString(`<body>${html || ''}</body>`, 'text/html')
  const body = document.body
  return compileChildren(state, body)
}

function normalizeExplanation(rawExplanation) {
  if (!rawExplanation) {
    return null
  }

  const questionMap = {}
  const questionSections = Array.isArray(rawExplanation.questionExplanations)
    ? rawExplanation.questionExplanations.map((section) => {
      const items = Array.isArray(section.items)
        ? section.items.map((item) => {
          const questionId = normalizeQuestionId(item.questionId || item.questionNumber)
          const normalized = {
            questionId,
            questionNumber: Number(item.questionNumber || 0) || null,
            text: String(item.text || '').trim()
          }
          if (questionId && !questionMap[questionId]) {
            questionMap[questionId] = normalized
          }
          return normalized
        })
        : []

      return {
        sectionTitle: String(section.sectionTitle || '').trim(),
        mode: String(section.mode || '').trim(),
        questionRange: section.questionRange || null,
        text: String(section.text || '').trim(),
        items
      }
    })
    : []

  return {
    schemaVersion: 'ReadingExplanationDocumentV1',
    examId: rawExplanation.examId,
    meta: {
      ...rawExplanation.meta,
      title: toEnglishTitle(rawExplanation.meta?.title || '')
    },
    passageNotes: Array.isArray(rawExplanation.passageNotes)
      ? rawExplanation.passageNotes.map((entry) => ({
        label: String(entry.label || '').trim(),
        text: String(entry.text || '').trim()
      }))
      : [],
    questionSections,
    questionMap
  }
}

function compileExam(rawExam, normalizedExplanation) {
  const state = createCompilerState()
  const passageBlocks = Array.isArray(rawExam.passage?.blocks)
    ? rawExam.passage.blocks.map((block) => ({
      blockId: block.blockId,
      kind: block.kind,
      nodes: compileHtmlFragment(block.bodyHtml || block.html || '', state)
    }))
    : []

  const questionGroups = Array.isArray(rawExam.questionGroups)
    ? rawExam.questionGroups.map((group) => {
      const explanationSection = normalizedExplanation?.questionSections?.find((section) => {
        if (!Array.isArray(section.items) || !section.items.length) {
          return false
        }
        return section.items.some((item) => Array.isArray(group.questionIds) && group.questionIds.includes(item.questionId))
      }) ?? null

      return {
        groupId: group.groupId,
        kind: group.kind,
        questionIds: Array.isArray(group.questionIds) ? group.questionIds : [],
        allowOptionReuse: Boolean(group.allowOptionReuse),
        leadNodes: compileHtmlFragment(group.leadHtml || '', state),
        contentNodes: compileHtmlFragment(group.bodyHtml || '', state),
        explanationSection
      }
    })
    : []

  const questionOrder = Array.isArray(rawExam.questionOrder) ? rawExam.questionOrder : Object.keys(rawExam.answerKey || {})
  const questionDisplayMap = rawExam.questionDisplayMap || {}

  // Ensure questionAnchors covers all questionOrder entries
  // For any missing anchors, derive from questionItems or use fallback pattern
  questionOrder.forEach((questionId) => {
    if (!state.questionAnchors[questionId]) {
      // Try to find anchor from compiled question groups
      for (const group of questionGroups) {
        if (group.questionIds?.includes(questionId)) {
          // Try to extract anchor from contentNodes
          const anchorPattern = new RegExp(`\\b(id=["'](${questionId}[^"']*?)["'])\\b`, 'i')
          const contentHtml = JSON.stringify(group.contentNodes)
          const match = contentHtml.match(anchorPattern)
          if (match) {
            state.questionAnchors[questionId] = match[2]
            break
          }
          // Try to find from leadNodes as well
          const leadHtml = JSON.stringify(group.leadNodes)
          const leadMatch = leadHtml.match(anchorPattern)
          if (leadMatch) {
            state.questionAnchors[questionId] = leadMatch[2]
            break
          }
        }
      }
      // Final fallback: check fields to determine question type and derive anchor
      if (!state.questionAnchors[questionId]) {
        // Check dropzone first (has explicit questionId set)
        if (state.fields.dropzoneQuestions.has(questionId)) {
          // Dropzone should have its id/data-question attrs rendered, use those as anchor
          state.questionAnchors[questionId] = questionId
        } else if (state.fields.textQuestions.has(questionId)) {
          state.questionAnchors[questionId] = `${questionId}_input`
        } else if (state.fields.selectQuestions.has(questionId)) {
          state.questionAnchors[questionId] = `${questionId}_select`
        } else if (state.fields.textareaQuestions.has(questionId)) {
          state.questionAnchors[questionId] = `${questionId}_textarea`
        } else {
          // For choice inputs, find the fieldName that contains this questionId
          let foundFieldName = null
          for (const [fieldName, groupInfo] of state.fields.choiceGroups.entries()) {
            if (groupInfo.questionIds?.includes(questionId)) {
              foundFieldName = fieldName
              break
            }
          }
          if (foundFieldName) {
            const groupInfo = state.fields.choiceGroups.get(foundFieldName)
            if (groupInfo?.questionIds?.length === 1) {
              state.questionAnchors[questionId] = `${foundFieldName}_input`
            } else {
              // Shared choice group: multiple questions map to the same fieldName
              // Use the fieldName as the group anchor
              state.questionAnchors[questionId] = `${foundFieldName}_group`
            }
          } else {
            // Ultimate fallback: use questionId itself as anchor
            state.questionAnchors[questionId] = questionId
          }
        }
      }
    }
  })

  // Post-processing: normalize anchors for shared choice groups
  // All questions in the same group should share the same anchor
  for (const [fieldName, groupInfo] of state.fields.choiceGroups.entries()) {
    if (groupInfo.questionIds && groupInfo.questionIds.length > 1) {
      // Find the first existing anchor for this group
      let groupAnchor = null
      for (const qid of groupInfo.questionIds) {
        if (state.questionAnchors[qid]) {
          groupAnchor = state.questionAnchors[qid]
          break
        }
      }
      // If a group anchor exists, apply it to all questions in the group
      if (groupAnchor) {
        for (const qid of groupInfo.questionIds) {
          state.questionAnchors[qid] = groupAnchor
        }
      }
    }
  }

  const questionItems = questionOrder.map((questionId) => ({
    questionId,
    displayNumber: String(questionDisplayMap[questionId] || questionId.replace(/^q/i, '')).trim(),
    anchorId: state.questionAnchors[questionId] || `${questionId}-anchor`
  }))

  return {
    schemaVersion: 'ReadingExamDocumentV1',
    examId: rawExam.examId,
    meta: {
      ...rawExam.meta,
      title: toEnglishTitle(rawExam.meta?.title || rawExam.examId),
      originalTitle: String(rawExam.meta?.title || rawExam.examId).trim()
    },
    explanationKey: normalizedExplanation?.examId || null,
    passageBlocks,
    questionGroups,
    questionItems,
    options: state.options,
    answerKey: rawExam.answerKey || {},
    questionOrder,
    questionDisplayMap,
    paragraphAnchors: state.paragraphAnchors,
    questionAnchors: state.questionAnchors,
    fields: {
      choiceGroups: Array.from(state.fields.choiceGroups.values()),
      textQuestions: Array.from(state.fields.textQuestions),
      selectQuestions: Array.from(state.fields.selectQuestions),
      textareaQuestions: Array.from(state.fields.textareaQuestions),
      dropzoneQuestions: Array.from(state.fields.dropzoneQuestions)
    },
    totalQuestions: questionOrder.length
  }
}

function cleanOutputDir(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true })
  }
  ensureDir(target)
}

function main() {
  ensureDir(OUTPUT_DIR)
  cleanOutputDir(OUTPUT_EXAMS_DIR)
  cleanOutputDir(OUTPUT_EXPLANATIONS_DIR)

  const examManifest = loadManifestPayload(path.join(EXAMS_DIR, 'manifest.js'), '__READING_EXAM_MANIFEST__')
  const explanationManifest = loadManifestPayload(
    path.join(EXPLANATIONS_DIR, 'manifest.js'),
    '__READING_EXPLANATION_MANIFEST__'
  )

  const outputManifest = {
    generatedAt: new Date().toISOString(),
    exams: {}
  }

  const examIds = Object.keys(examManifest).sort((left, right) => left.localeCompare(right, 'en'))
  let compiledExamCount = 0
  let compiledExplanationCount = 0

  examIds.forEach((examId) => {
    const examEntry = examManifest[examId]
    if (!examEntry?.script) {
      throw new Error(`missing_exam_script:${examId}`)
    }

    const rawExam = loadRegistryPayload(path.join(EXAMS_DIR, path.basename(examEntry.script)), '__READING_EXAM_DATA__')
    if (!rawExam) {
      throw new Error(`missing_exam_payload:${examId}`)
    }

    let normalizedExplanation = null
    const explanationEntry = explanationManifest[examId]
    if (explanationEntry?.script) {
      try {
        const rawExplanation = loadRegistryPayload(
          path.join(EXPLANATIONS_DIR, path.basename(explanationEntry.script)),
          '__READING_EXPLANATION_DATA__'
        )
        if (rawExplanation) {
          normalizedExplanation = normalizeExplanation(rawExplanation)
          writeJson(path.join(OUTPUT_EXPLANATIONS_DIR, `${examId}.json`), normalizedExplanation)
          compiledExplanationCount += 1
        }
      } catch (error) {
        console.warn(`[generate-reading-native] skipped explanation for ${examId}: ${error.message}`)
      }
    }

    const compiledExam = compileExam(rawExam, normalizedExplanation)
    writeJson(path.join(OUTPUT_EXAMS_DIR, `${examId}.json`), compiledExam)
    outputManifest.exams[examId] = {
      examId,
      title: compiledExam.meta.title,
      category: compiledExam.meta.category || examEntry.category || '',
      totalQuestions: compiledExam.totalQuestions,
      examPath: `./exams/${examId}.json`,
      explanationPath: normalizedExplanation ? `./explanations/${examId}.json` : null
    }
    compiledExamCount += 1
  })

  writeJson(MANIFEST_PATH, outputManifest)

  console.log(`[generate-reading-native] compiled ${compiledExamCount} exams and ${compiledExplanationCount} explanations`)
}

main()
