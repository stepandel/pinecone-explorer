import { useState, useMemo } from 'react'
import { DocumentFilters, MetadataFilter, MetadataOperator } from '../types/filters'

export interface UseDocumentFiltersReturn {
  filters: DocumentFilters
  setQueryText: (text: string) => void
  setNResults: (n: number) => void
  addMetadataFilter: (key: string, operator: MetadataOperator, value: string) => void
  removeMetadataFilter: (id: string) => void
  clearAllFilters: () => void
  hasActiveFilters: boolean
  buildSearchParams: (indexName: string, namespace?: string) => QueryVectorsParams
}

const initialFilters: DocumentFilters = {
  queryText: '',
  nResults: 10,
  metadataFilters: [],
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function inferValueType(value: string): unknown {
  return inferSingleValue(value)
}

function inferSingleValue(value: string): unknown {
  // Check for boolean
  if (value === 'true') return true
  if (value === 'false') return false

  // Check for number
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return parseFloat(value)
  }

  // Default to string
  return value
}

function buildFilterClause(metadataFilters: MetadataFilter[]): Record<string, unknown> | undefined {
  if (metadataFilters.length === 0) return undefined

  if (metadataFilters.length === 1) {
    const filter = metadataFilters[0]
    return {
      [filter.key]: {
        [filter.operator]: inferValueType(filter.value),
      },
    }
  }

  // Multiple filters - combine with $and
  return {
    $and: metadataFilters.map((filter) => ({
      [filter.key]: {
        [filter.operator]: inferValueType(filter.value),
      },
    })),
  }
}

export function useDocumentFilters(): UseDocumentFiltersReturn {
  const [filters, setFilters] = useState<DocumentFilters>(initialFilters)

  const setQueryText = (text: string) => {
    setFilters((prev) => ({ ...prev, queryText: text }))
  }

  const setNResults = (n: number) => {
    setFilters((prev) => ({ ...prev, nResults: n }))
  }

  const addMetadataFilter = (key: string, operator: MetadataOperator, value: string) => {
    if (!key.trim() || !value.trim()) return

    const newFilter: MetadataFilter = {
      id: generateId(),
      key: key.trim(),
      operator,
      value: value.trim(),
    }

    setFilters((prev) => ({
      ...prev,
      metadataFilters: [...prev.metadataFilters, newFilter],
    }))
  }

  const removeMetadataFilter = (id: string) => {
    setFilters((prev) => ({
      ...prev,
      metadataFilters: prev.metadataFilters.filter((f) => f.id !== id),
    }))
  }

  const clearAllFilters = () => {
    setFilters(initialFilters)
  }

  const hasActiveFilters = useMemo(() => {
    return filters.queryText.trim() !== '' || filters.metadataFilters.length > 0
  }, [filters])

  const buildSearchParams = (indexName: string, namespace?: string): QueryVectorsParams => {
    const params: QueryVectorsParams = {
      indexName,
      namespace,
      includeValues: true,
      includeMetadata: true,
    }

    // Add query text if present
    if (filters.queryText.trim() !== '') {
      params.queryText = filters.queryText.trim()
      params.topK = filters.nResults
    }

    // Add metadata filter if present
    const filterClause = buildFilterClause(filters.metadataFilters)
    if (filterClause) {
      params.filter = filterClause
    }

    return params
  }

  return {
    filters,
    setQueryText,
    setNResults,
    addMetadataFilter,
    removeMetadataFilter,
    clearAllFilters,
    hasActiveFilters,
    buildSearchParams,
  }
}
