import { useCallback } from 'react'
import { QueryScope, MetadataFilter, MetadataOperator } from '../../types/filters'
import { MetadataFilterRow } from './MetadataFilterRow'

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
}

const inputClassName = "h-6 text-[11px] py-0 px-1.5 rounded-md bg-black/[0.03] dark:bg-white/[0.05] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring/50"
const selectClassName = "h-6 text-[11px] px-1.5 rounded-md bg-black/[0.03] dark:bg-white/[0.05] focus:outline-none focus:ring-1 focus:ring-ring/50"
const buttonClassName = "h-6 px-2 text-[11px] rounded-md bg-black/[0.03] dark:bg-white/[0.05] hover:bg-black/[0.06] dark:hover:bg-white/[0.08]"
const inputStyle = { boxShadow: 'inset 0 0.5px 1px 0 rgb(0 0 0 / 0.03)' }

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
}: QueryToolbarProps) {
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

  // Handle key press in search/id inputs
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSearch()
    }
  }

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
          className={`w-36 ${selectClassName}`}
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
            onChange={(e) => onIdSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter vector ID to find similar..."
            className={`flex-1 ${inputClassName}`}
            style={inputStyle}
          />
        ) : (
          <input
            type="text"
            value={searchText}
            onChange={(e) => onSearchTextChange(e.target.value)}
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

        {/* Search button */}
        <button
          onClick={onSearch}
          disabled={isSearching || (scope === 'id' ? !idSearch.trim() : !searchText.trim())}
          className={`${buttonClassName} bg-[#007AFF]/10 text-[#007AFF] hover:bg-[#007AFF]/20 disabled:opacity-50 disabled:cursor-not-allowed`}
          style={inputStyle}
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
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

      {/* Error display */}
      {error && (
        <div className="px-2 py-1.5 text-[11px] text-destructive bg-destructive/10 rounded-md">
          {error}
        </div>
      )}

      {/* Metadata filters section */}
      <div className="space-y-2">
        {/* Filter rows */}
        {filters.map((filter) => (
          <MetadataFilterRow
            key={filter.id}
            filter={filter}
            availableFields={availableFields}
            fieldTypes={fieldTypes}
            onChange={handleFilterChange}
            onRemove={handleRemoveFilter}
          />
        ))}

        {/* Add filter button */}
        <button
          onClick={handleAddFilter}
          className={`${buttonClassName} text-muted-foreground`}
        >
          + Add Filter
        </button>
      </div>
    </div>
  )
}
