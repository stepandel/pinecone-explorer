import { TypedMetadataRecord } from './metadata'

/**
 * Local vector record for display in the UI.
 * Maps from API's `values` to `embedding` for clearer semantics.
 */
export interface LocalVectorRecord {
  id: string
  metadata: Record<string, unknown> | null
  embedding: number[] | null
  /** Sparse embedding values (for sparse or hybrid indexes) */
  sparseEmbedding?: { indices: number[]; values: number[] } | null
  /** Distance/score from semantic search results */
  distance?: number | null
}

/**
 * Draft vector being created or pasted.
 * Uses typed metadata for validation before save.
 */
export interface DraftVector {
  id: string
  metadata: TypedMetadataRecord
}

/**
 * Editing state for inline vector editing in the table.
 */
export interface EditingState {
  vectorId: string
  metadata: Record<string, unknown>
}
