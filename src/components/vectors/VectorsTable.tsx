import { useMemo, useRef, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  ColumnDef,
  flexRender,
  HeaderGroup,
} from '@tanstack/react-table'
import { LocalVectorRecord, DraftVector } from '../../types/vectors'
import { useTableSelection } from '../../hooks/useTableSelection'
import { useInlineEditing } from '../../hooks/useInlineEditing'

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
  onVectorUpdate?: (vectorId: string, updates: { metadata?: Record<string, unknown> }) => Promise<void>
  onVectorContextMenu?: (e: React.MouseEvent, vectorId: string) => void
  onTableContextMenu?: (e: React.MouseEvent) => void
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
}: VectorsTableProps) {
  // Refs for auto-focus
  const draftIdInputRef = useRef<HTMLInputElement>(null)
  const prevDraftCountRef = useRef<number>(0)

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
  } = useInlineEditing({
    vectors,
    onSave: onVectorUpdate,
  })

  // Handle double-click to start editing
  const handleRowDoubleClick = (e: React.MouseEvent, vecId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const vec = vectors.find(v => v.id === vecId)
    if (vec && onVectorUpdate) {
      startEditing(vec)
    }
    onSingleSelect(vecId)
  }

  // Extract metadata keys from vectors
  const metadataKeys = useMemo(() =>
    Array.from(new Set(vectors.flatMap(v => v.metadata ? Object.keys(v.metadata) : []))).sort(),
    [vectors]
  )

  // Check if any vectors have distance scores
  const hasDistances = useMemo(() =>
    vectors.some(v => v.distance !== undefined && v.distance !== null),
    [vectors]
  )

  // Column definitions
  const columns = useMemo<ColumnDef<LocalVectorRecord>[]>(() => {
    const cols: ColumnDef<LocalVectorRecord>[] = []

    if (hasDistances) {
      cols.push({
        accessorKey: 'distance',
        header: 'dist',
        size: 60,
        cell: info => (
          <div className="text-xs font-mono text-muted-foreground text-center">
            {(info.getValue() as number | null) !== null ? (info.getValue() as number).toFixed(3) : '-'}
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

    metadataKeys.forEach(key => {
      cols.push({
        id: `metadata.${key}`,
        header: key,
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
          return <div className="text-xs text-foreground line-clamp-2">{String(value)}</div>
        },
      })
    })

    return cols
  }, [metadataKeys, hasDistances])

  const table = useReactTable({
    data: vectors,
    columns,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
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
  const idColIndex = hasDistances ? 1 : 0

  return (
    <div className="overflow-auto h-full" onContextMenu={onTableContextMenu}>
      <table style={{ minWidth: '100%', width: table.getCenterTotalSize() }}>
        <thead className="sticky top-0 z-10" style={{ background: 'var(--canvas-background)', boxShadow: '0 1px 0 var(--border)' }}>
          {table.getHeaderGroups().map(hg => (
            <tr key={hg.id}>
              {hg.headers.map(header => (
                <th
                  key={header.id}
                  className="px-3 py-1.5 text-left text-[11px] font-medium text-muted-foreground/70 relative"
                  style={{ width: header.getSize(), background: 'var(--canvas-background)' }}
                >
                  {!header.isPlaceholder && flexRender(header.column.columnDef.header, header.getContext())}
                  <div
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-primary/40 ${
                      header.column.getIsResizing() ? 'bg-primary/50' : ''
                    }`}
                  />
                </th>
              ))}
              <th style={{ background: 'var(--canvas-background)' }} />
            </tr>
          ))}
        </thead>
        <tbody className="select-none">
          {/* Draft rows */}
          {draftVectors.map((draft, idx) => (
            <DraftRow
              key={`draft-${idx}`}
              draft={draft}
              index={idx}
              isSelected={selectedVectorIds.has(draft.id)}
              metadataKeys={metadataKeys}
              hasDistances={hasDistances}
              headerGroup={headerGroup}
              idColIndex={idColIndex}
              inputRef={idx === 0 ? draftIdInputRef : undefined}
              onDraftChange={onDraftChange}
              onRowClick={handleRowClick}
              onRowDoubleClick={handleRowDoubleClick}
              onMouseDown={handleMouseDown}
              onMouseEnter={handleMouseEnter}
            />
          ))}
          {/* Data rows */}
          {table.getRowModel().rows.map((row, index) => {
            const rowIndex = draftVectors.length + index
            const adjustedIndex = draftVectors.length > 0 ? index + draftVectors.length : index

            return (
              <DataRow
                key={row.id}
                row={row}
                rowIndex={rowIndex}
                adjustedIndex={adjustedIndex}
                isSelected={selectedVectorIds.has(row.original.id)}
                isMarkedForDeletion={markedForDeletion.has(row.original.id)}
                isEditing={isEditing(row.original.id)}
                editingState={editingState}
                editingInputRef={editingInputRef}
                metadataKeys={metadataKeys}
                hasDistances={hasDistances}
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
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Draft row component
interface DraftRowProps {
  draft: DraftVector
  index: number
  isSelected: boolean
  metadataKeys: string[]
  hasDistances: boolean
  headerGroup: HeaderGroup<LocalVectorRecord>
  idColIndex: number
  inputRef?: React.RefObject<HTMLInputElement | null>
  onDraftChange?: (draft: DraftVector, index: number) => void
  onRowClick: (e: React.MouseEvent, id: string, index: number) => void
  onRowDoubleClick: (e: React.MouseEvent, id: string) => void
  onMouseDown: (e: React.MouseEvent, index: number) => void
  onMouseEnter: (index: number) => void
}

function DraftRow({
  draft,
  index,
  isSelected,
  metadataKeys,
  hasDistances,
  headerGroup,
  idColIndex,
  inputRef,
  onDraftChange,
  onRowClick,
  onRowDoubleClick,
  onMouseDown,
  onMouseEnter,
}: DraftRowProps) {
  return (
    <tr
      className={`cursor-pointer ${isSelected ? 'bg-primary/15 dark:bg-primary/25' : 'bg-primary/5 dark:bg-primary/10'}`}
      onClick={e => onRowClick(e, draft.id, index)}
      onDoubleClick={e => onRowDoubleClick(e, draft.id)}
      onMouseDown={e => onMouseDown(e, index)}
      onMouseEnter={() => onMouseEnter(index)}
    >
      {hasDistances && (
        <td className="pl-3 py-0.5 align-top" style={{ width: headerGroup?.headers[0]?.getSize() }}>
          <div className="text-xs font-mono text-muted-foreground text-center">-</div>
        </td>
      )}
      <td className="pl-3 py-0.5 align-top" style={{ width: headerGroup?.headers[idColIndex]?.getSize() }}>
        <input
          ref={inputRef}
          type="text"
          value={draft.id}
          onChange={e => onDraftChange?.({ ...draft, id: e.target.value }, index)}
          placeholder="Enter vector ID"
          className="w-full text-xs font-mono bg-transparent border-none outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground/50"
        />
      </td>
      {metadataKeys.map(key => (
        <td key={key} className="pl-3 py-0.5 align-top">
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
        </td>
      ))}
      <td />
    </tr>
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
  hasDistances: boolean
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
  hasDistances,
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
}: DataRowProps) {
  // Determine row background
  let rowBgClass: string
  if (isEditing) {
    rowBgClass = 'bg-primary/8'
  } else if (isMarkedForDeletion) {
    rowBgClass = isSelected ? 'bg-destructive/20' : 'bg-destructive/12'
  } else if (isSelected) {
    rowBgClass = 'bg-primary/15 dark:bg-primary/25'
  } else {
    rowBgClass = adjustedIndex % 2 === 1 ? 'bg-black/[0.04] dark:bg-white/[0.04]' : ''
  }

  const vec = row.original

  // Editing row
  if (isEditing && editingState) {
    return (
      <tr
        className={`transition-colors cursor-pointer ${rowBgClass}`}
        onContextMenu={e => onContextMenu?.(e, vec.id)}
      >
        {hasDistances && (
          <td className="pl-3 py-0.5 align-top" style={{ width: headerGroup?.headers[0]?.getSize() }}>
            <div className="text-xs font-mono text-muted-foreground text-center">
              {vec.distance !== null && vec.distance !== undefined ? vec.distance.toFixed(3) : '-'}
            </div>
          </td>
        )}
        <td className="pl-3 py-0.5 align-top" style={{ width: headerGroup?.headers[idColIndex]?.getSize() }}>
          <div className="text-xs font-mono text-foreground">{vec.id}</div>
        </td>
        {metadataKeys.map((key, idx) => {
          const value = editingState.metadata[key]
          return (
            <td key={key} className="pl-3 py-0.5 align-top">
              <input
                ref={idx === 0 ? editingInputRef : undefined}
                type="text"
                value={value !== undefined && value !== null ? String(value) : ''}
                onChange={e => onEditChange(key, e.target.value)}
                onKeyDown={onEditKeyDown}
                onBlur={onEditBlur}
                placeholder="-"
                className="w-full text-xs bg-transparent border-none outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground/50 placeholder:italic"
              />
            </td>
          )
        })}
        <td />
      </tr>
    )
  }

  // Normal row
  return (
    <tr
      className={`transition-colors cursor-pointer ${rowBgClass}`}
      onClick={e => onRowClick(e, vec.id, rowIndex)}
      onDoubleClick={e => onRowDoubleClick(e, vec.id)}
      onMouseDown={e => onMouseDown(e, rowIndex)}
      onMouseEnter={() => onMouseEnter(rowIndex)}
      onContextMenu={e => onContextMenu?.(e, vec.id)}
    >
      {row.getVisibleCells().map(cell => (
        <td key={cell.id} className="pl-3 py-0.5 align-top" style={{ width: cell.column.getSize() }}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
      <td />
    </tr>
  )
}
