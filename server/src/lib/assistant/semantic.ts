import { OpenAIEmbeddings } from '@langchain/openai'
import { env, hasAssistantSemanticSearchConfig } from '../../config/env.js'
import type { QuestionSummaryDoc, RagChunk } from '../../types/question-bank.js'
import { uniqueValues } from '../utils/text.js'
import { QdrantClient } from '../qdrant/client.js'

export interface ChunkSemanticSearchInput {
  questionId: string
  queryText: string
  limit: number
}

export interface SummarySemanticSearchInput {
  queryText: string
  limit: number
  excludeQuestionIds?: string[]
}

export interface AssistantSemanticSearch {
  searchChunks(input: ChunkSemanticSearchInput): Promise<RagChunk[]>
  searchSummaries(input: SummarySemanticSearchInput): Promise<QuestionSummaryDoc[]>
}

function buildQuestionFilter(questionId: string) {
  return {
    must: [
      {
        key: 'questionId',
        match: {
          value: questionId
        }
      }
    ]
  }
}

export class QdrantAssistantSemanticSearch implements AssistantSemanticSearch {
  private readonly embeddings: OpenAIEmbeddings
  private readonly client: QdrantClient

  constructor(
    embeddings: OpenAIEmbeddings = new OpenAIEmbeddings({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_EMBED_MODEL
    }),
    client: QdrantClient = new QdrantClient()
  ) {
    this.embeddings = embeddings
    this.client = client
  }

  async searchChunks(input: ChunkSemanticSearchInput): Promise<RagChunk[]> {
    const vector = await this.embeddings.embedQuery(input.queryText)
    const points = await this.client.searchPoints<RagChunk>(
      env.QDRANT_COLLECTION_CHUNKS,
      vector,
      buildQuestionFilter(input.questionId),
      input.limit
    )

    return uniqueValues(points.map((point) => point.payload))
  }

  async searchSummaries(input: SummarySemanticSearchInput): Promise<QuestionSummaryDoc[]> {
    const vector = await this.embeddings.embedQuery(input.queryText)
    const points = await this.client.searchPoints<QuestionSummaryDoc>(
      env.QDRANT_COLLECTION_SUMMARIES,
      vector,
      undefined,
      Math.max(input.limit * 2, input.limit)
    )

    const excluded = new Set(input.excludeQuestionIds ?? [])

    return uniqueValues(
      points
        .map((point) => point.payload)
        .filter((summary) => !excluded.has(summary.questionId))
        .slice(0, input.limit)
    )
  }
}

export function createAssistantSemanticSearch(): AssistantSemanticSearch | null {
  if (!hasAssistantSemanticSearchConfig()) {
    return null
  }

  return new QdrantAssistantSemanticSearch()
}
