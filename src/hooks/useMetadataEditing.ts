import { useState, useCallback, useEffect, useRef } from 'react'
import { TypedMetadataRecord, TypedMetadataField, MetadataValueType } from '../types/metadata'

interface UseMetadataEditingProps {
  /** Initial metadata from the vector */
  initialMetadata: Record<string, unknown> | null
  /** Vector ID - used to detect when to reset state (when switching vectors) */
  vectorId: string
  /** Whether this is a draft vector */
  isDraft: boolean
  /** Callback when draft changes */
  onDraftChange?: (updates: { metadata?: Record<string, unknown> }) => void
}

interface UseMetadataEditingReturn {
  /** Current draft metadata state */
  draftMetadata: Record<string, unknown> | null
  /** Whether metadata has changed from original */
  hasChanges: boolean
  /** Reset to original metadata */
  reset: () => void
  /** Update draft metadata directly */
  setDraftMetadata: (metadata: Record<string, unknown> | null) => void
  /** Handle metadata value change */
  handleChange: (key: string, value: string) => void
  /** Add a new metadata field (for first vector drafts) */
  addField: () => void
  /** Remove a metadata field */
  removeField: (key: string) => void
  /** Rename a metadata field key */
  renameField: (oldKey: string, newKey: string) => void
  /** Change a field's type */
  changeFieldType: (key: string, newType: MetadataValueType) => void
}

/**
 * Custom hook for managing metadata editing state.
 * Handles both regular metadata updates and typed metadata for drafts.
 */
export function useMetadataEditing({
  initialMetadata,
  vectorId,
  isDraft,
  onDraftChange,
}: UseMetadataEditingProps): UseMetadataEditingReturn {
  const [draftMetadata, setDraftMetadata] = useState(initialMetadata)
  const prevVectorIdRef = useRef(vectorId)
  const isInitializedRef = useRef(initialMetadata !== null)

  // Reset when switching vectors or when initial data loads
  useEffect(() => {
    const vectorChanged = prevVectorIdRef.current !== vectorId
    const dataJustLoaded = !isInitializedRef.current && initialMetadata !== null

    if (vectorChanged || dataJustLoaded) {
      setDraftMetadata(initialMetadata)
      prevVectorIdRef.current = vectorId
      isInitializedRef.current = initialMetadata !== null
    }
  }, [vectorId, initialMetadata])

  const hasChanges = JSON.stringify(draftMetadata) !== JSON.stringify(initialMetadata)

  const reset = useCallback(() => {
    setDraftMetadata(initialMetadata)
  }, [initialMetadata])

  // Notify parent of changes for drafts
  const notifyDraftChange = useCallback((newMetadata: Record<string, unknown> | null) => {
    if (isDraft && onDraftChange && newMetadata) {
      onDraftChange({ metadata: newMetadata })
    }
  }, [isDraft, onDraftChange])

  const handleChange = useCallback((key: string, value: string) => {
    if (!draftMetadata) return

    const existingField = draftMetadata[key]
    const isTypedField = existingField && typeof existingField === 'object' && 'type' in existingField

    let newMetadata: Record<string, unknown>

    if (isDraft && isTypedField) {
      // For drafts with typed fields, update the value property
      const typedField = existingField as TypedMetadataField
      newMetadata = {
        ...draftMetadata,
        [key]: { ...typedField, value }
      }
    } else {
      // For existing vectors, try to preserve original type
      const originalValue = initialMetadata?.[key]
      let parsedValue: unknown = value

      if (typeof originalValue === 'number') {
        const num = Number(value)
        if (!isNaN(num)) parsedValue = num
      } else if (typeof originalValue === 'boolean') {
        if (value.toLowerCase() === 'true') parsedValue = true
        else if (value.toLowerCase() === 'false') parsedValue = false
      }

      newMetadata = { ...draftMetadata, [key]: parsedValue }
    }

    setDraftMetadata(newMetadata)
    notifyDraftChange(newMetadata)
  }, [draftMetadata, initialMetadata, isDraft, notifyDraftChange])

  const addField = useCallback(() => {
    const currentMetadata = (draftMetadata || {}) as TypedMetadataRecord
    let keyNum = 1
    let newKey = `key${keyNum}`
    while (newKey in currentMetadata) {
      keyNum++
      newKey = `key${keyNum}`
    }
    const newMetadata: TypedMetadataRecord = {
      ...currentMetadata,
      [newKey]: { value: '', type: 'string' }
    }
    setDraftMetadata(newMetadata)
    notifyDraftChange(newMetadata)
  }, [draftMetadata, notifyDraftChange])

  const removeField = useCallback((keyToRemove: string) => {
    if (!draftMetadata) return
    const { [keyToRemove]: _, ...rest } = draftMetadata as TypedMetadataRecord
    setDraftMetadata(rest)
    notifyDraftChange(rest)
  }, [draftMetadata, notifyDraftChange])

  const renameField = useCallback((oldKey: string, newKey: string) => {
    if (!draftMetadata || oldKey === newKey) return
    const typedMetadata = draftMetadata as TypedMetadataRecord
    const { [oldKey]: field, ...rest } = typedMetadata
    const newMetadata: TypedMetadataRecord = { ...rest, [newKey]: field }
    setDraftMetadata(newMetadata)
    notifyDraftChange(newMetadata)
  }, [draftMetadata, notifyDraftChange])

  const changeFieldType = useCallback((key: string, newType: MetadataValueType) => {
    if (!draftMetadata) return
    const typedMetadata = draftMetadata as TypedMetadataRecord
    const field = typedMetadata[key]
    if (!field) return
    const newMetadata: TypedMetadataRecord = {
      ...typedMetadata,
      [key]: { ...field, type: newType }
    }
    setDraftMetadata(newMetadata)
    notifyDraftChange(newMetadata)
  }, [draftMetadata, notifyDraftChange])

  return {
    draftMetadata,
    hasChanges,
    reset,
    setDraftMetadata,
    handleChange,
    addField,
    removeField,
    renameField,
    changeFieldType,
  }
}
