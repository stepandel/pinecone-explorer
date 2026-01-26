import { useState, useEffect, useRef, useCallback } from 'react'
import { LocalVectorRecord, EditingState } from '../types/vectors'

/** Pending save state when embedding text field was modified */
export interface PendingEmbeddingSave {
  vectorId: string
  metadata: Record<string, unknown>
}

interface UseInlineEditingProps {
  /** All vectors in the table */
  vectors: LocalVectorRecord[]
  /** Callback to persist changes */
  onSave?: (vectorId: string, updates: { metadata?: Record<string, unknown>; regenerateEmbedding?: boolean }) => Promise<void>
  /** The metadata field used for embedding text (to detect when regeneration might be needed) */
  embeddingTextField?: string
  /** Whether the embedding text field is explicitly configured (index embed config or client override) */
  isEmbeddingFieldConfigured?: boolean
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
  /** Pending save that requires user confirmation for embedding regeneration */
  pendingEmbeddingSave: PendingEmbeddingSave | null
  /** Confirm the pending save with regeneration choice */
  confirmPendingSave: (regenerate: boolean) => Promise<void>
  /** Cancel the pending save */
  cancelPendingSave: () => void
  /** Whether the embedding field required dialog should be shown */
  showFieldRequiredDialog: boolean
  /** Dismiss the embedding field required dialog */
  dismissFieldRequiredDialog: () => void
}

/**
 * Custom hook for inline editing of vector metadata in a table.
 * Handles editing state, type preservation, keyboard shortcuts, and auto-focus.
 *
 * Uses refs for vectors lookup to avoid including the entire vectors array
 * in useCallback dependencies, which would cause callback recreation on every
 * vectors change (e.g., during scrolling or refetching).
 */
export function useInlineEditing({
  vectors,
  onSave,
  embeddingTextField,
  isEmbeddingFieldConfigured,
}: UseInlineEditingProps): UseInlineEditingReturn {
  const [editingState, setEditingState] = useState<EditingState | null>(null)
  const [pendingEmbeddingSave, setPendingEmbeddingSave] = useState<PendingEmbeddingSave | null>(null)
  const [showFieldRequiredDialog, setShowFieldRequiredDialog] = useState(false)
  const editingInputRef = useRef<HTMLInputElement>(null)

  // Store vectors in ref for stable lookup in callbacks
  const vectorsRef = useRef(vectors)
  useEffect(() => {
    vectorsRef.current = vectors
  }, [vectors])

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

  // Dismiss the embedding field required dialog
  const dismissFieldRequiredDialog = useCallback(() => {
    setShowFieldRequiredDialog(false)
  }, [])

  // Save editing changes
  const saveEditing = useCallback(async () => {
    if (!editingState || !onSave) return

    // Gate: require embedding field to be configured before saving
    if (!isEmbeddingFieldConfigured) {
      setShowFieldRequiredDialog(true)
      return
    }

    // Use ref to avoid vectors dependency
    const originalVec = vectorsRef.current.find(v => v.id === editingState.vectorId)
    if (!originalVec) return

    // Check if there are actual changes
    const hasMetaChanges = JSON.stringify(editingState.metadata) !== JSON.stringify(originalVec.metadata || {})

    if (hasMetaChanges) {
      // Check if the embedding text field was modified
      const textFieldChanged = embeddingTextField &&
        editingState.metadata[embeddingTextField] !== originalVec.metadata?.[embeddingTextField]

      if (textFieldChanged) {
        // Set pending state - user needs to confirm whether to regenerate embedding
        setPendingEmbeddingSave({
          vectorId: editingState.vectorId,
          metadata: editingState.metadata,
        })
        setEditingState(null)
        return
      }

      // No text field change - save directly
      try {
        await onSave(editingState.vectorId, { metadata: editingState.metadata })
      } catch (error) {
        console.error('Failed to update vector:', error)
      }
    }
    setEditingState(null)
  }, [editingState, onSave, embeddingTextField, isEmbeddingFieldConfigured])

  // Confirm the pending save with regeneration choice
  const confirmPendingSave = useCallback(async (regenerate: boolean) => {
    if (!pendingEmbeddingSave || !onSave) return

    try {
      await onSave(pendingEmbeddingSave.vectorId, {
        metadata: pendingEmbeddingSave.metadata,
        regenerateEmbedding: regenerate,
      })
    } catch (error) {
      console.error('Failed to update vector:', error)
    }
    setPendingEmbeddingSave(null)
  }, [pendingEmbeddingSave, onSave])

  // Cancel the pending save
  const cancelPendingSave = useCallback(() => {
    setPendingEmbeddingSave(null)
  }, [])

  // Handle editing field change with type preservation
  const handleEditChange = useCallback((field: string, value: string) => {
    if (!editingState) return

    // Use ref to avoid vectors dependency
    const originalVec = vectorsRef.current.find(v => v.id === editingState.vectorId)
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
  }, [editingState])

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
    pendingEmbeddingSave,
    confirmPendingSave,
    cancelPendingSave,
    showFieldRequiredDialog,
    dismissFieldRequiredDialog,
  }
}
