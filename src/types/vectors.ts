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

/**
 * Parse a filter value based on operator type.
 * Handles array operators ($in, $nin) and numeric comparisons.
 */
export function parseFilterValue(
  value: string,
  operator: string
): string | number | string[] | number[] {
  const trimmed = value.trim()

  // Handle array operators ($in, $nin)
  if (operator === '$in' || operator === '$nin') {
    const items = trimmed.split(',').map(s => s.trim()).filter(Boolean)
    // Try to parse as numbers if all items are numeric
    const asNumbers = items.map(Number)
    if (asNumbers.every(n => !isNaN(n))) {
      return asNumbers
    }
    return items
  }

  // For comparison operators, try to parse as number
  if (['$gt', '$gte', '$lt', '$lte'].includes(operator)) {
    const num = Number(trimmed)
    if (!isNaN(num)) {
      return num
    }
  }

  // For equality operators, try number first, fall back to string
  if (operator === '$eq' || operator === '$ne') {
    const num = Number(trimmed)
    if (!isNaN(num) && trimmed !== '') {
      return num
    }
  }

  return trimmed
}
