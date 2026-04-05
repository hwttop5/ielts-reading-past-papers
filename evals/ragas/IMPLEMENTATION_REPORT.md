# 向量检索与评估体系升级计划 - 实施完成报告

## 执行摘要

本计划已成功完成 Phase 1 (Ragas 评估框架) 和 Phase 2 (向量库抽象层) 的所有核心功能开发。

## Phase 1: Ragas 评估框架 ✅

### 已完成内容

#### 1. 目录结构
```
evals/ragas/
├── datasets/           # 评估数据集
│   └── golden_samples.json
├── experiments/        # A/B 测试实验结果
├── reports/            # 评估报告输出
├── evaluator.py        # 核心评估逻辑
├── run_eval.py         # 评估执行脚本
├── requirements.txt    # Python 依赖
└── README.md          # 使用文档
```

#### 2. 黄金数据集 (`golden_samples.json`)
包含 10 个代表性评估样本，覆盖以下场景：
- `hint_single_question`: 单题提示请求
- `explain_single_question`: 单题讲解请求
- `review_mistake_analysis`: 错题分析请求
- `vocab_paraphrase`: 词汇同义替换请求
- `paragraph_focus_content`: 段落内容查询
- `social_greeting_zh/en`: 中英问候语
- `upload_question`: 文件上传问题
- `weather_question`: 无关问题（天气）
- `explain_with_focus`: 带焦点的讲解请求

#### 3. 自定义指标
- **`question_hit_rate`**: 检索命中率 - 查询是否命中正确证据
- **`noise_penalty`**: 噪声惩罚 - 检索结果中无关内容的比例

#### 4. Ragas 集成指标
- `context_precision`: 上下文精度
- `context_recall`: 上下文召回率
- `faithfulness`: 忠实度
- `answer_similarity`: 答案相似度

#### 5. NPM 脚本
```json
"eval:rag": "cd ../evals/ragas && python run_eval.py --all"
"eval:rag:retrieval": "cd ../evals/ragas && python run_eval.py --retrieval"
"eval:rag:answer": "cd ../evals/ragas && python run_eval.py --answers"
```

### 使用方法

```bash
# 安装 Python 依赖
cd evals/ragas
pip install -r requirements.txt

# 运行完整评估
npm run eval:rag

# 仅评估检索质量
npm run eval:rag:retrieval

# 仅评估答案质量
npm run eval:rag:answer
```

---

## Phase 2: 向量库抽象层 ✅

### 已完成内容

#### 1.  provider 接口定义
文件：`server/src/lib/assistant/retrieval/provider.ts`

定义统一的 `VectorStoreProvider` 接口：
- `searchChunks()`: 检索题目块
- `searchSummaries()`: 检索题目摘要
- `upsertChunks()`: 批量插入题目块
- `upsertSummaries()`: 批量插入摘要
- `ensureCollections()`: 确保集合存在
- `getCollectionMetadata()`: 获取集合元数据
- `deleteCollection()`: 删除集合
- `countDocuments()`: 统计文档数
- `healthCheck()`: 健康检查

#### 2. Qdrant 实现
文件：`server/src/lib/assistant/retrieval/qdrant.ts`

- 实现 `VectorStoreProvider` 接口
- 保留现有 Qdrant 功能
- 添加类型注解修复 TypeScript 错误

#### 3. Chroma 实现
文件：`server/src/lib/assistant/retrieval/chroma.ts`

- 实现 `VectorStoreProvider` 接口
- 使用动态导入 (`import('chromadb')`) 避免硬依赖
- 支持 Chroma 的所有核心功能

#### 4. Provider 工厂
文件：`server/src/lib/assistant/retrieval/index.ts`

```typescript
export function getVectorStoreProvider(): VectorStoreProvider | null
```

根据 `ASSISTANT_VECTOR_BACKEND` 配置自动选择 provider。

#### 5. 环境变量配置
文件：`server/src/config/env.ts`

新增配置项：
- `ASSISTANT_VECTOR_BACKEND`: `'qdrant' | 'chroma'` (默认：`'qdrant'`)
- `CHROMA_HOST`: Chroma 服务器地址 (使用 Chroma 时必需)

#### 6. A/B 比较脚本
文件：`server/src/scripts/compare-vector-backends.ts`

比较维度：
- 平均延迟 (avg latency)
- P95 延迟
- 错误率
- 平均结果数量

使用方法：
```bash
npm run compare:backends -- --backend=qdrant chroma
```

### 配置示例

#### 使用 Qdrant (默认)
```env
# server/.env
OPENAI_API_KEY=sk-...
QDRANT_URL=https://your-qdrant-instance.com
QDRANT_API_KEY=your-api-key  # 可选
ASSISTANT_VECTOR_BACKEND=qdrant
```

#### 使用 Chroma
```env
# server/.env
OPENAI_API_KEY=sk-...
CHROMA_HOST=http://localhost:8000
ASSISTANT_VECTOR_BACKEND=chroma
```

---

## 测试状态

✅ TypeScript 编译通过 (0 errors)
✅ 所有 66 个现有测试通过
✅ 向后兼容性保持

---

## 文件清单

### 新增文件
- `evals/ragas/datasets/golden_samples.json`
- `evals/ragas/evaluator.py`
- `evals/ragas/run_eval.py`
- `evals/ragas/requirements.txt`
- `evals/ragas/README.md`
- `server/src/lib/assistant/retrieval/provider.ts`
- `server/src/lib/assistant/retrieval/qdrant.ts`
- `server/src/lib/assistant/retrieval/chroma.ts`
- `server/src/lib/assistant/retrieval/index.ts`
- `server/src/scripts/compare-vector-backends.ts`

### 修改文件
- `server/src/config/env.ts` - 新增向量后端配置
- `server/src/lib/assistant/semantic.ts` - 重构为 provider 包装器
- `server/package.json` - 新增评估脚本和 chromadb 可选依赖

---

## 下一步建议

### 立即可做
1. 安装 ChromaDB (可选): `npm install chromadb`
2. 配置 `.env` 文件添加 `ASSISTANT_VECTOR_BACKEND` 变量
3. 运行 Ragas 基线评估建立性能基准

### 后续优化
1. 扩展 golden dataset 覆盖更多题型和边缘情况
2. 实现 hybrid search (Chroma 优势功能)
3. 添加 retrieval cache 命中率指标
4. 将 Ragas 评估集成到 CI/CD 流程

---

## 关键设计决策

### 1. Ragas 作为独立 Python 项目
- 不污染 Node.js 运行时依赖
- 可使用 uv/pip 管理 Python 包
- 评估结果输出到固定目录

### 2. Provider 接口抽象
- 保持现有 API 不变
- Qdrant 和 Chroma 可无缝切换
- 便于未来添加其他向量库 (如 Pinecone, Weaviate)

### 3. Chroma 作为可选依赖
- 不使用 hard require 避免导入错误
- 在 `package.json` 中声明为 `optionalDependencies`
- 动态导入时提供清晰的错误信息

### 4. 向后兼容
- 保留 `AssistantSemanticSearch` 接口 (标记为 deprecated)
- 现有代码无需修改即可工作
- 新代码可使用 `VectorStoreProvider` 获取高级功能
