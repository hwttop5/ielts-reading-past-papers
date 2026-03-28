import { OpenAIEmbeddings } from '@langchain/openai'
import { env, requireAssistantEnv } from '../config/env.js'
import { loadQuestionIndex, parseQuestionDocument } from '../lib/question-bank/index.js'
import { QdrantClient } from '../lib/qdrant/client.js'
import { chunkArray } from '../lib/utils/text.js'
import type { QuestionSummaryDoc, RagChunk, StoredVectorPoint } from '../types/question-bank.js'

function getLimit(): number | undefined {
  const limitArg = process.argv.find((value) => value.startsWith('--limit='))
  if (!limitArg) {
    return undefined
  }

  const parsed = Number(limitArg.split('=')[1])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

async function embedPayloads<TPayload extends RagChunk | QuestionSummaryDoc>(
  embeddings: OpenAIEmbeddings,
  payloads: TPayload[]
): Promise<StoredVectorPoint<TPayload>[]> {
  const vectors = await embeddings.embedDocuments(payloads.map((payload) => payload.content))
  return payloads.map((payload, index) => ({
    id: payload.id,
    vector: vectors[index],
    payload
  }))
}

async function upsertInBatches<TPayload extends RagChunk | QuestionSummaryDoc>(
  client: QdrantClient,
  collectionName: string,
  points: StoredVectorPoint<TPayload>[]
) {
  for (const batch of chunkArray(points, 64)) {
    await client.upsertPoints(collectionName, batch)
  }
}

async function main() {
  const assistantEnv = requireAssistantEnv()
  const embeddings = new OpenAIEmbeddings({
    apiKey: assistantEnv.OPENAI_API_KEY,
    model: env.OPENAI_EMBED_MODEL
  })
  const qdrant = new QdrantClient()
  const limit = getLimit()
  const questions = await loadQuestionIndex()
  const targetQuestions = limit ? questions.slice(0, limit) : questions

  const parsedDocuments = []
  for (const question of targetQuestions) {
    parsedDocuments.push(await parseQuestionDocument(question))
  }

  const allChunks = parsedDocuments.flatMap((document) => document.allChunks)
  const summaries = parsedDocuments.map((document) => document.summary)

  if (allChunks.length === 0 || summaries.length === 0) {
    throw new Error('No parsed chunks or summaries were produced by ingestion.')
  }

  const [chunkPoints, summaryPoints] = await Promise.all([
    embedPayloads(embeddings, allChunks),
    embedPayloads(embeddings, summaries)
  ])

  const vectorSize = chunkPoints[0]?.vector.length ?? summaryPoints[0]?.vector.length
  if (!vectorSize) {
    throw new Error('Embedding generation returned empty vectors.')
  }

  await qdrant.ensureCollection(env.QDRANT_COLLECTION_CHUNKS, vectorSize)
  await qdrant.ensureCollection(env.QDRANT_COLLECTION_SUMMARIES, vectorSize)

  await upsertInBatches(qdrant, env.QDRANT_COLLECTION_CHUNKS, chunkPoints)
  await upsertInBatches(qdrant, env.QDRANT_COLLECTION_SUMMARIES, summaryPoints)

  console.log(JSON.stringify({
    indexedQuestions: parsedDocuments.length,
    chunkPoints: chunkPoints.length,
    summaryPoints: summaryPoints.length
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
