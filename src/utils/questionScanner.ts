import questionIndex from './questionIndex.json'

export interface Question {
  id: string
  title: string
  titleCN: string
  category: 'P1' | 'P2' | 'P3'
  type: 'reading'
  difficulty: '高频' | '次频'
  totalQuestions: number
  htmlPath: string
  pdfPath?: string
}

/**
 * 从 HTML 文件内容中解析题目数量
 */
function countQuestionsFromHtml(htmlContent: string): number {
  // 统计判断题（radio input）
  const radioMatches = htmlContent.match(/<input[^>]*type="radio"[^>]*>/gi) || []
  
  // 统计填空题（input.blank 或 input[type="text"]）
  const blankMatches = htmlContent.match(/<input[^>]*class="blank"[^>]*>/gi) || []
  const textMatches = htmlContent.match(/<input[^>]*type="text"[^>]*>/gi) || []
  
  // 去重计算（radio 可能有多选，需要按 name 分组）
  const radioNames = new Set<string>()
  radioMatches.forEach(match => {
    const nameMatch = match.match(/name="([^"]+)"/i)
    if (nameMatch && nameMatch[1]) {
      radioNames.add(nameMatch[1])
    }
  })
  
  // 填空题数量
  const blankInputs = new Set<string>()
  ;[...blankMatches, ...textMatches].forEach(match => {
    const idMatch = match.match(/id="([^"]+)"/i)
    if (idMatch && idMatch[1]) {
      blankInputs.add(idMatch[1])
    }
  })
  
  const totalQuestions = radioNames.size + blankInputs.size
  
  // 如果解析失败，返回默认值
  return totalQuestions > 0 ? totalQuestions : 13
}

/**
 * 估算题目数量（根据类别）
 */
function estimateTotalQuestions(htmlPath: string | undefined | null): number {
  // P1/P2: 13 题，P3: 14 题
  if (!htmlPath) return 13
  if (htmlPath.includes('P3')) return 14
  return 13
}

/**
 * 扫描 questionBank 目录并返回所有题目
 * 使用预生成的索引文件
 */
export function scanQuestionBank(): Question[] {
  const questions = (questionIndex as any[]).map(item => ({
    ...item,
    type: 'reading' as const,
    totalQuestions: item.totalQuestions || estimateTotalQuestions(item.htmlPath)
  })).filter(item => item.id && item.title) as Question[]

  // 按类别排序
  questions.sort((a, b) => {
    const categoryOrder = { 'P1': 1, 'P2': 2, 'P3': 3 }
    if (categoryOrder[a.category] !== categoryOrder[b.category]) {
      return categoryOrder[a.category] - categoryOrder[b.category]
    }
    return a.title.localeCompare(b.title)
  })

  return questions
}

/**
 * 根据 ID 获取题目
 */
export function getQuestionByIdFromBank(id: string): Question | undefined {
  const questions = scanQuestionBank()
  return questions.find(q => q.id === id)
}
