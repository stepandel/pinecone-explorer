import { useCallback, useMemo, useEffect, useRef } from 'react'
import { QueryScope, MetadataFilter, MetadataOperator } from '../../types/filters'
import { MetadataFilterRow } from './MetadataFilterRow'
import { QUERY } from '../../constants/ui'
import { formStyles } from '../../styles/form-controls'

// Simple debounce function
function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const debounced = ((...args: unknown[]) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), ms)
  }) as T & { cancel: () => void }

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  return debounced
}

// Reranking model types
type RerankModel = 'bge-reranker-v2-m3' | 'pinecone-rerank-v0' | 'cohere-rerank-3.5'

interface QueryToolbarProps {
  // Query state
  scope: QueryScope
  searchText: string
  idSearch: string
  topK: number
  filters: MetadataFilter[]
  // Namespace info
  currentNamespace?: string
  // Metadata fields available for filtering
  availableFields: string[]
  fieldTypes: Record<string, 'string' | 'number' | 'boolean'>
  // Callbacks
  onScopeChange: (scope: QueryScope) => void
  onSearchTextChange: (text: string) => void
  onIdSearchChange: (id: string) => void
  onTopKChange: (topK: number) => void
  onFiltersChange: (filters: MetadataFilter[]) => void
  onSearch: () => void
  // Loading/error state
  isSearching?: boolean
  error?: string | null
  // Hybrid search support
  isHybridEnabled?: boolean
  alpha?: number
  onAlphaChange?: (alpha: number) => void
  // Reranking support
  rerankEnabled?: boolean
  rerankModel?: RerankModel
  rerankField?: string
  rerankTopN?: number
  onRerankEnabledChange?: (enabled: boolean) => void
  onRerankModelChange?: (model: RerankModel) => void
  onRerankFieldChange?: (field: string) => void
  onRerankTopNChange?: (topN: number | undefined) => void
  // Text fields for reranking (string-type metadata fields)
  textFields?: string[]
}

const inputClassName = formStyles.input
const selectClassName = formStyles.select
const buttonClassName = formStyles.button
const inputStyle = formStyles.inputShadow

export function QueryToolbar({
  scope,
  searchText,
  idSearch,
  topK,
  filters,
  currentNamespace,
  availableFields,
  fieldTypes,
  onScopeChange,
  onSearchTextChange,
  onIdSearchChange,
  onTopKChange,
  onFiltersChange,
  onSearch,
  isSearching,
  error,
  isHybridEnabled,
  alpha = 0.5,
  onAlphaChange,
  rerankEnabled = false,
  rerankModel = 'bge-reranker-v2-m3',
  rerankField = '',
  rerankTopN,
  onRerankEnabledChange,
  onRerankModelChange,
  onRerankFieldChange,
  onRerankTopNChange,
  textFields = [],
}: QueryToolbarProps) {
  // Create debounced search function (300ms delay)
  const debouncedSearchRef = useRef<ReturnType<typeof debounce> | null>(null)

  // Initialize debounced search
  useEffect(() => {
    debouncedSearchRef.current = debounce(() => onSearch(), QUERY.DEBOUNCE_SEARCH)
    return () => {
      debouncedSearchRef.current?.cancel()
    }
  }, [onSearch])

  // Trigger debounced search on text/id changes (auto-search with debouncing)
  const triggerDebouncedSearch = useCallback(() => {
    debouncedSearchRef.current?.()
  }, [])

  // Handle filter changes
  const handleFilterChange = useCallback((id: string, updates: Partial<MetadataFilter>) => {
    onFiltersChange(
      filters.map(f => f.id === id ? { ...f, ...updates } : f)
    )
  }, [filters, onFiltersChange])

  // Add new filter
  const handleAddFilter = useCallback(() => {
    const newFilter: MetadataFilter = {
      id: crypto.randomUUID(),
      field: availableFields[0] || '',
      operator: '$eq',
      value: '',
    }
    onFiltersChange([...filters, newFilter])
  }, [filters, availableFields, onFiltersChange])

  // Remove filter
  const handleRemoveFilter = useCallback((id: string) => {
    onFiltersChange(filters.filter(f => f.id !== id))
  }, [filters, onFiltersChange])

  // Handle key press in search/id inputs (immediate search on Enter)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      // Cancel any pending debounced search and execute immediately
      debouncedSearchRef.current?.cancel()
      onSearch()
    }
  }

  // Handle search text change with debounced auto-search
  const handleSearchTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchTextChange(e.target.value)
    triggerDebouncedSearch()
  }, [onSearchTextChange, triggerDebouncedSearch])

  // Handle ID search change with debounced auto-search
  const handleIdSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onIdSearchChange(e.target.value)
    triggerDebouncedSearch()
  }, [onIdSearchChange, triggerDebouncedSearch])

  // Get scope label for dropdown
  const getScopeLabel = (s: QueryScope): string => {
    switch (s) {
      case 'namespace': return 'Text Query'
      case 'id': return 'Find Similar'
    }
  }

  return (
    <div className="space-y-2">
      {/* Main query row */}
      <div className="flex gap-2 items-center w-full">
        {/* Scope selector */}
        <select
          value={scope}
          onChange={(e) => onScopeChange(e.target.value as QueryScope)}
          className={`w-28 ${selectClassName}`}
          style={inputStyle}
        >
          <option value="namespace">{getScopeLabel('namespace')}</option>
          <option value="id">{getScopeLabel('id')}</option>
        </select>

        {/* Search/ID input based on scope */}
        {scope === 'id' ? (
          <input
            type="text"
            value={idSearch}
            onChange={handleIdSearchChange}
            onKeyDown={handleKeyDown}
            placeholder="Enter vector ID to find similar..."
            className={`flex-1 ${inputClassName}`}
            style={inputStyle}
          />
        ) : (
          <input
            type="text"
            value={searchText}
            onChange={handleSearchTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Search query..."
            className={`flex-1 ${inputClassName}`}
            style={inputStyle}
          />
        )}

        {/* Limit selector */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Limit:</span>
          <select
            value={topK.toString()}
            onChange={(e) => onTopKChange(parseInt(e.target.value, 10))}
            className={selectClassName}
            style={inputStyle}
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="300">300</option>
            <option value="500">500</option>
          </select>
        </div>

        {/* Rerank toggle - inline on main row for namespace scope */}
        {scope === 'namespace' && (
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={rerankEnabled}
              onChange={(e) => onRerankEnabledChange?.(e.target.checked)}
              className="w-3 h-3 rounded border-black/20 dark:border-white/20 text-[#007AFF] focus:ring-[#007AFF]/50"
            />
            <span className="text-[11px] text-muted-foreground">Rerank</span>
          </label>
        )}

        {/* Add filter button - inline on main row, hidden when filters exist */}
        {filters.length === 0 && (
          <button
            onClick={handleAddFilter}
            className={`${buttonClassName} text-muted-foreground`}
          >
            + Filter
          </button>
        )}
      </div>

      {/* Hybrid search alpha slider */}
      {isHybridEnabled && scope !== 'id' && (
        <div className="flex items-center gap-2 px-1">
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">Keyword</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={alpha}
            onChange={(e) => onAlphaChange?.(parseFloat(e.target.value))}
            className="flex-1 h-1 bg-black/[0.1] dark:bg-white/[0.1] rounded-lg appearance-none cursor-pointer accent-[#007AFF]"
            style={{ maxWidth: '120px' }}
          />
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">Semantic</span>
          <span className="text-[11px] text-muted-foreground/70 ml-1 tabular-nums">{alpha.toFixed(1)}</span>
        </div>
      )}

      {/* Reranking options row - shown when rerank is enabled */}
      {scope === 'namespace' && rerankEnabled && (
        <div className="flex items-center gap-3 px-1">
          {/* Model selector */}
          <select
            value={rerankModel}
            onChange={(e) => onRerankModelChange?.(e.target.value as RerankModel)}
            className={selectClassName}
            style={inputStyle}
            title="Reranking model"
          >
            <option value="bge-reranker-v2-m3">BGE Reranker v2 (Free)</option>
            <option value="pinecone-rerank-v0">Pinecone Rerank</option>
            <option value="cohere-rerank-3.5">Cohere Rerank 3.5</option>
          </select>

          {/* Rank field selector */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">Field:</span>
            <select
              value={rerankField}
              onChange={(e) => onRerankFieldChange?.(e.target.value)}
              className={selectClassName}
              style={inputStyle}
              title="Metadata field containing text to rerank on"
            >
              {textFields.length === 0 ? (
                <option value="">No text fields</option>
              ) : (
                textFields.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="px-2 py-1.5 text-[11px] text-destructive bg-destructive/10 rounded-md">
          {error}
        </div>
      )}

      {/* Metadata filter rows */}
      {filters.length > 0 && (
        <div className="space-y-2">
          {filters.map((filter, index) => (
            <MetadataFilterRow
              key={filter.id}
              filter={filter}
              availableFields={availableFields}
              fieldTypes={fieldTypes}
              onChange={handleFilterChange}
              onRemove={handleRemoveFilter}
              onAdd={handleAddFilter}
              onSearch={onSearch}
              isLast={index === filters.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
