/**
 * Vector Store Provider Interface for AI Assistant
 *
 * This module defines the abstraction layer for vector storage backends.
 * Multiple providers (Qdrant, Chroma, etc.) can implement this interface.
 */

import type { QuestionSummaryDoc, RagChunk, StoredVectorPoint } from '../../../types/question-bank.js'

/**
 * Input for chunk semantic search
 */
export interface ChunkSemanticSearchInput {
  questionId: string
  queryText: string
  limit: number
}

/**
 * Input for summary semantic search
 */
export interface SummarySemanticSearchInput {
  queryText: string
  limit: number
  excludeQuestionIds?: string[]
}

/**
 * Input for bulk upsert operations
 */
export interface UpsertInput<TPayload> {
  points: StoredVectorPoint<TPayload>[]
}

/**
 * Collection metadata
 */
export interface CollectionMetadata {
  name: string
  vectorSize: number
  documentCount?: number
}

/**
 * Vector store provider interface
 *
 * All vector backends (Qdrant, Chroma, etc.) must implement this interface.
 */
export interface VectorStoreProvider {
  /**
   * Provider name for identification
   */
  readonly providerName: string

  /**
   * Search for chunks by vector similarity
   */
  searchChunks(input: ChunkSemanticSearchInput): Promise<RagChunk[]>

  /**
   * Search for summaries by vector similarity
   */
  searchSummaries(input: SummarySemanticSearchInput): Promise<QuestionSummaryDoc[]>

  /**
   * Bulk upsert chunks into the vector store
   */
  upsertChunks(points: StoredVectorPoint<RagChunk>[]): Promise<void>

  /**
   * Bulk upsert summaries into the vector store
   */
  upsertSummaries(points: StoredVectorPoint<QuestionSummaryDoc>[]): Promise<void>

  /**
   * Ensure collections exist with proper schema
   */
  ensureCollections(): Promise<void>

  /**
   * Get collection metadata
   */
  getCollectionMetadata(name: string): Promise<CollectionMetadata | null>

  /**
   * Delete a collection (for testing/maintenance)
   */
  deleteCollection(name: string): Promise<void>

  /**
   * Count documents in a collection
   */
  countDocuments(collectionName: string): Promise<number>

  /**
   * Health check
   */
  healthCheck(): Promise<{ healthy: boolean; latency_ms?: number; error?: string }>
}

/**
 * Provider factory function type
 */
export type VectorStoreProviderFactory = () => VectorStoreProvider | null
