# AI 助教对话质量优化建议

基于用户与 AI 助手的实际对话记录分析，发现以下问题并提出优化建议。

## 问题分析

### 1. 闲聊场景被错误路由到 page_grounded

**问题表现：**
```
用户：你好
AI: [显示 Q1,2,3 段落 A、B、C 等 meta 信息，并给出不相关的茶历史内容]

用户：今天天气怎么样？
AI: [显示 Q1,2 段落 A、B，给出词汇解释而非天气回答]

用户：时间不够怎么办
AI: [直接返回默认欢迎语，没有任何帮助]
```

**根本原因：**

1. **Router 规则过于严格** - `router.ts:54-58` 只匹配纯问候语，但混合查询（如"你好，第 1 题怎么做"）会被识别为 page_grounded
2. **缺少多轮对话历史感知** - 当用户在前一轮问完题目后发送"你好"，系统仍尝试绑定到之前的题目上下文
3. **闲聊响应没有禁用 meta 信息展示** - `PracticeAssistant.vue:56` 对所有响应类型都显示 Q 号和段落标签

**优化方案：**

```typescript
// router.ts - 增强闲聊检测
function isPureSocial(query: string, locale: 'zh' | 'en'): boolean {
  const normalized = normalizeTrailingQuestionMarks(query.trim())
  
  // 多轮对话中的重置信号 - 前面有 grounded 对话历史时，单独的问候语应该视为新对话开始
  if (normalized.match(/^(你好 | 嗨|hello|hi)[，,.!?]?$/)) {
    return true
  }
  
  // 扩展闲聊关键词
  const socialPatterns = [
    /^(你好吗 | 怎么样 | 吃了吗 | 在干嘛 | 忙吗 | 最近如何 | 你叫什么 | 你是谁)/,
    /^(天气 | 几点了 | 现在几点 | 日期 | 星期)/,
  ]
  
  for (const pattern of socialPatterns) {
    if (pattern.test(normalized)) return true
  }
  
  return false
}

// service.ts - 闲聊场景返回空 meta 信息
if (intent.kind === 'social_or_smalltalk' || intent.kind === 'general_chat') {
  return {
    ...response,
    usedQuestionNumbers: [],    // 清空
    usedParagraphLabels: [],    // 清空
    confidence: 'high',         // 不需要显示置信度
    responseKind: 'social'      // 前端隐藏 meta chips
  }
}
```

---

### 2. 闲聊/通用问题显示题目元信息（用户体验差）

**问题表现：**
```
用户：你是谁？
AI: [显示 "Q1, 2, 3 段落 A、B、C 中等把握"] ← 不相关

用户：precaution 是什么意思
AI: [显示 "Q1, 2 段落 A、B"] ← 词汇问题不需要绑定题号
```

**根本原因：**

前端在 `PracticeAssistant.vue:56` 的条件判断没有排除 `chat` 和 `social` 类型：

```vue
<!-- 当前代码 -->
<div v-if="(message.usedQuestionNumbers?.length || ...) && !['chat', 'social', 'clarify', 'tool_result'].includes(message.responseKind || '')"
```

但实际上 `responseKind` 字段可能没有正确传递给前端。

**优化方案：**

```typescript
// service.ts - 确保 responseKind 正确传递
async *queryStream(request: AssistantQueryRequest): AsyncGenerator<...> {
  const route = await classifyRoute(request, locale)
  
  // 明确设置 responseKind
  const responseKind = route.route === 'unrelated_chat' ? 'social'
    : route.route === 'ielts_general' ? 'general'
    : 'grounded'
  
  yield { type: 'start', payload: { route: route.route, responseKind } }
  
  // ...
}

// 对于闲聊场景，强制清空题目绑定信息
if (route.route === 'unrelated_chat') {
  return {
    ...response,
    usedQuestionNumbers: [],
    usedParagraphLabels: [],
    responseKind: 'social'
  }
}
```

---

### 3. "时间不够怎么办" 返回默认欢迎语（无帮助性）

**问题表现：**
```
用户：时间不够怎么办
AI: 你好！我是 IELTS 阅读小助手。你可以问我具体题目...
```

**根本原因：**

1. **ielts_general 路由的本地模板没有覆盖时间管理问题** - `service.ts:170-171` 只匹配"速度 | 时间 | 快 | 慢"，但"时间不够怎么办"没有命中
2. **LLM 模式可能因为超时返回 fallback**

**优化方案：**

```typescript
// service.ts - 扩展时间管理关键词匹配
function getLocalIeltsCoachResponse(request: AssistantQueryRequest, locale: 'zh' | 'en'): string {
  const query = (request.userQuery || '').trim().toLowerCase()

  if (locale === 'zh') {
    // 扩展时间管理匹配
    if (/速度 | 时间 | 快 | 慢 | 不够 | 来不及 | 超时 | 分配/.test(query)) {
      return '提高雅思阅读速度的关键：1) 先读题干再扫读文章，定位关键词；2) 遇到难题先跳过，做完全部再回头；3) 平时练习要限时，培养时间感。一般建议：P1 用时 15-17 分钟，P2/P3 各 20-22 分钟。如果时间不够，优先做擅长题型。'
    }
    
    // 扩展词汇问题匹配
    if (/词汇 | 单词 | 同义替换 |  paraphrase|synonym/.test(query)) {
      return '积累 IELTS 阅读词汇的方法：1) 整理做题中遇到的同义替换，建立错题本；2) 按话题分类记忆（环境、科技、教育等）；3) 重点掌握题干和原文的对应表达。'
    }
  }
  
  // ...
}
```

---

### 4. 词汇/段落聚焦问题返回冗长回答

**问题表现：**
```
用户：precaution 是什么意思，在雅思考试中有哪些同义替换？
AI: [返回整段茶历史 + 完整解题思路]
```

**根本原因：**

`answerStyle` 分类器没有正确识别词汇问题，导致使用了 `full_tutoring` 而非 `vocab_paraphrase` 模式。

**优化方案：**

```typescript
// answerStyle.ts - 增强词汇问题识别
export function classifyAnswerStyle(request: AssistantQueryRequest, locale: 'zh' | 'en'): AnswerStyle {
  const query = (request.userQuery || '').trim().toLowerCase()
  
  // 词汇/释义问题识别
  const vocabPatterns = [
    /什么意思|是什么意思|meaning|mean|what is/i,
    /同义 | 替换|paraphrase|synonym/i,
    /precaution|词汇 | 单词|word/i
  ]
  
  if (vocabPatterns.some(p => p.test(query))) {
    return 'vocab_paraphrase'
  }
  
  // 段落聚焦问题识别
  const paragraphPatterns = [
    /段落 [A-H]|paragraph\s*[A-H]/i,
    /这段 | 那一段|which paragraph/i
  ]
  
  if (paragraphPatterns.some(p => p.test(query))) {
    return 'paragraph_focus'
  }
  
  return 'full_tutoring'
}

// prompt.ts - 针对 vocab_paraphrase 缩短输出
function answerStyleInstruction(style: AnswerStyle | undefined, locale: AssistantLocale): string {
  if (style === 'vocab_paraphrase') {
    return locale === 'zh'
      ? '词汇/同义替换问题：直接给 2-5 个替代词，加 1 个短例句。不超过 80 字。'
      : 'Vocabulary question: give 2-5 synonyms with one short example phrase. Keep under 60 words.'
  }
  if (style === 'paragraph_focus') {
    return locale === 'zh'
      ? '段落聚焦问题：用 1 句话概括段落主旨，可引用 3-8 个词的证据。不超过 100 字。'
      : 'Paragraph focus: one-sentence main idea plus one short evidence phrase (3-8 words). Under 80 words.'
  }
  return ''
}
```

---

### 5. 多轮对话中"第 12 题怎么做"错误绑定到之前的 Q1-3 上下文

**问题表现：**
```
用户：[在 A Brief History of Tea 文章中问第 1 题]
AI: [回答 Q1，绑定段落 A]

用户：第 12 题怎么做？
AI: [仍显示"Q1, 2, 3 段落 A、B、C"，但实际应该只关注 Q12]
```

**根本原因：**

`pickFocusQuestionNumbers` 函数在 `service.ts:1305-1373` 的逻辑问题：
1. 当用户明确问新题号时，没有正确重置 focusQuestionNumbers
2. `usedQuestionNumbers` 仍保留之前的题目范围

**优化方案：**

```typescript
// service.ts - 增强问题号提取优先级
function pickFocusQuestionNumbers(
  document: ParsedQuestionDocument,
  request: AssistantQueryRequest,
  intent?: IntentClassification
): string[] {
  const availableQuestionNumbers = new Set(document.questionChunks.flatMap(chunk => chunk.questionNumbers))

  // 【最高优先级】用户查询中明确提到的题号 - 覆盖历史继承
  const query = request.userQuery || ''
  const explicitInQuery = extractMentionedQuestionNumbersFromQuery(query, availableQuestionNumbers)
  if (explicitInQuery.length > 0) {
    return sortQuestionNumbers(explicitInQuery)
  }

  // 【次优先级】用户显式指定的 focusQuestionNumbers
  const explicit = request.focusQuestionNumbers?.filter(value => availableQuestionNumbers.has(value)) ?? []
  if (explicit.length > 0) {
    return sortQuestionNumbers(explicit)
  }

  // 【低优先级】从历史继承（仅当当前查询没有明确题号时）
  if (request.promptKind === 'followup' || intent?.kind === 'followup_request') {
    if (request.history && request.history.length > 0) {
      for (let i = request.history.length - 1; i >= 0; i--) {
        const historyItem = request.history[i]
        if (historyItem.role === 'user') {
          const historicalMentioned = extractMentionedQuestionNumbers(
            { ...request, userQuery: historyItem.content },
            availableQuestionNumbers
          )
          if (historicalMentioned.length > 0) {
            return historicalMentioned
          }
        }
      }
    }
  }

  return []
}

// 新增：专门从查询中提取题号的函数
function extractMentionedQuestionNumbersFromQuery(query: string, available: Set<string>): string[] {
  const matches = [
    ...Array.from(query.matchAll(/\b(?:question|questions|q)\s*(\d{1,3})\b/gi)).map(m => m[1]),
    ...Array.from(query.matchAll(/\u7B2C\s*(\d{1,3})\s*\u9898/g)).map(m => m[1]),
    ...Array.from(query.matchAll(/(?:^|[^\d])(\d{1,3})\s*\u9898/g)).map(m => m[1])
  ].filter(value => available.has(value))
  
  return sortQuestionNumbers(uniqueValues(matches))
}
```

---

### 6. 闲聊场景没有引导回学习

**问题表现：**
```
用户：你好
AI: 你好！我是 IELTS 阅读小助手。你可以问我具体题目...
[没有后续引导]
```

**优化方案：**

```typescript
// prompt.ts - buildGeneralChatPromptMinimal 增加引导
export function buildGeneralChatPromptMinimal(request: AssistantQueryRequest, locale: 'zh' | 'en') {
  const query = (request.userQuery || '').trim()
  
  const system = compactMultiline([
    'You are a friendly conversational assistant for IELTS learners.',
    'Respond warmly to off-topic queries.',
    'Keep responses brief: 60-120 Chinese characters.',
    'When appropriate, gently guide back to IELTS learning with 1-2 specific suggestions.',
    'End with an optional follow-up question about their study goals.',
    locale === 'zh' ? '请用简体中文回答。' : 'Respond in English.'
  ].join('\n'))

  const user = compactMultiline([
    `User query: ${query}`,
    request.recentPractice?.length
      ? `Recent practice: ${request.recentPractice.slice(0, 2).map(p => `${p.category} - ${p.accuracy}正确率`).join(', ')}`
      : ''
  ].filter(Boolean).join('\n'))

  return { system, user }
}
```

**期望输出示例：**
```
你好！我是 IELTS 阅读小助手 👋 

看你最近在练习《A Brief History of Tea》这篇文章，正确率还不错！

有什么我可以帮你的吗？比如：
- 某道具体的题目怎么做？
- 某个段落的主旨是什么？
- 某个词的同义替换有哪些？
```

---

## 优化优先级

| 优先级 | 问题 | 影响 | 实施难度 |
|--------|------|------|----------|
| P0 | 闲聊显示题目元信息 | 用户体验差，困惑 | 低 |
| P0 | "时间不够"返回欢迎语 | 无帮助性 | 低 |
| P1 | 闲聊错误路由到 page_grounded | 资源浪费，响应慢 | 中 |
| P1 | 词汇问题返回冗长回答 | 信息过载 | 中 |
| P2 | 多轮对话题号继承错误 | 答案不准确 | 中 |
| P2 | 闲聊缺少学习引导 | 转化率降低 | 低 |

## 验证方法

1. **单元测试**：为 router、answerStyle、intent 分类添加测试用例
2. **E2E 测试**：使用对话记录中的真实 query 进行测试
3. **A/B 测试**：对比优化前后的用户满意度

## 相关文件

- `server/src/lib/assistant/router.ts` - 路由分类逻辑
- `server/src/lib/assistant/service.ts` - 响应生成和 meta 信息处理
- `server/src/lib/assistant/prompt.ts` - Prompt 构建
- `server/src/lib/assistant/answerStyle.ts` - 回答风格分类
- `src/components/PracticeAssistant.vue` - 前端 meta 信息展示逻辑
- `src/types/assistant.ts` - 响应类型定义
