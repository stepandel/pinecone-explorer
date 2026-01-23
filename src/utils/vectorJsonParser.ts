/**
 * Utility for parsing and validating vector JSON input
 * Supports single vectors and bulk vector arrays
 */

export type MetadataValueType = 'string' | 'number' | 'boolean' | 'string[]'

export interface MetadataField {
  key: string
  type: MetadataValueType
  value: string // String representation, parsed on save
}

export interface ParsedVector {
  id?: string
  metadata?: Record<string, unknown>
}

export interface ParseResult {
  success: boolean
  vectors?: ParsedVector[]
  error?: string
  errorPosition?: { line: number; column: number }
}

/**
 * Infer the Pinecone metadata type from a value
 */
export function inferMetadataType(value: unknown): MetadataValueType | null {
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return 'string[]'
  return null // Unsupported type
}

/**
 * Validate that a metadata value matches Pinecone's supported types
 */
export function isValidMetadataValue(value: unknown): boolean {
  return inferMetadataType(value) !== null
}

/**
 * Validate metadata object - all values must be supported types
 */
export function validateMetadata(
  metadata: Record<string, unknown>
): { valid: boolean; invalidKeys: string[] } {
  const invalidKeys: string[] = []

  for (const [key, value] of Object.entries(metadata)) {
    if (!isValidMetadataValue(value)) {
      invalidKeys.push(key)
    }
  }

  return { valid: invalidKeys.length === 0, invalidKeys }
}

/**
 * Parse JSON string into vector(s)
 * Supports:
 * - Single vector: { "id": "...", "metadata": { ... } }
 * - Array of vectors: [{ "id": "...", "metadata": { ... } }, ...]
 * - Just metadata: { "title": "...", "count": 5 } (no id field)
 */
export function parseVectorJson(json: string): ParseResult {
  let parsed: unknown

  try {
    parsed = JSON.parse(json)
  } catch (e) {
    const error = e as SyntaxError
    // Try to extract position from error message
    const match = error.message.match(/position (\d+)/)
    if (match) {
      const position = parseInt(match[1], 10)
      const lines = json.substring(0, position).split('\n')
      return {
        success: false,
        error: `JSON parse error: ${error.message}`,
        errorPosition: {
          line: lines.length,
          column: lines[lines.length - 1].length + 1,
        },
      }
    }
    return {
      success: false,
      error: `JSON parse error: ${error.message}`,
    }
  }

  // Handle array of vectors
  if (Array.isArray(parsed)) {
    const vectors: ParsedVector[] = []
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i]
      if (typeof item !== 'object' || item === null) {
        return {
          success: false,
          error: `Item at index ${i} is not an object`,
        }
      }

      const result = parseSingleVector(item as Record<string, unknown>, i)
      if (!result.success) {
        return result
      }
      vectors.push(result.vectors![0])
    }
    return { success: true, vectors }
  }

  // Handle single object
  if (typeof parsed === 'object' && parsed !== null) {
    return parseSingleVector(parsed as Record<string, unknown>)
  }

  return {
    success: false,
    error: 'JSON must be an object or array of objects',
  }
}

/**
 * Parse a single vector object
 */
function parseSingleVector(
  obj: Record<string, unknown>,
  index?: number
): ParseResult {
  const prefix = index !== undefined ? `Item ${index}: ` : ''

  // Check if this looks like a vector with id/metadata structure
  const hasId = 'id' in obj
  const hasMetadata = 'metadata' in obj
  const hasValues = 'values' in obj // Embedding values - we ignore these

  // If it has metadata field, treat as vector structure
  if (hasMetadata) {
    const metadata = obj.metadata
    if (metadata !== null && typeof metadata !== 'object') {
      return {
        success: false,
        error: `${prefix}metadata must be an object or null`,
      }
    }

    if (metadata !== null) {
      const validation = validateMetadata(metadata as Record<string, unknown>)
      if (!validation.valid) {
        return {
          success: false,
          error: `${prefix}Invalid metadata types for keys: ${validation.invalidKeys.join(', ')}. Pinecone supports: string, number, boolean, string[]`,
        }
      }
    }

    return {
      success: true,
      vectors: [
        {
          id: hasId && typeof obj.id === 'string' ? obj.id : undefined,
          metadata: metadata as Record<string, unknown> | undefined,
        },
      ],
    }
  }

  // If it has id but no metadata, treat as vector with just id
  if (hasId && !hasMetadata && !hasValues) {
    // Check if there are other keys that look like metadata
    const otherKeys = Object.keys(obj).filter((k) => k !== 'id')
    if (otherKeys.length > 0) {
      // Treat other keys as metadata
      const metadata: Record<string, unknown> = {}
      for (const key of otherKeys) {
        metadata[key] = obj[key]
      }

      const validation = validateMetadata(metadata)
      if (!validation.valid) {
        return {
          success: false,
          error: `${prefix}Invalid metadata types for keys: ${validation.invalidKeys.join(', ')}. Pinecone supports: string, number, boolean, string[]`,
        }
      }

      return {
        success: true,
        vectors: [
          {
            id: typeof obj.id === 'string' ? obj.id : undefined,
            metadata,
          },
        ],
      }
    }

    return {
      success: true,
      vectors: [{ id: typeof obj.id === 'string' ? obj.id : undefined }],
    }
  }

  // Treat the whole object as metadata (no id/metadata wrapper)
  const validation = validateMetadata(obj)
  if (!validation.valid) {
    return {
      success: false,
      error: `${prefix}Invalid metadata types for keys: ${validation.invalidKeys.join(', ')}. Pinecone supports: string, number, boolean, string[]`,
    }
  }

  return {
    success: true,
    vectors: [{ metadata: obj }],
  }
}

/**
 * Convert parsed metadata to MetadataField array for editing
 */
export function metadataToFields(
  metadata: Record<string, unknown>
): MetadataField[] {
  return Object.entries(metadata).map(([key, value]) => {
    const type = inferMetadataType(value) || 'string'
    let stringValue: string

    if (type === 'string[]') {
      stringValue = JSON.stringify(value)
    } else if (type === 'boolean') {
      stringValue = value ? 'true' : 'false'
    } else {
      stringValue = String(value)
    }

    return { key, type, value: stringValue }
  })
}

/**
 * Convert MetadataField array back to metadata object
 */
export function fieldsToMetadata(
  fields: MetadataField[]
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {}

  for (const field of fields) {
    if (!field.key.trim()) continue // Skip empty keys

    switch (field.type) {
      case 'string':
        metadata[field.key] = field.value
        break
      case 'number': {
        const num = parseFloat(field.value)
        metadata[field.key] = isNaN(num) ? 0 : num
        break
      }
      case 'boolean':
        metadata[field.key] = field.value.toLowerCase() === 'true'
        break
      case 'string[]':
        try {
          const arr = JSON.parse(field.value)
          if (Array.isArray(arr) && arr.every((v) => typeof v === 'string')) {
            metadata[field.key] = arr
          } else {
            // Try comma-separated
            metadata[field.key] = field.value.split(',').map((s) => s.trim())
          }
        } catch {
          // Treat as comma-separated
          metadata[field.key] = field.value.split(',').map((s) => s.trim())
        }
        break
    }
  }

  return metadata
}

/**
 * Parse a field value string to its typed value
 */
export function parseFieldValue(
  value: string,
  type: MetadataValueType
): unknown {
  switch (type) {
    case 'string':
      return value
    case 'number': {
      const num = parseFloat(value)
      return isNaN(num) ? 0 : num
    }
    case 'boolean':
      return value.toLowerCase() === 'true'
    case 'string[]':
      try {
        const arr = JSON.parse(value)
        if (Array.isArray(arr) && arr.every((v) => typeof v === 'string')) {
          return arr
        }
      } catch {
        // Fall through to comma-separated
      }
      return value.split(',').map((s) => s.trim())
  }
}
