import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { load } from 'cheerio'
import { publicRoot } from '../../config/paths.js'
import type {
  ParsedQuestionDocument,
  QuestionIndexEntry,
  QuestionSummaryDoc,
  RagChunk,
  RagChunkMetadata
} from '../../types/question-bank.js'
import { compactMultiline, normalizeWhitespace, uniqueValues } from '../utils/text.js'
import { buildQualityReport } from './qualityCheck.js'

const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'almost', 'also', 'among', 'around', 'because',
  'been', 'before', 'being', 'between', 'could', 'every', 'from', 'have', 'having', 'into',
  'itself', 'just', 'more', 'most', 'need', 'other', 'over', 'same', 'should', 'such',
  'than', 'that', 'their', 'there', 'these', 'they', 'this', 'through', 'under', 'very',
  'were', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your'
])

interface ParsedAnswerRow {
  questionNumber: string
  answer: string
  explanation: string
  evidence: string
  paragraphLabel?: string
}

interface AnswerTableColumnMap {
  question: number
  answer: number
  paragraph?: number
  explanation?: number
  evidence?: number
  combined?: number
}

function buildChunkMetadata(
  question: QuestionIndexEntry,
  chunkType: RagChunk['chunkType'],
  sensitive: boolean,
  questionNumbers: string[],
  paragraphLabels: string[],
  sourcePath: string,
  questionType?: string
): RagChunkMetadata {
  return {
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    chunkType,
    sensitive,
    questionNumbers,
    paragraphLabels,
    sourcePath,
    questionType
  }
}

function buildChunkId(questionId: string, chunkType: RagChunk['chunkType'], suffix: string): string {
  return `${questionId}:${chunkType}:${suffix}`
}

function buildChunk(
  question: QuestionIndexEntry,
  sourcePath: string,
  chunkType: RagChunk['chunkType'],
  sensitive: boolean,
  suffix: string,
  content: string,
  questionNumbers: string[] = [],
  paragraphLabels: string[] = [],
  questionType?: string
): RagChunk {
  const normalizedContent = compactMultiline(content)

  return {
    id: buildChunkId(question.id, chunkType, suffix),
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    chunkType,
    sensitive,
    questionNumbers,
    paragraphLabels,
    content: normalizedContent,
    sourcePath,
    metadata: buildChunkMetadata(
      question,
      chunkType,
      sensitive,
      questionNumbers,
      paragraphLabels,
      sourcePath,
      questionType
    )
  }
}

function inferQuestionType(
  instructions: string,
  sectionText: string,
  hasSelect: boolean,
  hasRadio: boolean,
  hasCheckbox: boolean,
  textInputCount: number
): string {
  const source = `${instructions}\n${sectionText}`.toLowerCase()

  if (source.includes('choose the correct heading') || source.includes('list of headings')) {
    return 'heading_matching'
  }

  if (source.includes('which paragraph contains')) {
    return 'paragraph_matching'
  }

  if (source.includes('true false not given')) {
    return 'true_false_not_given'
  }

  if (source.includes('yes no not given')) {
    return 'yes_no_not_given'
  }

  if (source.includes('match each') || source.includes('look at the following') || source.includes('list of ideas')) {
    return 'matching'
  }

  if (source.includes('choose two letters') || source.includes('select two distinct answers') || hasCheckbox) {
    return 'multiple_select'
  }

  if (source.includes('choose the correct letter')) {
    return 'multiple_choice'
  }

  if (textInputCount > 0) {
    return 'sentence_completion'
  }

  if (hasRadio) {
    return 'radio_choice'
  }

  if (hasSelect) {
    return 'dropdown_choice'
  }

  return 'unknown'
}

function extractPassageChunks(html: string, question: QuestionIndexEntry, sourcePath: string): RagChunk[] {
  const $ = load(html)
  const left = $('#left').first()
  if (left.length === 0) {
    return []
  }

  const chunks: RagChunk[] = []
  const rawHtml = left.html() ?? ''
  const explicitLabelPattern = /<span[^>]*class=["']paragraph-label["'][^>]*>\s*([^<]+?)\s*<\/span>([\s\S]*?)(?=<span[^>]*class=["']paragraph-label["'][^>]*>|$)/gi
  let match: RegExpExecArray | null

  while ((match = explicitLabelPattern.exec(rawHtml)) !== null) {
    const label = normalizeWhitespace(match[1])
    const rawContent = match[2]
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, '\n')
      .replace(/<p[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
    const content = normalizeWhitespace(rawContent)

    if (!label || !content) {
      continue
    }

    chunks.push(
      buildChunk(
        question,
        sourcePath,
        'passage_paragraph',
        false,
        label,
        `Paragraph ${label}\n${content}`,
        [],
        [label]
      )
    )
  }

  if (chunks.length > 0) {
    return chunks
  }

  const paragraphHeadings = left.children('h4').toArray()
  for (const heading of paragraphHeadings) {
    const headingText = normalizeWhitespace($(heading).text())
    const labelMatch = headingText.match(/^Paragraph\s+([A-Z])$/i)
    if (!labelMatch) {
      continue
    }

    const label = labelMatch[1].toUpperCase()
    const paragraphParts: string[] = []
    let sibling = $(heading).next()

    while (sibling.length > 0 && !sibling.is('h4')) {
      const text = normalizeWhitespace(sibling.text())
      if (text) {
        paragraphParts.push(text)
      }

      sibling = sibling.next()
    }

    const content = normalizeWhitespace(paragraphParts.join(' '))
    if (!content) {
      continue
    }

    chunks.push(
      buildChunk(
        question,
        sourcePath,
        'passage_paragraph',
        false,
        label,
        `Paragraph ${label}\n${content}`,
        [],
        [label]
      )
    )
  }

  if (chunks.length > 0) {
    return chunks
  }

  const fallbackParagraphs = left
    .children('p')
    .toArray()
    .map((element) => normalizeWhitespace($(element).text()))
    .filter((text) => {
      if (!text || /^you should spend about/i.test(text)) {
        return false
      }

      if (text === '&nbsp;') {
        return false
      }

      return text.length > 40
    })

  return fallbackParagraphs.map((content, index) => {
    const label = String.fromCharCode(65 + index)
    return buildChunk(
      question,
      sourcePath,
      'passage_paragraph',
      false,
      label,
      `Paragraph ${label}\n${content}`,
      [],
      [label]
    )
  })
}

function extractQuestionChunks(html: string, question: QuestionIndexEntry, sourcePath: string): RagChunk[] {
  const $ = load(html)
  const right = $('#right').first()
  const questionNumberSet = new Set<string>()

  right.find('[id^="q"]').each((_, element) => {
    const value = $(element).attr('id') ?? ''
    const match = value.match(/^q(\d+)/i)
    if (match) {
      questionNumberSet.add(match[1])
    }
  })

  right.find('[name^="q"]').each((_, element) => {
    const value = $(element).attr('name') ?? ''
    const match = value.match(/^q(\d+)/i)
    if (match) {
      questionNumberSet.add(match[1])
    }
  })

  const questionNumbers = Array.from(questionNumberSet).sort((left, rightValue) => Number(left) - Number(rightValue))

  const extractRenderableText = (element: any) => {
    const clone = element.clone()
    clone.find('input, select, textarea, button, script, style').remove()
    clone.find('a[id$="-anchor"]').remove()
    return compactMultiline(clone.text())
  }

  const resolveQuestionContainer = (group: any, questionNumber: string) => {
    let container = group.find(`#q${questionNumber}-section`).first()
    if (container.length > 0) {
      return container
    }

    const anchor = group.find(`#q${questionNumber}-anchor`).first()
    if (anchor.length > 0) {
      const directSection = anchor.next(`[id^="q${questionNumber}"][id$="-section"]`).first()
      if (directSection.length > 0) {
        return directSection
      }

      const anchorBlock = anchor.closest('.q-block, .question-block, li, p, div, td, tr, label')
      if (anchorBlock.length > 0) {
        return anchorBlock
      }
    }

    const controlById = group.find(`#q${questionNumber}`).first()
    if (controlById.length > 0) {
      const scopedContainer = controlById.closest('.q-block, .question-block, li, p, div, td, tr, label')
      if (scopedContainer.length > 0) {
        return scopedContainer
      }
    }

    const controlByName = group.find(`[name="q${questionNumber}"]`).first()
    if (controlByName.length > 0) {
      const scopedContainer = controlByName.closest('.q-block, .question-block, li, p, div, td, tr, label')
      if (scopedContainer.length > 0) {
        return scopedContainer
      }
    }

    return group
      .find('li, p, div, td, tr, label')
      .filter((_: number, element: any) => {
        const node = $(element)
        return node.find(`#q${questionNumber}, [name="q${questionNumber}"], #q${questionNumber}-anchor`).length > 0
      })
      .first()
  }

  const extractSharedInstructions = (group: any) => {
    const clone = group.clone()
    clone.find('script, style, button').remove()
    clone.find('a[id$="-anchor"]').remove()
    clone.find('[id^="q"][id$="-section"], .q-block, .question-block').remove()
    clone
      .find('li, p, div, td, tr, label, span')
      .filter((_: number, element: any) => {
        const node = $(element)
        if (node.hasClass('group')) {
          return false
        }

        return node.find('input[name^="q"], input[id^="q"], select[name^="q"], select[id^="q"], textarea[name^="q"], textarea[id^="q"]').length > 0
      })
      .remove()

    return extractRenderableText(clone)
  }

  const extractInputOptions = (scope: any, questionNumber: string) => {
    const inputs = scope.find(`input[name="q${questionNumber}"], input[id="q${questionNumber}"]`).toArray() as any[]

    return uniqueValues(
      inputs
        .map((input: any) => {
          const labelText = normalizeWhitespace($(input).closest('label').text())
          const parentText = normalizeWhitespace($(input).parent().text())
          return labelText || parentText || normalizeWhitespace($(input).attr('value') ?? '')
        })
        .filter(Boolean)
    )
  }

  return questionNumbers
    .map((questionNumber) => {
      const selector = `#q${questionNumber}, [name="q${questionNumber}"], #q${questionNumber}-section, #q${questionNumber}-anchor`
      const reference = right.find(selector).first()
      const $group = reference.closest('.group')
      if ($group.length === 0) {
        return null
      }

      const heading = normalizeWhitespace($group.find('h4').first().text())
      const instructions = extractSharedInstructions($group)
      const container = resolveQuestionContainer($group, questionNumber)

      if (container.length === 0) {
        return null
      }

      const prompt = extractRenderableText(container)

      const selectOptionNodes = container.find('select option').toArray() as any[]
      const selectOptions = selectOptionNodes
        .map((option: any) => normalizeWhitespace($(option).text()))
        .filter((option: string) => option && !option.startsWith('--'))

      const inputOptions = extractInputOptions(container, questionNumber)
      const radioOptions = container.find(`input[type="radio"][name="q${questionNumber}"], input[type="radio"][id="q${questionNumber}"]`).length > 0
        ? inputOptions
        : []
      const checkboxOptions = container.find(`input[type="checkbox"][name="q${questionNumber}"], input[type="checkbox"][id="q${questionNumber}"]`).length > 0
        ? inputOptions
        : []

      const textInputCount = container.find(`#q${questionNumber}, input.blank[id="q${questionNumber}"], input[type="text"][id="q${questionNumber}"], input.blank[name="q${questionNumber}"], input[type="text"][name="q${questionNumber}"]`).length
      const questionType = inferQuestionType(
        instructions,
        prompt,
        selectOptions.length > 0,
        radioOptions.length > 0,
        checkboxOptions.length > 0,
        textInputCount
      )

      const contentParts = [
        `Question ${questionNumber}`,
        heading ? `Section: ${heading}` : '',
        instructions ? `Shared instructions:\n${instructions}` : '',
        prompt ? `Prompt:\n${prompt}` : '',
        selectOptions.length > 0 ? `Options: ${selectOptions.join(', ')}` : '',
        radioOptions.length > 0 ? `Options: ${radioOptions.join(', ')}` : '',
        checkboxOptions.length > 0 ? `Options: ${checkboxOptions.join(', ')}` : '',
        textInputCount > 0 ? `Blank inputs: ${textInputCount}` : '',
        `Question type: ${questionType}`
      ].filter(Boolean)

      if (!prompt && !instructions) {
        return null
      }

      return buildChunk(
        question,
        sourcePath,
        'question_item',
        false,
        questionNumber,
        contentParts.join('\n'),
        [questionNumber],
        [],
        questionType
      )
    })
    .filter((chunk): chunk is RagChunk => chunk !== null)
}

function extractAnswersObject(html: string): Record<string, string> {
  const answersMatch = html.match(/(?:const|let|var)\s+(?:answers|correctAnswers)\s*=\s*(\{[\s\S]*?\});/i)
  if (!answersMatch) {
    return {}
  }

  try {
    const evaluator = new Function(`return (${answersMatch[1]})`)
    const result = evaluator() as Record<string, string>
    return result
  } catch {
    return {}
  }
}

function extractAnswerKeyChunks(html: string, question: QuestionIndexEntry, sourcePath: string): RagChunk[] {
  const rowAnswers = extractAnswerRows(html)
  const fallbackAnswers = extractAnswersObject(html)
  const answerMap = new Map<string, string>()

  for (const row of rowAnswers) {
    answerMap.set(row.questionNumber, row.answer)
  }

  for (const [key, value] of Object.entries(fallbackAnswers)) {
    const questionNumber = key.replace(/^q/i, '')
    if (!answerMap.has(questionNumber)) {
      answerMap.set(questionNumber, normalizeWhitespace(value))
    }
  }

  return Array.from(answerMap.entries()).map(([questionNumber, answer]) =>
    buildChunk(
      question,
      sourcePath,
      'answer_key',
      true,
      questionNumber,
      `Question ${questionNumber}\nCorrect answer: ${answer}`,
      [questionNumber]
    )
  )
}

function decodeHtmlFragments(fragments: string[]): string {
  return fragments
    .join('')
    .replace(/\\n/g, '\n')
    .replace(/\\'/g, '\'')
    .replace(/\\"/g, '"')
}

function normalizeQuestionNumber(value: string): string {
  const normalized = normalizeWhitespace(value)
  const match = normalized.match(/\d{1,3}/)
  return match?.[0] ?? normalized
}

function normalizeHeaderLabel(value: string): string {
  return normalizeWhitespace(value).toLowerCase()
}

function findHeaderIndex(labels: string[], patterns: RegExp[]): number {
  return labels.findIndex((label) => patterns.some((pattern) => pattern.test(label)))
}

function splitExplanationAndEvidence(value: string): { explanation: string; evidence: string } {
  const normalized = compactMultiline(value)
  if (!normalized) {
    return { explanation: '', evidence: '' }
  }

  const markerMatch = normalized.match(
    /([\s\S]*?)(?:原文依据|原文|关键定位句|精确定位句|定位句|evidence)\s*[:：]\s*([\s\S]+)/i
  )

  if (!markerMatch) {
    return {
      explanation: normalized,
      evidence: ''
    }
  }

  return {
    explanation: compactMultiline(markerMatch[1]),
    evidence: compactMultiline(markerMatch[2])
  }
}

function resolveAnswerTableColumns(headers: string[], cellCount: number): AnswerTableColumnMap {
  const labels = headers.map(normalizeHeaderLabel)
  const question = findHeaderIndex(labels, [/题号/, /\bquestion\b/])
  const paragraph = findHeaderIndex(labels, [/段落/, /\bparagraph\b/])
  const answer = findHeaderIndex(labels, [/正确标题/, /答案/, /correct answer/, /correct heading/, /\banswer\b/, /\bheading\b/])
  const combined = findHeaderIndex(labels, [/解析.*原文/, /原文.*解析/, /解析.*依据/, /依据.*解析/])
  const evidence = findHeaderIndex(labels, [/定位句/, /原文/, /依据/, /\bevidence\b/])
  const explanation = findHeaderIndex(labels, [/解析/, /\banalysis\b/, /\bexplanation\b/])

  const mapping: AnswerTableColumnMap = {
    question: question !== -1 ? question : 0,
    answer: answer !== -1 ? answer : (cellCount >= 5 ? 2 : 1)
  }

  if (paragraph !== -1) {
    mapping.paragraph = paragraph
  }

  if (combined !== -1) {
    mapping.combined = combined
    return mapping
  }

  if (evidence !== -1) {
    mapping.evidence = evidence
  }

  if (explanation !== -1) {
    mapping.explanation = explanation
  }

  if (cellCount === 3 && mapping.explanation === undefined && mapping.evidence === undefined) {
    mapping.combined = 2
    return mapping
  }

  if (cellCount === 4) {
    if (mapping.evidence === undefined) {
      mapping.evidence = 2
    }
    if (mapping.explanation === undefined) {
      mapping.explanation = 3
    }
    return mapping
  }

  if (cellCount >= 5) {
    if (mapping.paragraph === undefined) {
      mapping.paragraph = 1
    }
    if (answer === -1) {
      mapping.answer = 2
    }
    if (mapping.evidence === undefined) {
      mapping.evidence = 3
    }
    if (mapping.explanation === undefined) {
      mapping.explanation = 4
    }
  }

  return mapping
}

function extractAnswerRows(html: string): ParsedAnswerRow[] {
  const $ = load(html)
  const directRows = $('#answerContent tr').toArray()

  let rows = directRows
  if (rows.length === 0) {
    const fragments = Array.from(html.matchAll(/answerHtml\s*\+=\s*'([\s\S]*?)';/g)).map((match) => match[1])
    if (fragments.length > 0) {
      const answerHtml = decodeHtmlFragments(fragments)
      const fragmentRoot = load(`<div id="fragment-root">${answerHtml}</div>`)
      rows = fragmentRoot('tr').toArray()
    }
  }

  if (rows.length === 0) {
    const inlineAssignmentMatch = html.match(/document\.getElementById\(['"]answerContent['"]\)\.innerHTML\s*=\s*`([\s\S]*?)`;/i)
    if (inlineAssignmentMatch) {
      const fragmentRoot = load(`<div id="fragment-root">${inlineAssignmentMatch[1]}</div>`)
      rows = fragmentRoot('tr').toArray()
    }
  }

  const headerRow = rows.find((row) => $(row).find('th').length > 0)
  const bodyRows = rows.filter((row) => row !== headerRow && $(row).find('td').length > 0)
  const headers = headerRow
    ? $(headerRow).find('th').toArray().map((cell) => compactMultiline($(cell).text()))
    : []
  const firstCellCount = bodyRows[0] ? $(bodyRows[0]).find('td').length : 0
  const columnMap = resolveAnswerTableColumns(headers, firstCellCount)

  const parsedRows: Array<ParsedAnswerRow | null> = bodyRows.map((row) => {
      const cellValues = $(row)
        .find('td')
        .toArray()
        .map((cell) => compactMultiline($(cell).text()))

      if (cellValues.length < 3) {
        return null
      }

      const questionNumber = normalizeQuestionNumber(cellValues[columnMap.question] ?? '')
      const answer = normalizeWhitespace(cellValues[columnMap.answer] ?? '')
      const paragraphLabel = normalizeWhitespace(
        columnMap.paragraph !== undefined ? (cellValues[columnMap.paragraph] ?? '') : ''
      )

      let explanation = ''
      let evidence = ''

      if (columnMap.combined !== undefined) {
        const parsed = splitExplanationAndEvidence(cellValues[columnMap.combined] ?? '')
        explanation = parsed.explanation
        evidence = parsed.evidence
      } else {
        explanation = compactMultiline(
          columnMap.explanation !== undefined ? (cellValues[columnMap.explanation] ?? '') : ''
        )
        evidence = compactMultiline(
          columnMap.evidence !== undefined ? (cellValues[columnMap.evidence] ?? '') : ''
        )

        if (!explanation && evidence) {
          const parsed = splitExplanationAndEvidence(evidence)
          explanation = parsed.explanation
          evidence = parsed.evidence
        }
      }

      if (!questionNumber || !answer || (!explanation && !evidence)) {
        return null
      }

      return {
        questionNumber,
        answer,
        explanation,
        evidence,
        paragraphLabel: paragraphLabel || undefined
      }
    })

  return parsedRows.filter((row): row is ParsedAnswerRow => row !== null)
}

function extractAnswerExplanationChunks(html: string, question: QuestionIndexEntry, sourcePath: string): RagChunk[] {
  const rows = extractAnswerRows(html)
  const fallbackAnswers = extractAnswersObject(html)

  if (rows.length > 0) {
    const rowChunks = rows.map((row) =>
      buildChunk(
        question,
        sourcePath,
        'answer_explanation',
        true,
        row.questionNumber,
        compactMultiline([
          `Question ${row.questionNumber}`,
          row.paragraphLabel ? `Paragraph: ${row.paragraphLabel}` : '',
          `Correct answer: ${row.answer}`,
          row.explanation ? `Explanation:\n${row.explanation}` : '',
          row.evidence ? `Evidence:\n${row.evidence}` : ''
        ].filter(Boolean).join('\n')),
        [row.questionNumber],
        row.paragraphLabel ? [row.paragraphLabel] : []
      )
    )

    const explainedQuestions = new Set(rows.map((row) => row.questionNumber))
    const missingFallbackChunks = Object.entries(fallbackAnswers)
      .filter(([key]) => !explainedQuestions.has(key.replace(/^q/i, '')))
      .map(([key, value]) => {
        const questionNumber = key.replace(/^q/i, '')
        return buildChunk(
          question,
          sourcePath,
          'answer_explanation',
          true,
          questionNumber,
          `Question ${questionNumber}\nCorrect answer: ${normalizeWhitespace(value)}\nExplanation:\nThe answer panel lists the correct answer but no detailed explanation was found.`,
          [questionNumber]
        )
      })

    return [...rowChunks, ...missingFallbackChunks]
  }

  return Object.entries(fallbackAnswers).map(([key, value]) => {
    const questionNumber = key.replace(/^q/i, '')
    return buildChunk(
      question,
      sourcePath,
      'answer_explanation',
      true,
      questionNumber,
      `Question ${questionNumber}\nCorrect answer: ${normalizeWhitespace(value)}\nExplanation:\nThe answer panel lists the correct answer but no detailed explanation was found.`,
      [questionNumber]
    )
  })
}

function extractKeywords(question: QuestionIndexEntry, passageChunks: RagChunk[], questionChunks: RagChunk[]): string[] {
  const source = [
    question.title,
    ...passageChunks.slice(0, 4).map((chunk) => chunk.content),
    ...questionChunks.map((chunk) => chunk.content)
  ].join(' ')

  const scores = new Map<string, number>()
  const matches = source.match(/[A-Za-z][A-Za-z'-]{2,}/g) ?? []

  for (const rawWord of matches) {
    const word = rawWord.toLowerCase()
    if (STOPWORDS.has(word)) {
      continue
    }

    scores.set(word, (scores.get(word) ?? 0) + 1)
  }

  return Array.from(scores.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([word]) => word)
}

function buildSummaryDoc(
  question: QuestionIndexEntry,
  sourcePath: string,
  passageChunks: RagChunk[],
  questionChunks: RagChunk[]
): QuestionSummaryDoc {
  const topicSummary = passageChunks
    .slice(0, 3)
    .map((chunk) => chunk.content)
    .join(' ')

  const questionTypes = uniqueValues(
    questionChunks
      .map((chunk) => chunk.metadata.questionType)
      .filter((value): value is string => Boolean(value))
  )

  const keywords = extractKeywords(question, passageChunks, questionChunks)

  const content = compactMultiline([
    `Title: ${question.title}`,
    `Category: ${question.category}`,
    `Difficulty: ${question.difficulty}`,
    questionTypes.length > 0 ? `Question types: ${questionTypes.join(', ')}` : '',
    keywords.length > 0 ? `Keywords: ${keywords.join(', ')}` : '',
    topicSummary ? `Topic summary: ${topicSummary}` : ''
  ].filter(Boolean).join('\n'))

  return {
    id: `${question.id}:summary`,
    questionId: question.id,
    title: question.title,
    category: question.category,
    difficulty: question.difficulty,
    topicSummary,
    keywords,
    questionTypes,
    content,
    sourcePath,
    metadata: {
      questionId: question.id,
      title: question.title,
      category: question.category,
      difficulty: question.difficulty,
      sourcePath,
      keywords,
      questionTypes
    }
  }
}

export function parseQuestionHtml(question: QuestionIndexEntry, sourcePath: string, html: string): ParsedQuestionDocument {
  const passageChunks = extractPassageChunks(html, question, sourcePath)
  const questionChunks = extractQuestionChunks(html, question, sourcePath)
  const answerKeyChunks = extractAnswerKeyChunks(html, question, sourcePath)
  const answerExplanationChunks = extractAnswerExplanationChunks(html, question, sourcePath)
  const summary = buildSummaryDoc(question, sourcePath, passageChunks, questionChunks)

  const baseDocument = {
    question,
    sourcePath,
    passageChunks,
    questionChunks,
    answerKeyChunks,
    answerExplanationChunks,
    summary,
    allChunks: [...passageChunks, ...questionChunks, ...answerKeyChunks, ...answerExplanationChunks]
  }

  return {
    ...baseDocument,
    qualityReport: buildQualityReport(baseDocument)
  }
}

export async function parseQuestionDocument(question: QuestionIndexEntry): Promise<ParsedQuestionDocument> {
  if (!question.htmlPath) {
    throw new Error(`Question ${question.id} is missing htmlPath`)
  }

  const sourcePath = question.htmlPath.startsWith('/')
    ? resolve(publicRoot, `.${question.htmlPath}`)
    : resolve(publicRoot, question.htmlPath)

  const html = await readFile(sourcePath, 'utf8')
  return parseQuestionHtml(question, question.htmlPath, html)
}

