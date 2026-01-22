import { useState, useEffect, useRef, useCallback } from 'react'
import { LocalVectorRecord, EditingState } from '../types/vectors'

interface UseInlineEditingProps {
  /** All vectors in the table */
  vectors: LocalVectorRecord[]
  /** Callback to persist changes */
  onSave?: (vectorId: string, updates: { metadata?: Record<string, unknown> }) => Promise<void>
}

interface UseInlineEditingReturn {
  /** Current editing state, or null if not editing */
  editingState: EditingState | null
  /** Ref to attach to the first input for auto-focus */
  editingInputRef: React.RefObject<HTMLInputElement | null>
  /** Start editing a vector */
  startEditing: (vector: LocalVectorRecord) => void
  /** Cancel editing without saving */
  cancelEditing: () => void
  /** Save current edits */
  saveEditing: () => Promise<void>
  /** Handle field value change */
  handleEditChange: (field: string, value: string) => void
  /** Handle keyboard events (Escape to cancel, Enter to save) */
  handleEditKeyDown: (e: React.KeyboardEvent) => void
  /** Check if a specific vector is being edited */
  isEditing: (vectorId: string) => boolean
}

/**
 * Custom hook for inline editing of vector metadata in a table.
 * Handles editing state, type preservation, keyboard shortcuts, and auto-focus.
 */
export function useInlineEditing({
  vectors,
  onSave,
}: UseInlineEditingProps): UseInlineEditingReturn {
  const [editingState, setEditingState] = useState<EditingState | null>(null)
  const editingInputRef = useRef<HTMLInputElement>(null)

  // Start editing a vector
  const startEditing = useCallback((vec: LocalVectorRecord) => {
    if (!onSave) return
    setEditingState({
      vectorId: vec.id,
      metadata: vec.metadata ? { ...vec.metadata } : {},
    })
  }, [onSave])

  // Cancel editing
  const cancelEditing = useCallback(() => {
    setEditingState(null)
  }, [])

  // Save editing changes
  const saveEditing = useCallback(async () => {
    if (!editingState || !onSave) return

    const originalVec = vectors.find(v => v.id === editingState.vectorId)
    if (!originalVec) return

    // Check if there are actual changes
    const hasMetaChanges = JSON.stringify(editingState.metadata) !== JSON.stringify(originalVec.metadata || {})

    if (hasMetaChanges) {
      try {
        await onSave(editingState.vectorId, { metadata: editingState.metadata })
      } catch (error) {
        console.error('Failed to update vector:', error)
      }
    }
    setEditingState(null)
  }, [editingState, vectors, onSave])

  // Handle editing field change with type preservation
  const handleEditChange = useCallback((field: string, value: string) => {
    if (!editingState) return

    // Find original value to preserve type
    const originalVec = vectors.find(v => v.id === editingState.vectorId)
    const originalValue = originalVec?.metadata?.[field]
    let parsedValue: unknown = value

    // Try to preserve the original type
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
  }, [editingState, vectors])

  // Handle keyboard events
  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEditing()
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      saveEditing()
    }
  }, [cancelEditing, saveEditing])

  // Check if a specific vector is being edited
  const isEditing = useCallback((vectorId: string) => {
    return editingState?.vectorId === vectorId
  }, [editingState?.vectorId])

  // Focus the first input when editing starts
  useEffect(() => {
    if (editingState && editingInputRef.current) {
      editingInputRef.current.focus()
      editingInputRef.current.select()
    }
  }, [editingState?.vectorId])

  return {
    editingState,
    editingInputRef,
    startEditing,
    cancelEditing,
    saveEditing,
    handleEditChange,
    handleEditKeyDown,
    isEditing,
  }
}
