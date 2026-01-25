import { useMemo } from 'react'
import { LocalVectorRecord } from '../types/vectors'

interface MetadataAnalysis {
  metadataFields: string[]
  availableTextFields: string[]
  metadataFieldTypes: Record<string, 'string' | 'number' | 'boolean'>
}

/**
 * Single-pass metadata extraction from vectors.
 * Consolidates 3 separate O(n) passes into one for better performance
 * when dealing with large vector sets.
 */
export function useMetadataAnalysis(vectors: LocalVectorRecord[]): MetadataAnalysis {
  return useMemo(() => {
    const fields = new Set<string>()
    const textFields = new Set<string>()
    const types: Record<string, 'string' | 'number' | 'boolean'> = {}

    // Single pass through all vectors
    for (const vec of vectors) {
      if (!vec.metadata) continue

      for (const [key, value] of Object.entries(vec.metadata)) {
        fields.add(key)

        // Only set type on first encounter (preserves consistency)
        if (!(key in types)) {
          if (typeof value === 'number') types[key] = 'number'
          else if (typeof value === 'boolean') types[key] = 'boolean'
          else types[key] = 'string'
        }

        // Track string fields for text-based operations
        if (typeof value === 'string') {
          textFields.add(key)
        }
      }
    }

    return {
      metadataFields: Array.from(fields).sort(),
      availableTextFields: Array.from(textFields).sort(),
      metadataFieldTypes: types,
    }
  }, [vectors])
}
