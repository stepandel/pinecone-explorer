import { useMemo, useRef, useEffect, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  ColumnDef,
  flexRender,
  HeaderGroup,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { LocalVectorRecord, DraftVector } from '../../types/vectors'
import { useTableSelection } from '../../hooks/useTableSelection'
import { useInlineEditing } from '../../hooks/useInlineEditing'
import { usePanel } from '../../context/PanelContext'
import { RegenerateEmbeddingDialog } from './RegenerateEmbeddingDialog'
import { EmbeddingFieldRequiredDialog } from './EmbeddingFieldRequiredDialog'
import { VIRTUALIZATION } from '../../constants/ui'

// Format score/distance for display - handles very small reranking scores
function formatScore(score: number): string {
  if (score === 0) return '0'
  // For very small numbers (< 0.001), use scientific notation
  if (Math.abs(score) < 0.001) {
    return score.toExponential(1)
  }
  // For normal numbers, use 3 decimal places
  return score.toFixed(3)
}

interface VectorsTableProps {
  vectors: LocalVectorRecord[]
  loading: boolean
  error: string | null
  hasActiveFilters?: boolean
  selectedVectorIds: Set<string>
  selectionAnchor: string | null
  onSingleSelect: (id: string) => void
  onToggleSelect: (id: string) => void
  onRangeSelect: (ids: string[], newAnchor?: string) => void
  onAddToSelection: (ids: string[]) => void
  draftVectors?: DraftVector[]
  onDraftChange?: (draft: DraftVector, index: number) => void
  markedForDeletion?: Set<string>
  onVectorUpdate?: (vectorId: string, updates: { metadata?: Record<string, unknown>; regenerateEmbedding?: boolean }) => Promise<void>
  onVectorContextMenu?: (e: React.MouseEvent, vectorId: string) => void
  onTableContextMenu?: (e: React.MouseEvent) => void
  // Embedding text field (for highlighting the column used for embeddings)
  embeddingTextField?: string
  // Whether the embedding text field is explicitly configured
  isEmbeddingFieldConfigured?: boolean
  // Pagination props
  hasMore?: boolean
  isFetchingMore?: boolean
  onLoadMore?: () => void
  totalVectorCount?: number
}

export default function VectorsTable({
  vectors,
  loading,
  error,
  hasActiveFilters = false,
  selectedVectorIds,
  selectionAnchor,
  onSingleSelect,
  onToggleSelect,
  onRangeSelect,
  onAddToSelection,
  draftVectors = [],
  onDraftChange,
  markedForDeletion = new Set(),
  onVectorUpdate,
  onVectorContextMenu,
  onTableContextMenu,
  embeddingTextField,
  isEmbeddingFieldConfigured,
  hasMore = false,
  isFetchingMore = false,
  onLoadMore,
  totalVectorCount,
}: VectorsTableProps) {
  // Panel context for closing detail panel during inline editing
  const { setRightPanelOpen } = usePanel()

  // Refs for auto-focus and virtualization
  const draftIdInputRef = useRef<HTMLInputElement>(null)
  const prevDraftCountRef = useRef<number>(0)
  const tableContainerRef = useRef<HTMLDivElement>(null)

  // Auto-focus draft input when drafts are first created
  useEffect(() => {
    if (draftVectors.length > 0 && prevDraftCountRef.current === 0 && draftIdInputRef.current) {
      draftIdInputRef.current.focus()
    }
    prevDraftCountRef.current = draftVectors.length
  }, [draftVectors.length])

  // All item IDs for selection (drafts first, then vectors)
  const allItemIds = useMemo(() => [
    ...draftVectors.map(v => v.id),
    ...vectors.map(v => v.id),
  ], [vectors, draftVectors])

  // Selection hook
  const {
    handleRowClick,
    handleMouseDown,
    handleMouseEnter,
  } = useTableSelection({
    itemIds: allItemIds,
    selectedIds: selectedVectorIds,
    selectionAnchor,
    onSingleSelect,
    onToggleSelect,
    onRangeSelect,
    onAddToSelection,
  })

  // Inline editing hook
  const {
    editingState,
    editingInputRef,
    startEditing,
    saveEditing,
    handleEditChange,
    handleEditKeyDown,
    isEditing,
    pendingEmbeddingSave,
    confirmPendingSave,
    cancelPendingSave,
    showFieldRequiredDialog,
    dismissFieldRequiredDialog,
  } = useInlineEditing({
    vectors,
    onSave: onVectorUpdate,
    embeddingTextField,
    isEmbeddingFieldConfigured,
  })

  // Loading state for regenerate dialog
  const [isRegenerating, setIsRegenerating] = useState(false)

  // Handle regenerate dialog confirmation
  const handleRegenerateConfirm = async (regenerate: boolean) => {
    setIsRegenerating(true)
    try {
      await confirmPendingSave(regenerate)
    } finally {
      setIsRegenerating(false)
    }
  }

  // Handle double-click to start editing
  const handleRowDoubleClick = (e: React.MouseEvent, vecId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const vec = vectors.find(v => v.id === vecId)
    if (vec && onVectorUpdate) {
      startEditing(vec)
    }
    onSingleSelect(vecId)
    // Close the detail panel when inline editing is active
    setRightPanelOpen(false)
  }

  // Extract metadata keys from vectors
  const metadataKeys = useMemo(() =>
    Array.from(new Set(vectors.flatMap(v => v.metadata ? Object.keys(v.metadata) : []))).sort(),
    [vectors]
  )

  // Check if any vectors have similarity scores (from query results)
  const hasScores = useMemo(() =>
    vectors.some(v => v.score !== undefined && v.score !== null),
    [vectors]
  )

  // Column definitions
  const columns = useMemo<ColumnDef<LocalVectorRecord>[]>(() => {
    const cols: ColumnDef<LocalVectorRecord>[] = []

    if (hasScores) {
      cols.push({
        accessorKey: 'score',
        header: 'score',
        size: 60,
        cell: info => (
          <div className="text-xs font-mono text-muted-foreground text-center">
            {(info.getValue() as number | null) !== null ? formatScore(info.getValue() as number) : '-'}
          </div>
        ),
      })
    }

    cols.push({
      accessorKey: 'id',
      header: 'id',
      size: 250,
      cell: info => <div className="text-xs font-mono text-foreground">{info.getValue() as string}</div>,
    })

    // Add dynamic metadata columns with embedding field highlighting
    metadataKeys.forEach(key => {
      const isEmbeddingField = embeddingTextField === key
      cols.push({
        id: `metadata.${key}`,
        header: () => (
          <span className={isEmbeddingField ? 'text-emerald-600 dark:text-emerald-400' : ''}>
            {key}
            {isEmbeddingField && (
              <span className="ml-1 text-[9px] opacity-70" title="Text field used for embedding">⚡</span>
            )}
          </span>
        ),
        size: 150,
        accessorFn: row => row.metadata?.[key],
        cell: info => {
          const value = info.getValue()
          if (value === undefined || value === null) {
            return <span className="text-xs text-muted-foreground italic">-</span>
          }
          if (typeof value === 'object') {
            return (
              <pre className="text-xs bg-secondary/50 p-1 rounded overflow-x-auto line-clamp-2">
                {JSON.stringify(value, null, 2)}
              </pre>
            )
          }
          return (
            <div className="text-xs line-clamp-2 text-foreground">
              {String(value)}
            </div>
          )
        },
      })
    })

    return cols
  }, [metadataKeys, hasScores, embeddingTextField])

  const table = useReactTable({
    data: vectors,
    columns,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
  })

  // Total rows including drafts
  const totalRows = draftVectors.length + vectors.length

  // Virtualizer for efficient rendering
  const rowVirtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => VIRTUALIZATION.ROW_HEIGHT,
    overscan: VIRTUALIZATION.OVERSCAN,
  })

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-muted-foreground">
          {hasActiveFilters ? 'Searching vectors...' : 'Loading vectors...'}
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    const isApiKeyError = error.includes('API key not configured') ||
      (error.includes('not configured') && error.includes('environment variable'))

    return (
      <div className="p-8">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
          <h3 className="text-destructive font-semibold mb-2">Error</h3>
          <p className="text-destructive">{error}</p>
          {isApiKeyError && (
            <button
              onClick={() => window.electronAPI.settings.openWindow()}
              className="mt-3 h-7 px-3 text-[12px] font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Open Settings
            </button>
          )}
        </div>
      </div>
    )
  }

  // Empty state
  if (vectors.length === 0 && draftVectors.length === 0) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <h3 className="text-foreground font-semibold text-lg mb-2">No Vectors Found</h3>
          <p className="text-muted-foreground">
            {hasActiveFilters
              ? 'No vectors match your filters. Try adjusting your search criteria.'
              : "This namespace doesn't have any vectors yet."}
          </p>
        </div>
      </div>
    )
  }

  const headerGroup = table.getHeaderGroups()[0]
  const idColIndex = hasScores ? 1 : 0
  const tableRows = table.getRowModel().rows

  return (
    <div
      ref={tableContainerRef}
      className="overflow-auto h-full"
      onContextMenu={onTableContextMenu}
    >
      {/* Embedding field required dialog */}
      <EmbeddingFieldRequiredDialog
        open={showFieldRequiredDialog}
        onOpenChange={(open) => {
          if (!open) dismissFieldRequiredDialog()
        }}
      />

      {/* Regenerate embedding dialog */}
      <RegenerateEmbeddingDialog
        open={pendingEmbeddingSave !== null}
        onOpenChange={(open) => {
          if (!open) cancelPendingSave()
        }}
        onConfirm={handleRegenerateConfirm}
        isLoading={isRegenerating}
      />

      {/* Header row */}
      <div
        className="sticky top-0 z-10 flex"
        style={{
          background: 'var(--canvas-background)',
          boxShadow: '0 1px 0 var(--border)',
          minWidth: table.getCenterTotalSize(),
        }}
      >
        {headerGroup.headers.map(header => (
          <div
            key={header.id}
            className="px-3 py-1.5 text-left text-[11px] font-medium text-muted-foreground/70 relative flex-shrink-0"
            style={{ width: header.getSize() }}
          >
            {!header.isPlaceholder && flexRender(header.column.columnDef.header, header.getContext())}
            <div
              onMouseDown={header.getResizeHandler()}
              onTouchStart={header.getResizeHandler()}
              className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-primary/40 ${
                header.column.getIsResizing() ? 'bg-primary/50' : ''
              }`}
            />
          </div>
        ))}
        <div className="flex-1" />
      </div>

      {/* Virtual rows container */}
      <div
        className="select-none relative"
        style={{
          height: rowVirtualizer.getTotalSize(),
          minWidth: table.getCenterTotalSize(),
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const isDraft = virtualRow.index < draftVectors.length

          if (isDraft) {
            const draft = draftVectors[virtualRow.index]
            return (
              <DraftRow
                key={`draft-${virtualRow.index}`}
                draft={draft}
                index={virtualRow.index}
                isSelected={selectedVectorIds.has(draft.id)}
                metadataKeys={metadataKeys}
                hasScores={hasScores}
                headerGroup={headerGroup}
                idColIndex={idColIndex}
                inputRef={virtualRow.index === 0 ? draftIdInputRef : undefined}
                onDraftChange={onDraftChange}
                onRowClick={handleRowClick}
                onRowDoubleClick={handleRowDoubleClick}
                onMouseDown={handleMouseDown}
                onMouseEnter={handleMouseEnter}
                virtualTop={virtualRow.start}
                virtualHeight={virtualRow.size}
              />
            )
          }

          // Data row
          const dataIndex = virtualRow.index - draftVectors.length
          const row = tableRows[dataIndex]
          if (!row) return null

          return (
            <DataRow
              key={row.id}
              row={row}
              rowIndex={virtualRow.index}
              adjustedIndex={virtualRow.index}
              isSelected={selectedVectorIds.has(row.original.id)}
              isMarkedForDeletion={markedForDeletion.has(row.original.id)}
              isEditing={isEditing(row.original.id)}
              editingState={editingState}
              editingInputRef={editingInputRef}
              metadataKeys={metadataKeys}
              hasScores={hasScores}
              headerGroup={headerGroup}
              idColIndex={idColIndex}
              onRowClick={handleRowClick}
              onRowDoubleClick={handleRowDoubleClick}
              onMouseDown={handleMouseDown}
              onMouseEnter={handleMouseEnter}
              onContextMenu={onVectorContextMenu}
              onEditChange={handleEditChange}
              onEditKeyDown={handleEditKeyDown}
              onEditBlur={saveEditing}
              virtualTop={virtualRow.start}
              virtualHeight={virtualRow.size}
            />
          )
        })}
      </div>

      {/* Load More button */}
      {hasMore && (
        <div className="flex justify-center py-3">
          <button
            onClick={onLoadMore}
            disabled={isFetchingMore}
            className="h-6 px-3 text-[11px] rounded-md border border-black/[0.08] dark:border-white/[0.1] bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] active:bg-black/[0.08] dark:active:bg-white/[0.1] text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isFetchingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  )
}

// Draft row component
interface DraftRowProps {
  draft: DraftVector
  index: number
  isSelected: boolean
  metadataKeys: string[]
  hasScores: boolean
  headerGroup: HeaderGroup<LocalVectorRecord>
  idColIndex: number
  inputRef?: React.RefObject<HTMLInputElement | null>
  onDraftChange?: (draft: DraftVector, index: number) => void
  onRowClick: (e: React.MouseEvent, id: string, index: number) => void
  onRowDoubleClick: (e: React.MouseEvent, id: string) => void
  onMouseDown: (e: React.MouseEvent, index: number) => void
  onMouseEnter: (index: number) => void
  virtualTop: number
  virtualHeight: number
}

function DraftRow({
  draft,
  index,
  isSelected,
  metadataKeys,
  hasScores,
  headerGroup,
  idColIndex,
  inputRef,
  onDraftChange,
  onRowClick,
  onRowDoubleClick,
  onMouseDown,
  onMouseEnter,
  virtualTop,
  virtualHeight,
}: DraftRowProps) {
  return (
    <div
      className={`flex cursor-pointer transition-colors ${isSelected ? 'bg-primary/20 dark:bg-primary/30' : 'bg-primary/8 dark:bg-primary/15 hover:bg-primary/12 dark:hover:bg-primary/20'}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: virtualHeight,
        transform: `translateY(${virtualTop}px)`,
      }}
      onClick={e => onRowClick(e, draft.id, index)}
      onDoubleClick={e => onRowDoubleClick(e, draft.id)}
      onMouseDown={e => onMouseDown(e, index)}
      onMouseEnter={() => onMouseEnter(index)}
    >
      {hasScores && (
        <div className="pl-3 py-0.5 flex-shrink-0" style={{ width: headerGroup?.headers[0]?.getSize() }}>
          <div className="text-xs font-mono text-muted-foreground text-center">-</div>
        </div>
      )}
      <div className="pl-3 py-0.5 flex-shrink-0" style={{ width: headerGroup?.headers[idColIndex]?.getSize() }}>
        <input
          ref={inputRef}
          type="text"
          value={draft.id}
          onChange={e => onDraftChange?.({ ...draft, id: e.target.value }, index)}
          placeholder="Enter vector ID"
          className="w-full text-xs font-mono bg-transparent border-none outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground/50"
        />
      </div>
      {metadataKeys.map((key, idx) => (
        <div
          key={key}
          className="pl-3 py-0.5 flex-shrink-0"
          style={{ width: headerGroup?.headers[idColIndex + 1 + idx]?.getSize() }}
        >
          <input
            type="text"
            value={draft.metadata[key]?.value || ''}
            onChange={e => onDraftChange?.({
              ...draft,
              metadata: { ...draft.metadata, [key]: { ...draft.metadata[key], value: e.target.value } }
            }, index)}
            placeholder="-"
            className="w-full text-xs bg-transparent border-none outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground/50 placeholder:italic"
          />
        </div>
      ))}
      <div className="flex-1" />
    </div>
  )
}

// Data row component
interface DataRowProps {
  row: ReturnType<ReturnType<typeof useReactTable<LocalVectorRecord>>['getRowModel']>['rows'][0]
  rowIndex: number
  adjustedIndex: number
  isSelected: boolean
  isMarkedForDeletion: boolean
  isEditing: boolean
  editingState: import('../../types/vectors').EditingState | null
  editingInputRef: React.RefObject<HTMLInputElement | null>
  metadataKeys: string[]
  hasScores: boolean
  headerGroup: HeaderGroup<LocalVectorRecord>
  idColIndex: number
  onRowClick: (e: React.MouseEvent, id: string, index: number) => void
  onRowDoubleClick: (e: React.MouseEvent, id: string) => void
  onMouseDown: (e: React.MouseEvent, index: number) => void
  onMouseEnter: (index: number) => void
  onContextMenu?: (e: React.MouseEvent, id: string) => void
  onEditChange: (field: string, value: string) => void
  onEditKeyDown: (e: React.KeyboardEvent) => void
  onEditBlur: () => void
  virtualTop: number
  virtualHeight: number
}

function DataRow({
  row,
  rowIndex,
  adjustedIndex,
  isSelected,
  isMarkedForDeletion,
  isEditing,
  editingState,
  editingInputRef,
  metadataKeys,
  hasScores,
  headerGroup,
  idColIndex,
  onRowClick,
  onRowDoubleClick,
  onMouseDown,
  onMouseEnter,
  onContextMenu,
  onEditChange,
  onEditKeyDown,
  onEditBlur,
  virtualTop,
  virtualHeight,
}: DataRowProps) {
  // Determine row background - using CSS variables for proper dark mode support
  let rowBgClass: string
  let rowHoverClass = 'hover:bg-[var(--table-row-hover)]'
  if (isEditing) {
    rowBgClass = 'bg-primary/10'
    rowHoverClass = ''
  } else if (isMarkedForDeletion) {
    rowBgClass = isSelected ? 'bg-destructive/25' : 'bg-destructive/15'
    rowHoverClass = 'hover:bg-destructive/30'
  } else if (isSelected) {
    rowBgClass = 'bg-primary/20 dark:bg-primary/30'
    rowHoverClass = ''
  } else {
    rowBgClass = adjustedIndex % 2 === 1 ? 'bg-[var(--table-row-alt)]' : ''
  }

  const vec = row.original
  const rowStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: virtualHeight,
    transform: `translateY(${virtualTop}px)`,
  }

  // Editing row
  if (isEditing && editingState) {
    return (
      <div
        className={`flex transition-colors cursor-pointer ${rowBgClass} ${rowHoverClass}`}
        style={rowStyle}
        onContextMenu={e => onContextMenu?.(e, vec.id)}
        onBlur={e => {
          // Only save when focus leaves the entire editing row
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            onEditBlur()
          }
        }}
      >
        {hasScores && (
          <div className="pl-3 py-0.5 flex-shrink-0" style={{ width: headerGroup?.headers[0]?.getSize() }}>
            <div className="text-xs font-mono text-muted-foreground text-center">
{vec.score !== null && vec.score !== undefined ? formatScore(vec.score) : '-'}
            </div>
          </div>
        )}
        <div className="pl-3 py-0.5 flex-shrink-0" style={{ width: headerGroup?.headers[idColIndex]?.getSize() }}>
          <div className="text-xs font-mono text-foreground">{vec.id}</div>
        </div>
        {metadataKeys.map((key, idx) => {
          const value = editingState.metadata[key]
          return (
            <div
              key={key}
              className="pl-3 py-0.5 flex-shrink-0"
              style={{ width: headerGroup?.headers[idColIndex + 1 + idx]?.getSize() }}
            >
              <input
                ref={idx === 0 ? editingInputRef : undefined}
                type="text"
                value={value !== undefined && value !== null ? String(value) : ''}
                onChange={e => onEditChange(key, e.target.value)}
                onKeyDown={onEditKeyDown}
                placeholder="-"
                className="w-full text-xs bg-transparent border-none outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground/50 placeholder:italic"
              />
            </div>
          )
        })}
        <div className="flex-1" />
      </div>
    )
  }

  // Normal row
  return (
    <div
      className={`flex transition-colors cursor-pointer ${rowBgClass} ${rowHoverClass}`}
      style={rowStyle}
      onClick={e => onRowClick(e, vec.id, rowIndex)}
      onDoubleClick={e => onRowDoubleClick(e, vec.id)}
      onMouseDown={e => onMouseDown(e, rowIndex)}
      onMouseEnter={() => onMouseEnter(rowIndex)}
      onContextMenu={e => onContextMenu?.(e, vec.id)}
    >
      {row.getVisibleCells().map(cell => (
        <div
          key={cell.id}
          className="pl-3 py-0.5 flex-shrink-0"
          style={{ width: cell.column.getSize() }}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      ))}
      <div className="flex-1" />
    </div>
  )
}
