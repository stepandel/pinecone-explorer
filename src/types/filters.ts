// Query scope types
export type QueryScope = 'namespace' | 'id'

// Metadata filter operators (per Pinecone docs)
export type MetadataOperator =
  | '$eq' | '$ne'           // Equality (string, number, boolean)
  | '$gt' | '$gte' | '$lt' | '$lte'  // Numeric comparison
  | '$in' | '$nin'          // Array membership
  | '$exists'               // Field existence

// A single metadata filter condition
export interface MetadataFilter {
  id: string
  field: string
  operator: MetadataOperator
  value: string  // Raw string input, parsed based on operator/field type
}

// Query state for the toolbar
export interface QueryState {
  scope: QueryScope
  searchText: string
  idSearch: string
  topK: number
  filters: MetadataFilter[]
}

// Legacy filter row types (kept for backwards compatibility during migration)
export type FilterRowType = 'search' | 'select'

export interface FilterRow {
  id: string
  type: FilterRowType
  // For search type
  searchValue?: string
  // For select type (ID filtering)
  selectField?: 'id'
  selectValue?: string
}

// Helper to get operator label for display
export function getOperatorLabel(operator: MetadataOperator): string {
  switch (operator) {
    case '$eq': return '='
    case '$ne': return '!='
    case '$gt': return '>'
    case '$gte': return '>='
    case '$lt': return '<'
    case '$lte': return '<='
    case '$in': return 'in'
    case '$nin': return 'not in'
    case '$exists': return 'exists'
  }
}

// Helper to get operators available for a given value type
export function getOperatorsForType(
  valueType: 'string' | 'number' | 'boolean' | 'unknown'
): MetadataOperator[] {
  switch (valueType) {
    case 'number':
      return ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$exists']
    case 'boolean':
      return ['$eq', '$ne', '$exists']
    case 'string':
    default:
      return ['$eq', '$ne', '$in', '$nin', '$exists']
  }
}

// Build Pinecone filter object from MetadataFilter array
export function buildPineconeFilter(
  filters: MetadataFilter[],
  fieldTypes?: Record<string, 'string' | 'number' | 'boolean'>
): Record<string, unknown> | undefined {
  if (filters.length === 0) return undefined

  const filterClauses = filters
    .filter(f => f.field.trim() && f.value.trim())
    .map(f => {
      const fieldType = fieldTypes?.[f.field]
      const value = parseFilterValue(f.value, f.operator, fieldType)
      return { [f.field]: { [f.operator]: value } }
    })

  if (filterClauses.length === 0) return undefined
  if (filterClauses.length === 1) return filterClauses[0]
  return { $and: filterClauses }
}

// Parse filter value based on operator and known field type
function parseFilterValue(
  value: string,
  operator: MetadataOperator,
  fieldType?: 'string' | 'number' | 'boolean'
): unknown {
  if (operator === '$exists') {
    return value.toLowerCase() === 'true'
  }
  if (operator === '$in' || operator === '$nin') {
    return value.split(',').map(v => inferType(v.trim(), fieldType))
  }
  return inferType(value, fieldType)
}

// Infer primitive type from string value
// If fieldType is known, use it to guide parsing (prevents incorrect type coercion)
function inferType(value: string, fieldType?: 'string' | 'number' | 'boolean'): string | number | boolean {
  // If we know the field type, respect it
  if (fieldType === 'string') {
    return value
  }
  if (fieldType === 'number') {
    const num = Number(value)
    return !isNaN(num) ? num : value
  }
  if (fieldType === 'boolean') {
    if (value.toLowerCase() === 'true') return true
    if (value.toLowerCase() === 'false') return false
    return value
  }

  // Unknown field type - auto-infer (original behavior)
  if (value.toLowerCase() === 'true') return true
  if (value.toLowerCase() === 'false') return false
  const num = Number(value)
  if (!isNaN(num) && value !== '') return num
  return value
}
