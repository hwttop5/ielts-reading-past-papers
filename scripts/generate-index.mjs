import { promises as fs } from 'fs'
import path from 'path'

const ROOT = process.cwd()
const PUBLIC_DIR = path.join(ROOT, 'public')
const BANK_DIR = path.join(PUBLIC_DIR, 'questionBank')
const INDEX_PATH = path.join(ROOT, 'src', 'utils', 'questionIndex.json')

// 递归遍历目录
async function getFiles(dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(dirents.map((dirent) => {
    const res = path.resolve(dir, dirent.name)
    return dirent.isDirectory() ? getFiles(res) : res
  }))
  return Array.prototype.concat(...files)
}

// 解析文件名元数据
function parseFileName(filename, parentDir) {
  // 示例: 1. P1 - A Brief History of Tea 茶叶简史【高】.html
  // 匹配模式: 序号. 类别 - 英文名 中文名【难度】.html
  // 注意：文件名格式可能不统一，需要尽可能健壮的正则
  const name = filename.replace(/\.html?$/i, '')
  
  // 尝试提取难度 (高频/次频)
  let difficulty = '高频' // 默认
  if (name.includes('【次】') || name.includes('【次频】')) difficulty = '次频'
  else if (name.includes('【高】') || name.includes('【高频】')) difficulty = '高频'
  else if (parentDir.includes('次频')) difficulty = '次频' // 回退到目录名判断
  
  // 尝试提取类别 (P1/P2/P3)
  let category = 'P1' // 默认
  const catMatch = name.match(/P[123]/i) || parentDir.match(/P[123]/i)
  if (catMatch) category = catMatch[0].toUpperCase()
  
  // 尝试提取 ID 基础 (序号)
  let idBase = name
  const numMatch = name.match(/^(\d+)\./)
  if (numMatch) {
    idBase = numMatch[1]
  } else {
    // 如果没有序号，用文件名哈希或简化名
    idBase = name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase()
  }
  
  // 构造 ID: p1-1, p2-33 等
  const id = `${category.toLowerCase()}-${idBase}`
  
  // 尝试提取标题
  // 移除 【xx】后缀
  let cleanName = name.replace(/【.*?】/g, '').trim()
  // 移除 序号前缀 "1. P1 - "
  cleanName = cleanName.replace(/^\d+\.\s*P\d+\s*-\s*/i, '')
  
  // 分离中英文标题 (假设中文在后，英文在前，可能有空格分隔)
  // 简单策略：按最后一个非中文片段分割，或者直接存全名
  // 这里尝试智能分离：找到第一个中文字符的位置
  let title = cleanName
  let titleCN = ''
  
  const chineseRegex = /[\u4e00-\u9fa5]/
  const firstChineseIdx = cleanName.search(chineseRegex)
  
  if (firstChineseIdx > 0) {
    title = cleanName.slice(0, firstChineseIdx).trim()
    titleCN = cleanName.slice(firstChineseIdx).trim()
  } else if (firstChineseIdx === 0) {
    titleCN = cleanName
    title = cleanName // 如果全是中文，英文标题也暂存中文
  }
  
  return { id, title, titleCN, category, difficulty }
}

async function main() {
  console.log(`Scanning ${BANK_DIR}...`)
  
  try {
    await fs.access(BANK_DIR)
  } catch {
    console.error(`Error: Directory not found: ${BANK_DIR}`)
    process.exit(1)
  }

  const allFiles = await getFiles(BANK_DIR)
  const htmlFiles = allFiles.filter(f => /\.html?$/i.test(f))
  
  console.log(`Found ${htmlFiles.length} HTML files. Generating index...`)
  
  const index = htmlFiles.map(filePath => {
    const filename = path.basename(filePath)
    const parentDir = path.basename(path.dirname(filePath))
    
    // 生成相对路径 /questionBank/...
    const relativePath = path.relative(PUBLIC_DIR, filePath).split(path.sep).join('/')
    const htmlPath = '/' + relativePath
    
    const meta = parseFileName(filename, parentDir)
    
    return {
      ...meta,
      htmlPath
    }
  })
  
  // 排序：P1 -> P2 -> P3，内部按 ID 排序
  index.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    // 尝试按数字 ID 排序
    const numA = parseInt(a.id.split('-')[1]) || 0
    const numB = parseInt(b.id.split('-')[1]) || 0
    return numA - numB
  })
  
  // 写入文件
  await fs.writeFile(INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8')
  
  console.log(`\x1b[32m[SUCCESS]\x1b[0m Generated ${index.length} items to src/utils/questionIndex.json`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})