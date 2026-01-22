import { useState, useEffect, useCallback, useMemo } from 'react'

interface UseTableSelectionProps {
  /** All item IDs in display order */
  itemIds: string[]
  /** Currently selected item IDs */
  selectedIds: Set<string>
  /** Current selection anchor for range selection */
  selectionAnchor: string | null
  /** Callbacks for selection changes */
  onSingleSelect: (id: string) => void
  onToggleSelect: (id: string) => void
  onRangeSelect: (ids: string[], newAnchor?: string) => void
  onAddToSelection: (ids: string[]) => void
}

interface UseTableSelectionReturn {
  /** Whether a drag selection is in progress */
  isDragging: boolean
  /** Handle click on a row with modifier key support */
  handleRowClick: (e: React.MouseEvent, itemId: string, rowIndex: number) => void
  /** Handle mouse down to start drag selection */
  handleMouseDown: (e: React.MouseEvent, rowIndex: number) => void
  /** Handle mouse enter during drag selection */
  handleMouseEnter: (rowIndex: number) => void
}

/**
 * Custom hook for table row selection with support for:
 * - Single click selection
 * - Cmd+Click toggle selection
 * - Shift+Click range selection
 * - Cmd+Shift+Click add range to selection
 * - Drag selection
 */
export function useTableSelection({
  itemIds,
  selectedIds,
  selectionAnchor,
  onSingleSelect,
  onToggleSelect,
  onRangeSelect,
  onAddToSelection,
}: UseTableSelectionProps): UseTableSelectionReturn {
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null)

  // Handle row click with modifier keys (macOS-style)
  const handleRowClick = useCallback((e: React.MouseEvent, itemId: string, rowIndex: number) => {
    // Prevent text selection during click
    e.preventDefault()

    if (e.metaKey && e.shiftKey) {
      // Cmd+Shift+Click: Add range to existing selection
      if (selectionAnchor) {
        const anchorIndex = itemIds.indexOf(selectionAnchor)
        if (anchorIndex !== -1) {
          const start = Math.min(anchorIndex, rowIndex)
          const end = Math.max(anchorIndex, rowIndex)
          const rangeIds = itemIds.slice(start, end + 1)
          onAddToSelection(rangeIds)
          return
        }
      }
      // No anchor, just add this one
      onToggleSelect(itemId)
    } else if (e.shiftKey) {
      // Shift+Click: Range select (replace selection)
      if (selectionAnchor) {
        const anchorIndex = itemIds.indexOf(selectionAnchor)
        if (anchorIndex !== -1) {
          const start = Math.min(anchorIndex, rowIndex)
          const end = Math.max(anchorIndex, rowIndex)
          const rangeIds = itemIds.slice(start, end + 1)
          onRangeSelect(rangeIds)
          return
        }
      }
      // No anchor, just select this one
      onSingleSelect(itemId)
    } else if (e.metaKey) {
      // Cmd+Click: Toggle this row in selection
      onToggleSelect(itemId)
    } else {
      // Plain click: Select only this row, or deselect if already the only selected
      if (selectedIds.has(itemId) && selectedIds.size === 1) {
        // Already selected and it's the only one - deselect
        onToggleSelect(itemId)
      } else {
        onSingleSelect(itemId)
      }
    }
  }, [itemIds, selectedIds, selectionAnchor, onSingleSelect, onToggleSelect, onRangeSelect, onAddToSelection])

  // Handle mouse down to start drag selection
  const handleMouseDown = useCallback((e: React.MouseEvent, rowIndex: number) => {
    // Only start drag on plain click (no modifiers)
    if (!e.metaKey && !e.shiftKey && e.button === 0) {
      setIsDragging(true)
      setDragStartIndex(rowIndex)
    }
  }, [])

  // Handle mouse enter during drag selection
  const handleMouseEnter = useCallback((rowIndex: number) => {
    if (isDragging && dragStartIndex !== null) {
      const start = Math.min(dragStartIndex, rowIndex)
      const end = Math.max(dragStartIndex, rowIndex)
      const rangeIds = itemIds.slice(start, end + 1)
      onRangeSelect(rangeIds, itemIds[dragStartIndex])
    }
  }, [isDragging, dragStartIndex, itemIds, onRangeSelect])

  // Global mouse up to end drag
  useEffect(() => {
    const handleMouseUp = () => {
      setIsDragging(false)
      setDragStartIndex(null)
    }
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [])

  return {
    isDragging,
    handleRowClick,
    handleMouseDown,
    handleMouseEnter,
  }
}
