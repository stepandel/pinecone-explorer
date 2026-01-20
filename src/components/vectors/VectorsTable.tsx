import { useState, useMemo, useRef, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  ColumnDef,
  flexRender,
  ColumnResizeMode,
} from '@tanstack/react-table'
import { TypedMetadataRecord } from '../../types/metadata'

interface VectorRecord {
  id: string
  metadata: Record<string, unknown> | null
  embedding: number[] | null
  distance?: number | null
}

interface DraftVector {
  id: string
  metadata: TypedMetadataRecord
}

interface EditingState {
  vectorId: string
  metadata: Record<string, unknown>
}

interface VectorsTableProps {
  vectors: VectorRecord[]
  loading: boolean
  error: string | null
  hasActiveFilters?: boolean
  // Multi-select props
  selectedVectorIds: Set<string>
  selectionAnchor: string | null
  onSingleSelect: (id: string) => void
  onToggleSelect: (id: string) => void
  onRangeSelect: (ids: string[], newAnchor?: string) => void
  onAddToSelection: (ids: string[]) => void
  // Draft props - supports multiple drafts for paste operations
  draftVectors?: DraftVector[]
  onDraftChange?: (draft: DraftVector, index: number) => void
  onDraftCancel?: () => void
  markedForDeletion?: Set<string>
  // Inline editing props
  onVectorUpdate?: (vectorId: string, updates: { metadata?: Record<string, unknown> }) => Promise<void>
  // Context menu props
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
  onDraftCancel,
  markedForDeletion = new Set(),
  onVectorUpdate,
  onVectorContextMenu,
  onTableContextMenu,
}: VectorsTableProps) {
  // Ref for auto-focusing the id input when draft starts
  const draftIdInputRef = useRef<HTMLInputElement>(null)
  const prevDraftCountRef = useRef<number>(0)

  // Auto-focus only when drafts are first created (not on every change)
  useEffect(() => {
    const currentDraftCount = draftVectors.length
    const prevDraftCount = prevDraftCountRef.current

    // Only focus if we just created drafts (went from 0 to having drafts)
    if (currentDraftCount > 0 && prevDraftCount === 0 && draftIdInputRef.current) {
      draftIdInputRef.current.focus()
    }

    prevDraftCountRef.current = currentDraftCount
  }, [draftVectors.length])

  // Inline editing state
  const [editingState, setEditingState] = useState<EditingState | null>(null)
  const editingInputRef = useRef<HTMLInputElement>(null)

  // Start editing a vector
  const startEditing = (vec: VectorRecord) => {
    if (!onVectorUpdate) return
    setEditingState({
      vectorId: vec.id,
      metadata: vec.metadata ? { ...vec.metadata } : {},
    })
  }

  // Cancel editing
  const cancelEditing = () => {
    setEditingState(null)
  }

  // Save editing changes
  const saveEditing = async () => {
    if (!editingState || !onVectorUpdate) return
    const originalVec = vectors.find(v => v.id === editingState.vectorId)
    if (!originalVec) return

    // Check if there are actual changes
    const hasMetaChanges = JSON.stringify(editingState.metadata) !== JSON.stringify(originalVec.metadata || {})

    if (hasMetaChanges) {
      try {
        await onVectorUpdate(editingState.vectorId, {
          metadata: hasMetaChanges ? editingState.metadata : undefined,
        })
      } catch (error) {
        console.error('Failed to update vector:', error)
      }
    }
    setEditingState(null)
  }

  // Handle editing field change
  const handleEditChange = (field: string, value: string) => {
    if (!editingState) return
    // Metadata field - try to preserve original type
    const originalVec = vectors.find(v => v.id === editingState.vectorId)
    const originalValue = originalVec?.metadata?.[field]
    let parsedValue: unknown = value

    if (typeof originalValue === 'number') {
      const num = Number(value)
      if (!isNaN(num)) parsedValue = num
    } else if (typeof originalValue === 'boolean') {
      if (value.toLowerCase() === 'true') parsedValue = true
      else if (value.toLowerCase() === 'false') parsedValue = false
    }

    setEditingState({
      ...editingState,
      metadata: { ...editingState.metadata, [field]: parsedValue },
    })
  }

  // Handle keyboard events in editing mode
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEditing()
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      saveEditing()
    }
  }

  // Focus the first input when editing starts
  useEffect(() => {
    if (editingState && editingInputRef.current) {
      editingInputRef.current.focus()
      editingInputRef.current.select()
    }
  }, [editingState?.vectorId])

  // Drag selection state
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null)

  // Get all vector IDs including drafts at the top
  const allVecIds = useMemo(() => {
    const ids: string[] = []
    // Add all draft vector IDs first
    ids.push(...draftVectors.map(v => v.id))
    ids.push(...vectors.map(v => v.id))
    return ids
  }, [vectors, draftVectors])

  // Handle row click with modifier keys (macOS-style)
  const handleRowClick = (e: React.MouseEvent, vecId: string, rowIndex: number) => {
    // Prevent text selection during click
    e.preventDefault()

    if (e.metaKey && e.shiftKey) {
      // ⌘+Shift+Click: Add range to existing selection
      if (selectionAnchor) {
        const anchorIndex = allVecIds.indexOf(selectionAnchor)
        if (anchorIndex !== -1) {
          const start = Math.min(anchorIndex, rowIndex)
          const end = Math.max(anchorIndex, rowIndex)
          const rangeIds = allVecIds.slice(start, end + 1)
          onAddToSelection(rangeIds)
          return
        }
      }
      // No anchor, just add this one
      onToggleSelect(vecId)
    } else if (e.shiftKey) {
      // Shift+Click: Range select (replace selection)
      if (selectionAnchor) {
        const anchorIndex = allVecIds.indexOf(selectionAnchor)
        if (anchorIndex !== -1) {
          const start = Math.min(anchorIndex, rowIndex)
          const end = Math.max(anchorIndex, rowIndex)
          const rangeIds = allVecIds.slice(start, end + 1)
          onRangeSelect(rangeIds)
          return
        }
      }
      // No anchor, just select this one
      onSingleSelect(vecId)
    } else if (e.metaKey) {
      // ⌘+Click: Toggle this row in selection
      onToggleSelect(vecId)
    } else {
      // Plain click: Select only this row, or deselect if already the only selected
      if (selectedVectorIds.has(vecId) && selectedVectorIds.size === 1) {
        // Already selected and it's the only one - deselect
        onToggleSelect(vecId)
      } else {
        onSingleSelect(vecId)
      }
    }
  }

  // Handle double-click to start inline editing
  const handleRowDoubleClick = (e: React.MouseEvent, vecId: string) => {
    e.preventDefault()
    e.stopPropagation()
    // Find the vector and start editing
    const vec = vectors.find(v => v.id === vecId)
    if (vec && onVectorUpdate) {
      startEditing(vec)
    }
    // Also select the row
    onSingleSelect(vecId)
  }

  // Drag selection handlers
  const handleMouseDown = (e: React.MouseEvent, rowIndex: number) => {
    // Only start drag on plain click (no modifiers)
    if (!e.metaKey && !e.shiftKey && e.button === 0) {
      setIsDragging(true)
      setDragStartIndex(rowIndex)
    }
  }

  const handleMouseEnter = (rowIndex: number) => {
    if (isDragging && dragStartIndex !== null) {
      const start = Math.min(dragStartIndex, rowIndex)
      const end = Math.max(dragStartIndex, rowIndex)
      const rangeIds = allVecIds.slice(start, end + 1)
      onRangeSelect(rangeIds, allVecIds[dragStartIndex])
    }
  }

  // Global mouse up to end drag
  useEffect(() => {
    const handleMouseUp = () => {
      setIsDragging(false)
      setDragStartIndex(null)
    }
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [])

  // Extract all unique metadata keys from vectors
  const metadataKeys = useMemo(() =>
    Array.from(
      new Set(
        vectors.flatMap(vec =>
          vec.metadata ? Object.keys(vec.metadata) : []
        )
      )
    ).sort(),
    [vectors]
  )

  // Check if any vectors have distance scores (semantic search results)
  const hasDistances = useMemo(() =>
    vectors.some(vec => vec.distance !== undefined && vec.distance !== null),
    [vectors]
  )

  // Define columns
  const columns = useMemo<ColumnDef<VectorRecord>[]>(() => {
    const baseColumns: ColumnDef<VectorRecord>[] = []

    // Add distance column only when we have semantic search results
    if (hasDistances) {
      baseColumns.push({
        accessorKey: 'distance',
        header: 'dist',
        size: 60,
        cell: info => {
          const value = info.getValue() as number | null | undefined
          return (
            <div className="text-xs font-mono text-muted-foreground text-center">
              {value !== undefined && value !== null ? value.toFixed(3) : '-'}
            </div>
          )
        },
      })
    }

    baseColumns.push({
      accessorKey: 'id',
      header: 'id',
      size: 250,
      cell: info => (
        <div className="text-xs font-mono text-foreground">
          {info.getValue() as string}
        </div>
      ),
    })

    // Add dynamic metadata columns
    const metadataColumns: ColumnDef<VectorRecord>[] = metadataKeys.map(key => ({
      id: `metadata.${key}`,
      header: key,
      size: 150,
      accessorFn: (row) => row.metadata?.[key],
      cell: info => {
        const value = info.getValue()
        return (
          <div className="text-xs text-foreground">
            {value !== undefined && value !== null ? (
              typeof value === 'object' ? (
                <pre className="text-xs bg-secondary/50 p-1 rounded overflow-x-auto line-clamp-2">
                  {JSON.stringify(value, null, 2)}
                </pre>
              ) : (
                <div className="line-clamp-2">
                  {String(value)}
                </div>
              )
            ) : (
              <span className="text-muted-foreground italic">-</span>
            )}
          </div>
        )
      },
    }))

    return [...baseColumns, ...metadataColumns]
  }, [metadataKeys, hasDistances])

  const [columnResizeMode] = useState<ColumnResizeMode>('onChange')

  const table = useReactTable({
    data: vectors,
    columns,
    columnResizeMode,
    getCoreRowModel: getCoreRowModel(),
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-muted-foreground">
          {hasActiveFilters ? 'Searching vectors...' : 'Loading vectors...'}
        </div>
      </div>
    )
  }

  if (error) {
    // Check if this is an API key error
    const isApiKeyError = error.includes('API key not configured') ||
      (error.includes('not configured') && error.includes('environment variable'))

    const handleOpenSettings = () => {
      window.electronAPI.settings.openWindow()
    }

    return (
      <div className="p-8">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
          <h3 className="text-destructive font-semibold mb-2">Error</h3>
          <p className="text-destructive">{error}</p>
          {isApiKeyError && (
            <button
              onClick={handleOpenSettings}
              className="mt-3 h-7 px-3 text-[12px] font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Open Settings
            </button>
          )}
        </div>
      </div>
    )
  }

  if (vectors.length === 0) {
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

  return (
    <div className="overflow-auto h-full" onContextMenu={onTableContextMenu}>
      <table style={{ minWidth: '100%', width: table.getCenterTotalSize() }}>
        <thead className="sticky top-0 z-10" style={{ background: 'var(--canvas-background)', boxShadow: '0 1px 0 var(--border)' }}>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th
                  key={header.id}
                  className="px-3 py-1.5 text-left text-[11px] font-medium text-muted-foreground/70 relative"
                  style={{ width: header.getSize(), background: 'var(--canvas-background)' }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                  <div
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-primary/40 ${
                      header.column.getIsResizing() ? 'bg-primary/50' : ''
                    }`}
                  />
                </th>
              ))}
              {/* Filler column to extend table structure */}
              <th style={{ background: 'var(--canvas-background)' }}></th>
            </tr>
          ))}
        </thead>
        <tbody className="select-none">
          {/* Draft rows for creating/pasting vectors */}
          {draftVectors.length > 0 && onDraftChange && draftVectors.map((draft, draftIndex) => {
            // Column indices depend on whether distance column is shown
            const idColIndex = hasDistances ? 1 : 0
            return (
            <tr
              key={`draft-${draftIndex}`}
              className={`cursor-pointer ${selectedVectorIds.has(draft.id) ? 'bg-primary/15 dark:bg-primary/25' : 'bg-primary/5 dark:bg-primary/10'}`}
              onClick={(e) => handleRowClick(e, draft.id, draftIndex)}
              onDoubleClick={(e) => handleRowDoubleClick(e, draft.id)}
              onMouseDown={(e) => handleMouseDown(e, draftIndex)}
              onMouseEnter={() => handleMouseEnter(draftIndex)}
            >
              {/* Distance cell - empty placeholder when distance column is visible */}
              {hasDistances && (
                <td
                  className="pl-3 py-0.5 align-top "
                  style={{ width: table.getHeaderGroups()[0]?.headers[0]?.getSize() }}
                >
                  <div className="text-xs font-mono text-muted-foreground text-center">-</div>
                </td>
              )}
              {/* ID cell - editable */}
              <td
                className="pl-3 py-0.5 align-top "
                style={{ width: table.getHeaderGroups()[0]?.headers[idColIndex]?.getSize() }}
              >
                <input
                  ref={draftIndex === 0 ? draftIdInputRef : undefined}
                  type="text"
                  value={draft.id}
                  onChange={(e) => onDraftChange({ ...draft, id: e.target.value }, draftIndex)}
                  placeholder="Enter vector ID"
                  className="w-full text-xs font-mono bg-transparent border-none outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground/50"
                />
              </td>
              {/* Editable metadata cells */}
              {metadataKeys.map(key => {
                const field = draft.metadata[key]
                return (
                  <td
                    key={`draft-${draftIndex}-${key}`}
                    className="pl-3 py-0.5 align-top "
                  >
                    <input
                      type="text"
                      value={field?.value || ''}
                      onChange={(e) => onDraftChange({
                        ...draft,
                        metadata: {
                          ...draft.metadata,
                          [key]: { ...field, value: e.target.value }
                        }
                      }, draftIndex)}
                      placeholder="-"
                      className="w-full text-xs bg-transparent border-none outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground/50 placeholder:italic"
                    />
                  </td>
                )
              })}
              {/* Filler cell */}
              <td className=""></td>
            </tr>
          )})}
          {table.getRowModel().rows.map((row, index) => {
            const isSelected = selectedVectorIds.has(row.original.id)
            const isMarkedForDeletion = markedForDeletion.has(row.original.id)
            const isEditing = editingState?.vectorId === row.original.id
            // Adjust index for alternating colors when drafts exist
            const draftCount = draftVectors.length
            const adjustedIndex = draftCount > 0 ? index + draftCount : index
            // Row index in allVecIds (drafts take indices 0 to draftCount-1)
            const rowIndex = draftCount > 0 ? index + draftCount : index

            // Determine row background - calmer, macOS-style selection with subtle zebra
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

            // Column indices depend on whether distance column is shown
            const idColIndex = hasDistances ? 1 : 0

            // Render editing row
            if (isEditing && editingState) {
              return (
                <tr
                  key={row.id}
                  className={`transition-colors cursor-pointer ${rowBgClass}`}
                  onContextMenu={(e) => onVectorContextMenu?.(e, row.original.id)}
                >
                  {/* Distance cell - display only when distance column is visible */}
                  {hasDistances && (
                    <td
                      className="pl-3 py-0.5 align-top "
                      style={{ width: table.getHeaderGroups()[0]?.headers[0]?.getSize() }}
                    >
                      <div className="text-xs font-mono text-muted-foreground text-center">
                        {row.original.distance !== undefined && row.original.distance !== null
                          ? row.original.distance.toFixed(3)
                          : '-'}
                      </div>
                    </td>
                  )}
                  {/* ID cell - not editable */}
                  <td
                    className="pl-3 py-0.5 align-top "
                    style={{ width: table.getHeaderGroups()[0]?.headers[idColIndex]?.getSize() }}
                  >
                    <div className="text-xs font-mono text-foreground">
                      {row.original.id}
                    </div>
                  </td>
                  {/* Editable metadata cells */}
                  {metadataKeys.map((key, keyIndex) => {
                    const value = editingState.metadata[key]
                    const displayValue = value !== undefined && value !== null ? String(value) : ''
                    return (
                      <td
                        key={`edit-${key}`}
                        className="pl-3 py-0.5 align-top "
                      >
                        <input
                          ref={keyIndex === 0 ? editingInputRef : undefined}
                          type="text"
                          value={displayValue}
                          onChange={(e) => handleEditChange(key, e.target.value)}
                          onKeyDown={handleEditKeyDown}
                          onBlur={saveEditing}
                          placeholder="-"
                          className="w-full text-xs bg-transparent border-none outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground/50 placeholder:italic"
                        />
                      </td>
                    )
                  })}
                  {/* Filler cell */}
                  <td className=""></td>
                </tr>
              )
            }

            // Render normal row
            return (
              <tr
                key={row.id}
                className={`transition-colors cursor-pointer ${rowBgClass}`}
                onClick={(e) => handleRowClick(e, row.original.id, rowIndex)}
                onDoubleClick={(e) => handleRowDoubleClick(e, row.original.id)}
                onMouseDown={(e) => handleMouseDown(e, rowIndex)}
                onMouseEnter={() => handleMouseEnter(rowIndex)}
                onContextMenu={(e) => onVectorContextMenu?.(e, row.original.id)}
              >
                {row.getVisibleCells().map(cell => (
                  <td
                    key={cell.id}
                    className="pl-3 py-0.5 align-top "
                    style={{ width: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
                {/* Filler cell to extend table structure */}
                <td className=""></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
