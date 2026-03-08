/**
 * 从 HTML 文件内容中解析题目数量
 */
export function countQuestionsFromHtml(htmlContent: string): number {
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
  
  // 如果解析失败，返回默认值 13
  return totalQuestions > 0 ? totalQuestions : 13
}

/**
 * 异步加载 HTML 文件并统计题目数量
 */
export async function countQuestionsFromUrl(url: string): Promise<number> {
  try {
    const response = await fetch(url)
    const htmlContent = await response.text()
    return countQuestionsFromHtml(htmlContent)
  } catch (error) {
    console.error('Failed to load HTML file:', error)
    return 13 // 返回默认值
  }
}
