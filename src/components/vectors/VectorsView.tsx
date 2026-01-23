import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { usePinecone } from '../../providers/PineconeProvider'
import { usePanel } from '../../context/PanelContext'
import { useVectorsQuery, useIndexesQuery, useCreateVectorMutation, useDeleteVectorsMutation, useBatchImportMutation, useUpdateVectorMutation, useQueryVectorsMutation } from '../../hooks/usePineconeQueries'
import { useClipboard } from '../../context/ClipboardContext'
import { SHORTCUTS, matchesShortcut } from '../../constants/keyboard-shortcuts'
import VectorsTable from './VectorsTable'
import { FilterRow as FilterRowType, MetadataOperator } from '../../types/filters'
import { TypedMetadataRecord, TypedMetadataField, typedMetadataToPineconeFormat, validateMetadataValue } from '../../types/metadata'
import { LocalVectorRecord, DraftVector, parseFilterValue } from '../../types/vectors'
import { EmbeddingFunctionSelector } from './EmbeddingFunctionSelector'
import { FilterRow } from '../filters/FilterRow'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'

interface VectorsViewProps {
  indexName: string
  namespace?: string
  // Multi-select props
  selectedVectorIds: Set<string>
  primarySelectedVectorId: string | null
  selectionAnchor: string | null
  onSingleSelect: (id: string) => void
  onToggleSelect: (id: string) => void
  onRangeSelect: (ids: string[], newAnchor?: string) => void
  onAddToSelection: (ids: string[]) => void
  onClearSelection: () => void
  onSetSelectionAnchor: (id: string | null) => void
  onSelectedVectorChange: (vector: LocalVectorRecord | null, isDraft: boolean) => void
  // Expose draft change handler for external updates (e.g., from detail panel)
  onExposeDraftHandler?: (handler: ((updates: { id?: string; metadata?: Record<string, unknown> }) => void) | null) => void
  // Callback to notify parent if current draft is for the first vector (empty index)
  onIsFirstVectorChange?: (isFirst: boolean) => void
}

function createDefaultFilterRow(): FilterRowType {
  return {
    id: crypto.randomUUID(),
    type: 'search',
    searchValue: '',
  }
}

export default function VectorsView({
  indexName,
  namespace,
  selectedVectorIds,
  primarySelectedVectorId,
  selectionAnchor,
  onSingleSelect,
  onToggleSelect,
  onRangeSelect,
  onAddToSelection,
  onClearSelection,
  onSetSelectionAnchor,
  onSelectedVectorChange,
  onExposeDraftHandler,
  onIsFirstVectorChange,
}: VectorsViewProps) {
  const { currentProfile } = usePinecone()
  const { setEmbeddingTextField } = usePanel()
  const [filterRows, setFilterRows] = useState<FilterRowType[]>([createDefaultFilterRow()])
  const [nResults, setNResults] = useState(10)

  // Draft vectors state - supports single new vector or multiple pasted vectors
  const [draftVectors, setDraftVectors] = useState<DraftVector[]>([])

  // Validation error for draft vectors
  const [draftError, setDraftError] = useState<string | null>(null)

  // Helper to check if we have drafts
  const hasDrafts = draftVectors.length > 0
  // For backwards compatibility with single draft operations
  const draftVector = draftVectors.length === 1 ? draftVectors[0] : null

  // Marked for deletion state (set of vector IDs)
  const [markedForDeletion, setMarkedForDeletion] = useState<Set<string>>(new Set())

  // Deletion error state
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Namespace title truncation detection
  const namespaceTitleRef = useRef<HTMLSpanElement>(null)
  const [isNamespaceTruncated, setIsNamespaceTruncated] = useState(false)

  // Check if namespace title is truncated
  useEffect(() => {
    const checkTruncation = () => {
      const el = namespaceTitleRef.current
      if (el) {
        setIsNamespaceTruncated(el.scrollWidth > el.clientWidth)
      }
    }
    checkTruncation()
    window.addEventListener('resize', checkTruncation)
    return () => window.removeEventListener('resize', checkTruncation)
  }, [namespace])

  // Create vector mutation
  const createMutation = useCreateVectorMutation(
    currentProfile?.id || '',
    indexName,
    namespace
  )

  // Delete vectors mutation
  const deleteMutation = useDeleteVectorsMutation(
    currentProfile?.id || '',
    indexName,
    namespace
  )

  // Batch import mutation (for pasting)
  const createBatchMutation = useBatchImportMutation(
    currentProfile?.id || '',
    indexName,
    namespace
  )

  // Update vector mutation (for inline editing)
  const updateMutation = useUpdateVectorMutation(
    currentProfile?.id || '',
    indexName,
    namespace
  )

  // Query vectors mutation (for semantic search)
  const queryMutation = useQueryVectorsMutation(currentProfile?.id || '')

  // Search results state
  const [searchResults, setSearchResults] = useState<LocalVectorRecord[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  // Clipboard context
  const { clipboard, copyVectors, hasCopiedVectors } = useClipboard()

  // Fetch indexes to get the current index's info
  const { data: indexes = [] } = useIndexesQuery(currentProfile?.id || null)
  const currentIndex = indexes.find((c: IndexInfo) => c.name === indexName)

  // Embedding function override state
  const [embeddingOverride, setEmbeddingOverride] = useState<EmbeddingConfig | null>(null)
  const [textFieldOverride, setTextFieldOverride] = useState<string | null>(null)

  // Compute effective text field: index embed > client override > default '_text'
  const effectiveTextField = currentIndex?.embed?.fieldMap?.text || textFieldOverride || '_text'

  // Sync effective text field to context for VectorDetailPanel
  useEffect(() => {
    setEmbeddingTextField(effectiveTextField)
  }, [effectiveTextField, setEmbeddingTextField])

  // Fetch embedding and text field overrides when index changes
  useEffect(() => {
    const fetchOverrides = async () => {
      if (!currentProfile?.id || !indexName) return
      try {
        const [embeddingOvr, textFieldOvr] = await Promise.all([
          window.electronAPI.profiles.getEmbeddingOverride(currentProfile.id, indexName),
          window.electronAPI.profiles.getTextFieldOverride(currentProfile.id, indexName),
        ])
        setEmbeddingOverride(embeddingOvr)
        setTextFieldOverride(textFieldOvr)
      } catch (err) {
        console.error('Failed to fetch overrides:', err)
      }
    }
    fetchOverrides()
  }, [currentProfile?.id, indexName])

  const handleSaveOverride = useCallback(async (override: EmbeddingConfig) => {
    if (!currentProfile?.id) return
    await window.electronAPI.profiles.setEmbeddingOverride(
      currentProfile.id,
      indexName,
      override
    )
    setEmbeddingOverride(override)
  }, [currentProfile?.id, indexName])

  const handleClearOverride = useCallback(async () => {
    if (!currentProfile?.id) return
    await window.electronAPI.profiles.clearEmbeddingOverride(
      currentProfile.id,
      indexName
    )
    setEmbeddingOverride(null)
  }, [currentProfile?.id, indexName])

  const handleSaveTextFieldOverride = useCallback(async (textField: string) => {
    if (!currentProfile?.id) return
    await window.electronAPI.profiles.setTextFieldOverride(
      currentProfile.id,
      indexName,
      textField
    )
    setTextFieldOverride(textField)
  }, [currentProfile?.id, indexName])

  const handleClearTextFieldOverride = useCallback(async () => {
    if (!currentProfile?.id) return
    await window.electronAPI.profiles.clearTextFieldOverride(
      currentProfile.id,
      indexName
    )
    setTextFieldOverride(null)
  }, [currentProfile?.id, indexName])

  // Reset filters and deletion marks when index changes
  useEffect(() => {
    setFilterRows([createDefaultFilterRow()])
    setNResults(10)
    setMarkedForDeletion(new Set())
    setDraftVectors([])
    setDraftError(null)
    setSearchResults(null)
    setIsSearching(false)
  }, [indexName])

  // Handle search execution
  const handleSearch = useCallback(async () => {
    const searchRow = filterRows.find(r => r.type === 'search' && r.searchValue?.trim())
    const queryText = searchRow?.searchValue?.trim()

    if (!queryText) {
      // Clear search results if no query
      setSearchResults(null)
      return
    }

    // Build metadata filter from filter rows
    const metadataRows = filterRows.filter(
      r => r.type === 'metadata' && r.metadataKey?.trim() && r.metadataValue?.trim()
    )

    const metadataFilter = metadataRows.length > 0
      ? metadataRows.reduce((acc, row) => ({
          ...acc,
          [row.metadataKey!]: {
            [row.operator || '$eq']: parseFilterValue(row.metadataValue!, row.operator || '$eq')
          },
        }), {})
      : undefined

    setIsSearching(true)
    try {
      const result = await queryMutation.mutateAsync({
        indexName: indexName,
        namespace,
        queryText,
        topK: nResults || 10,
        filter: metadataFilter,
        includeValues: true,
        includeMetadata: true,
      })

      // Convert query results to LocalVectorRecord format
      const results: LocalVectorRecord[] = result.matches.map(match => ({
        id: match.id,
        metadata: match.metadata || null,
        embedding: match.values || null,
      }))
      setSearchResults(results)
    } catch (error) {
      console.error('Search failed:', error)
      setSearchResults(null)
    } finally {
      setIsSearching(false)
    }
  }, [filterRows, indexName, namespace, nResults, queryMutation])

  // Use React Query for vectors with debouncing via staleTime
  const {
    data: queryData,
    isLoading: loading,
    error,
    isFetching,
  } = useVectorsQuery(currentProfile?.id || null, indexName, namespace)

  // Map vectors to record format
  const rawVectors: LocalVectorRecord[] = useMemo(() => {
    const vecs = queryData?.vectors ?? []
    return vecs.map((vec: VectorRecord) => ({
      id: vec.id,
      metadata: vec.metadata || null,
      embedding: vec.values || null,
    }))
  }, [queryData?.vectors])
  const fetchTimeMs = queryData?.fetchTimeMs ?? null

  // Extract ID filter value for client-side filtering
  const idFilterValue = useMemo(() => {
    const selectRow = filterRows.find(r => r.type === 'select' && r.selectValue?.trim())
    return selectRow?.selectValue?.trim().toLowerCase() || ''
  }, [filterRows])

  // Apply client-side ID filter (case-insensitive "includes" match)
  // Use search results if available, otherwise use raw vectors
  const vectors = useMemo(() => {
    const baseVectors = searchResults !== null ? searchResults : rawVectors
    if (!idFilterValue) {
      return baseVectors
    }
    return baseVectors.filter((vec: LocalVectorRecord) =>
      vec.id.toLowerCase().includes(idFilterValue)
    )
  }, [rawVectors, searchResults, idFilterValue])

  // Extract unique metadata fields from vectors (needed for draft creation)
  const metadataFields = useMemo(() => {
    const fields = new Set<string>()
    vectors.forEach((vec: LocalVectorRecord) => {
      if (vec.metadata) {
        Object.keys(vec.metadata).forEach(key => fields.add(key))
      }
    })
    return Array.from(fields).sort()
  }, [vectors])

  // Extract text fields (string-type metadata fields) for embedding text field dropdown
  const availableTextFields = useMemo(() => {
    const textFields = new Set<string>()
    vectors.forEach((vec: LocalVectorRecord) => {
      if (vec.metadata) {
        Object.entries(vec.metadata).forEach(([key, value]) => {
          if (typeof value === 'string') {
            textFields.add(key)
          }
        })
      }
    })
    return Array.from(textFields).sort()
  }, [vectors])

  // Filter row handlers
  const handleFilterRowChange = useCallback((id: string, updates: Partial<FilterRowType>) => {
    setFilterRows(prev => prev.map(row =>
      row.id === id ? { ...row, ...updates } : row
    ))
    // Clear search results if search value is cleared
    if ('searchValue' in updates && !updates.searchValue?.trim()) {
      setSearchResults(null)
    }
  }, [])

  const handleAddFilterRow = useCallback(() => {
    setFilterRows(prev => [...prev, {
      id: crypto.randomUUID(),
      type: 'metadata',
      metadataKey: '',
      operator: '$eq' as MetadataOperator,
      metadataValue: '',
    }])
  }, [])

  const handleRemoveFilterRow = useCallback((id: string) => {
    setFilterRows(prev => {
      const filtered = prev.filter(row => row.id !== id)
      // Always keep at least one row
      return filtered.length > 0 ? filtered : [createDefaultFilterRow()]
    })
  }, [])

  const hasActiveFilters = filterRows.some(row =>
    (row.type === 'search' && row.searchValue?.trim()) ||
    (row.type === 'metadata' && row.metadataKey?.trim() && row.metadataValue?.trim()) ||
    (row.type === 'select' && row.selectValue?.trim())
  )

  // Draft vector handlers
  const handleStartCreate = useCallback(() => {
    const newId = crypto.randomUUID()
    // Check if this is the first vector (index is empty)
    const isFirstVector = vectors.length === 0
    // Initialize metadata with same keys as existing vectors (empty values)
    // If first vector, start with empty metadata (user will add fields)
    const initialMetadata: TypedMetadataRecord = {}
    if (!isFirstVector) {
      // Infer types from existing vectors
      metadataFields.forEach(key => {
        // Find the first vector with this metadata key to infer type
        const existingVec = vectors.find((v: LocalVectorRecord) => v.metadata && key in v.metadata)
        const existingValue = existingVec?.metadata?.[key]
        let inferredType: 'string' | 'number' | 'boolean' = 'string'
        if (typeof existingValue === 'number') inferredType = 'number'
        else if (typeof existingValue === 'boolean') inferredType = 'boolean'
        initialMetadata[key] = { value: '', type: inferredType }
      })
    }
    setDraftVectors([{
      id: newId,
      metadata: initialMetadata,
    }])
    // Select the draft so it shows in the detail panel
    onSingleSelect(newId)
    // Notify parent about first vector status
    onIsFirstVectorChange?.(isFirstVector)
  }, [onSingleSelect, metadataFields, vectors.length, onIsFirstVectorChange])

  const handleDraftChange = useCallback((draft: DraftVector, index: number = 0) => {
    setDraftVectors(prev => {
      const next = [...prev]
      next[index] = draft
      return next
    })
    setDraftError(null) // Clear error when user makes changes
  }, [])

  // Handler for external draft updates (from detail panel) - only works for single draft
  const handleExternalDraftUpdate = useCallback((updates: { id?: string; metadata?: Record<string, unknown> }) => {
    setDraftVectors((prev) => {
      if (prev.length !== 1) return prev
      const newId = updates.id !== undefined ? updates.id : prev[0].id
      return [{
        ...prev[0],
        id: newId,
        metadata: updates.metadata !== undefined ? (updates.metadata as TypedMetadataRecord) : prev[0].metadata,
      }]
    })
    // Also update the primary selected vector ID if ID changed
    if (updates.id !== undefined) {
      onSingleSelect(updates.id)
    }
    setDraftError(null) // Clear error when user makes changes
  }, [onSingleSelect])

  // Expose the draft update handler to parent (only for single draft)
  useEffect(() => {
    if (onExposeDraftHandler) {
      onExposeDraftHandler(draftVectors.length === 1 ? handleExternalDraftUpdate : null)
    }
  }, [onExposeDraftHandler, draftVectors.length, handleExternalDraftUpdate])

  const handleCancelDraft = useCallback(() => {
    setDraftVectors([])
    setDraftError(null)
    onClearSelection() // Deselect when cancelling
    onIsFirstVectorChange?.(false) // Reset first vector flag
  }, [onClearSelection, onIsFirstVectorChange])

  const handleSaveDraft = useCallback(async () => {
    if (draftVectors.length === 0) return
    setDraftError(null)

    // Validate all drafts
    for (let i = 0; i < draftVectors.length; i++) {
      const draft = draftVectors[i]
      if (!draft.id.trim()) {
        setDraftError(`Vector ${i + 1}: ID is required`)
        return
      }

      // Validate metadata types before saving
      for (const [key, field] of Object.entries(draft.metadata)) {
        if (field && typeof field === 'object' && 'value' in field && 'type' in field) {
          const typedField = field as TypedMetadataField
          const error = validateMetadataValue(typedField.value, typedField.type)
          if (error) {
            setDraftError(`Vector ${i + 1} - Metadata "${key}": ${error}`)
            return
          }
        }
      }
    }

    try {
      if (draftVectors.length === 1) {
        // Single vector - use single create mutation
        const draft = draftVectors[0]
        const metadata = typedMetadataToPineconeFormat(draft.metadata)
        // Extract text from the embedding text field if present
        const text = metadata?.[effectiveTextField] as string | undefined
        const hasText = typeof text === 'string' && text.trim().length > 0
        await createMutation.mutateAsync({
          id: draft.id,
          metadata,
          text: hasText ? text : undefined,
          textField: hasText ? effectiveTextField : undefined,
          generateEmbedding: hasText,
        })
      } else {
        // Multiple vectors - use batch import mutation
        const vectorsToCreate = draftVectors.map(draft => {
          const metadata = typedMetadataToPineconeFormat(draft.metadata)
          const text = metadata?.[effectiveTextField] as string | undefined
          return {
            id: draft.id,
            metadata,
            text: typeof text === 'string' && text.trim().length > 0 ? text : undefined,
          }
        })
        // Generate embeddings if any vector has text
        const anyHasText = vectorsToCreate.some(v => v.text)
        await createBatchMutation.mutateAsync({
          vectors: vectorsToCreate,
          generateEmbeddings: anyHasText,
          textField: anyHasText ? effectiveTextField : undefined,
        })
      }
      setDraftVectors([])
      setDraftError(null)
      onClearSelection() // Deselect after saving
      onIsFirstVectorChange?.(false) // Reset first vector flag
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create vector(s)'
      setDraftError(message)
    }
  }, [draftVectors, createMutation, createBatchMutation, onClearSelection, onIsFirstVectorChange, effectiveTextField])

  // Toggle deletion mark for all selected vectors
  const handleToggleDeletion = useCallback(() => {
    if (selectedVectorIds.size === 0) return
    // Filter out drafts from selection
    const draftIds = new Set(draftVectors.map(d => d.id))
    const idsToMark = Array.from(selectedVectorIds).filter(
      id => !draftIds.has(id)
    )
    if (idsToMark.length === 0) return

    setMarkedForDeletion(prev => {
      const next = new Set(prev)
      // Check if all selected are already marked
      const allMarked = idsToMark.every(id => prev.has(id))
      if (allMarked) {
        // Unmark all
        idsToMark.forEach(id => next.delete(id))
      } else {
        // Mark all
        idsToMark.forEach(id => next.add(id))
      }
      return next
    })
  }, [selectedVectorIds, draftVectors])

  // Commit deletions
  const handleCommitDeletions = useCallback(async () => {
    if (markedForDeletion.size === 0) return
    setDeleteError(null)

    try {
      await deleteMutation.mutateAsync(Array.from(markedForDeletion))
      // Clear marked items and clear selection if any selected vectors were deleted
      const deletedSelected = Array.from(selectedVectorIds).some(id => markedForDeletion.has(id))
      if (deletedSelected) {
        onClearSelection()
      }
      setMarkedForDeletion(new Set())
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete vectors'
      setDeleteError(message)
    }
  }, [markedForDeletion, deleteMutation, selectedVectorIds, onClearSelection])

  // Copy selected vectors to clipboard
  const handleCopyVectors = useCallback(() => {
    if (selectedVectorIds.size === 0 || !currentProfile?.id) return
    // Filter out drafts from selection and get vector data
    const draftIds = new Set(draftVectors.map((d: DraftVector) => d.id))
    const vecsToCopy = vectors.filter(
      (vec: LocalVectorRecord) => selectedVectorIds.has(vec.id) && !draftIds.has(vec.id)
    )
    if (vecsToCopy.length === 0) return
    // Convert to global VectorRecord format for clipboard
    const vectorsToCopy: VectorRecord[] = vecsToCopy.map((vec: LocalVectorRecord) => ({
      id: vec.id,
      values: vec.embedding || [],
      metadata: vec.metadata || undefined,
    }))
    copyVectors(vectorsToCopy, indexName, currentProfile.id)
  }, [selectedVectorIds, vectors, draftVectors, indexName, currentProfile?.id, copyVectors])

  // Resolve ID conflicts for pasting
  const resolveConflictingIds = useCallback((
    vectorsToPaste: Array<{ id: string; metadata: Record<string, unknown> | null }>,
    existingIds: Set<string>
  ) => {
    const usedIds = new Set(existingIds)
    return vectorsToPaste.map(vec => {
      let newId = vec.id
      let copyNum = 0

      while (usedIds.has(newId)) {
        copyNum++
        newId = copyNum === 1
          ? `${vec.id}-copy`
          : `${vec.id}-copy-${copyNum}`
      }

      usedIds.add(newId)
      return { ...vec, id: newId }
    })
  }, [])

  // Infer metadata field types from existing vectors
  const inferMetadataTypes = useCallback((): Record<string, 'string' | 'number' | 'boolean'> => {
    const types: Record<string, 'string' | 'number' | 'boolean'> = {}
    vectors.forEach((vec: LocalVectorRecord) => {
      if (vec.metadata) {
        Object.entries(vec.metadata).forEach(([key, value]) => {
          if (!(key in types)) {
            if (typeof value === 'number') types[key] = 'number'
            else if (typeof value === 'boolean') types[key] = 'boolean'
            else types[key] = 'string'
          }
        })
      }
    })
    return types
  }, [vectors])

  // Paste vectors from clipboard - creates draft vectors for review
  const handlePasteVectors = useCallback(() => {
    if (!clipboard || clipboard.type !== 'vectors' || !currentProfile?.id) return
    if (hasDrafts) return // Don't paste if there are already drafts

    // Get existing vector IDs (including any current drafts)
    const existingIds = new Set<string>(vectors.map((v: LocalVectorRecord) => v.id))

    // Resolve any ID conflicts
    const resolvedVecs = resolveConflictingIds(clipboard.vectors, existingIds)

    // Infer metadata types from existing vectors
    const existingTypes = inferMetadataTypes()

    // Convert to draft vectors with proper metadata typing
    const drafts: DraftVector[] = resolvedVecs.map(vec => {
      const typedMetadata: TypedMetadataRecord = {}

      // Process each metadata field from the pasted vector
      if (vec.metadata) {
        Object.entries(vec.metadata).forEach(([key, value]) => {
          const expectedType = existingTypes[key]
          const actualType = typeof value

          if (expectedType) {
            // We have a type expectation from existing vectors
            if (
              (expectedType === 'number' && actualType === 'number') ||
              (expectedType === 'boolean' && actualType === 'boolean') ||
              (expectedType === 'string' && actualType === 'string')
            ) {
              // Types match - use the value
              typedMetadata[key] = { value: String(value), type: expectedType }
            } else {
              // Types don't match - leave blank
              typedMetadata[key] = { value: '', type: expectedType }
            }
          } else {
            // New metadata key not in existing vectors - infer type from value
            let inferredType: 'string' | 'number' | 'boolean' = 'string'
            if (actualType === 'number') inferredType = 'number'
            else if (actualType === 'boolean') inferredType = 'boolean'
            typedMetadata[key] = { value: String(value), type: inferredType }
          }
        })
      }

      // Add any metadata fields that exist in the index but not in the pasted vector
      Object.entries(existingTypes).forEach(([key, type]) => {
        if (!(key in typedMetadata)) {
          typedMetadata[key] = { value: '', type }
        }
      })

      return {
        id: vec.id,
        metadata: typedMetadata,
      }
    })

    setDraftVectors(drafts)
    // Select the first draft
    if (drafts.length > 0) {
      onSingleSelect(drafts[0].id)
    }
  }, [clipboard, currentProfile?.id, vectors, hasDrafts, resolveConflictingIds, inferMetadataTypes, onSingleSelect])

  // Context menu handler for vector row
  const handleVectorContextMenu = useCallback((e: React.MouseEvent, vectorId: string) => {
    e.preventDefault()
    e.stopPropagation()
    window.electronAPI.contextMenu.showVectorMenu(vectorId, { hasCopiedVectors: hasCopiedVectors })
  }, [hasCopiedVectors])

  // Context menu handler for empty space in table
  const handleTableContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    window.electronAPI.contextMenu.showVectorsPanelMenu({ hasCopiedVectors: hasCopiedVectors })
  }, [hasCopiedVectors])

  // Inline vector update handler
  const handleInlineVectorUpdate = useCallback(async (
    vectorId: string,
    updates: { metadata?: Record<string, unknown>; regenerateEmbedding?: boolean }
  ) => {
    await updateMutation.mutateAsync({
      id: vectorId,
      metadata: updates.metadata as Record<string, string | number | boolean> | undefined,
      regenerateEmbedding: updates.regenerateEmbedding,
      textField: effectiveTextField,
    })
  }, [updateMutation, effectiveTextField])

  // Context menu action listener
  useEffect(() => {
    const unsubscribe = window.electronAPI.contextMenu.onVectorAction((data: { action: string; vectorId?: string }) => {
      if (data.action === 'copy') {
        handleCopyVectors()
      } else if (data.action === 'paste') {
        handlePasteVectors()
      } else if (data.action === 'delete' && data.vectorId) {
        // Select and mark for deletion
        onSingleSelect(data.vectorId)
        setMarkedForDeletion(new Set([data.vectorId]))
      }
    })
    return unsubscribe
  }, [handleCopyVectors, handlePasteVectors, onSingleSelect])

  // Select all vectors handler
  const handleSelectAllVectors = useCallback(() => {
    if (vectors.length > 0) {
      const allIds = vectors.map((v: LocalVectorRecord) => v.id)
      onRangeSelect(allIds, allIds[0])
    }
  }, [vectors, onRangeSelect])

  // Clear all filters handler
  const handleClearAllFilters = useCallback(() => {
    setFilterRows([createDefaultFilterRow()])
    setNResults(10)
    setSearchResults(null)
  }, [])

  // Menu event listeners (from native app menu)
  useEffect(() => {
    // New vector
    const handleMenuNewVector = () => {
      handleStartCreate()
    }

    // Delete selected
    const handleMenuDeleteSelected = () => {
      if (selectedVectorIds.size > 0 && !hasDrafts) {
        handleToggleDeletion()
      }
    }

    // Copy vectors
    const handleMenuCopyVectors = () => {
      handleCopyVectors()
    }

    // Paste vectors
    const handleMenuPasteVectors = () => {
      handlePasteVectors()
    }

    // Select all vectors
    const handleMenuSelectAll = () => {
      handleSelectAllVectors()
    }

    // Focus search
    const handleMenuFocusSearch = () => {
      // Focus the first search input in the filter rows
      const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement
      if (searchInput) {
        searchInput.focus()
        searchInput.select()
      }
    }

    // Clear filters
    const handleMenuClearFilters = () => {
      handleClearAllFilters()
    }

    // Configure embedding
    const handleMenuConfigureEmbedding = () => {
      // Click the embedding function selector button
      const embeddingButton = document.querySelector('[data-embedding-selector]') as HTMLButtonElement
      if (embeddingButton) {
        embeddingButton.click()
      }
    }

    // Edit vector
    const handleMenuEditVector = () => {
      // This triggers inline editing - implementation depends on your table structure
      // For now, we'll dispatch a custom event that VectorsTable can listen to
      if (primarySelectedVectorId) {
        window.dispatchEvent(new CustomEvent('menu:trigger-edit', { detail: { vectorId: primarySelectedVectorId } }))
      }
    }

    // Listen for menu events dispatched from useMenuHandlers
    window.addEventListener('menu:new-vector', handleMenuNewVector)
    window.addEventListener('menu:delete-selected', handleMenuDeleteSelected)
    window.addEventListener('menu:copy-vectors', handleMenuCopyVectors)
    window.addEventListener('menu:paste-vectors', handleMenuPasteVectors)
    window.addEventListener('menu:select-all-vectors', handleMenuSelectAll)
    window.addEventListener('menu:focus-search', handleMenuFocusSearch)
    window.addEventListener('menu:clear-filters', handleMenuClearFilters)
    window.addEventListener('menu:configure-embedding', handleMenuConfigureEmbedding)
    window.addEventListener('menu:edit-vector', handleMenuEditVector)

    return () => {
      window.removeEventListener('menu:new-vector', handleMenuNewVector)
      window.removeEventListener('menu:delete-selected', handleMenuDeleteSelected)
      window.removeEventListener('menu:copy-vectors', handleMenuCopyVectors)
      window.removeEventListener('menu:paste-vectors', handleMenuPasteVectors)
      window.removeEventListener('menu:select-all-vectors', handleMenuSelectAll)
      window.removeEventListener('menu:focus-search', handleMenuFocusSearch)
      window.removeEventListener('menu:clear-filters', handleMenuClearFilters)
      window.removeEventListener('menu:configure-embedding', handleMenuConfigureEmbedding)
      window.removeEventListener('menu:edit-vector', handleMenuEditVector)
    }
  }, [
    handleStartCreate,
    selectedVectorIds,
    hasDrafts,
    handleToggleDeletion,
    handleCopyVectors,
    handlePasteVectors,
    handleSelectAllVectors,
    handleClearAllFilters,
    primarySelectedVectorId,
  ])

  // Keyboard shortcuts - using centralized SHORTCUTS definitions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Context checks for conditional shortcuts
      const target = e.target as HTMLElement
      const isInputting = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      const hasTextSelection = (window.getSelection()?.toString() || '').length > 0

      // Command+S or Command+Enter to save drafts or commit deletions
      if (matchesShortcut(e, SHORTCUTS.SAVE) || matchesShortcut(e, SHORTCUTS.SAVE_ENTER)) {
        e.preventDefault()
        if (hasDrafts) {
          handleSaveDraft()
        } else if (markedForDeletion.size > 0) {
          handleCommitDeletions()
        }
      }
      // Escape or Command+Z to cancel drafts
      if ((matchesShortcut(e, SHORTCUTS.CANCEL) || matchesShortcut(e, SHORTCUTS.UNDO)) && hasDrafts) {
        e.preventDefault()
        handleCancelDraft()
      }
      // Escape or Command+Z to cancel deletion marks (when no drafts)
      if ((matchesShortcut(e, SHORTCUTS.CANCEL) || matchesShortcut(e, SHORTCUTS.UNDO)) && markedForDeletion.size > 0 && !hasDrafts) {
        e.preventDefault()
        setMarkedForDeletion(new Set())
        setDeleteError(null)
      }
      // Command+Delete/Backspace to toggle deletion mark
      if (matchesShortcut(e, SHORTCUTS.DELETE_VECTORS) && !hasDrafts) {
        if (isInputting) return
        e.preventDefault()
        handleToggleDeletion()
      }
      // Command+C to copy selected vectors (but not if text is selected - let native copy work)
      if (matchesShortcut(e, SHORTCUTS.COPY_VECTORS) && selectedVectorIds.size > 0 && !hasDrafts && !isInputting && !hasTextSelection) {
        e.preventDefault()
        handleCopyVectors()
      }
      // Command+V to paste vectors
      if (matchesShortcut(e, SHORTCUTS.PASTE_VECTORS) && hasCopiedVectors && !hasDrafts && !isInputting) {
        e.preventDefault()
        handlePasteVectors()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasDrafts, handleSaveDraft, handleCancelDraft, handleToggleDeletion, handleCommitDeletions, markedForDeletion, selectedVectorIds, handleCopyVectors, handlePasteVectors, hasCopiedVectors])

  // Find primary selected vector for drawer (check drafts first, then existing vectors)
  const selectedVector: LocalVectorRecord | null = useMemo(() => {
    if (!primarySelectedVectorId) return null

    // Check if a draft is selected
    const selectedDraft = draftVectors.find(d => d.id === primarySelectedVectorId)
    if (selectedDraft) {
      // Include metadata if there are any keys, even with empty values
      const hasMetadataKeys = Object.keys(selectedDraft.metadata).length > 0
      return {
        id: selectedDraft.id,
        metadata: hasMetadataKeys ? selectedDraft.metadata : null,
        embedding: null,
      }
    }

    // Check existing vectors
    return vectors.find((vec: LocalVectorRecord) => vec.id === primarySelectedVectorId) || null
  }, [primarySelectedVectorId, draftVectors, vectors])

  // Check if selected vector is a draft
  const isDraft = draftVectors.some(d => d.id === primarySelectedVectorId)

  // Notify parent when selected vector changes
  useEffect(() => {
    onSelectedVectorChange(selectedVector, isDraft)
  }, [selectedVector, isDraft, onSelectedVectorChange])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar area - calm floating control surface */}
      <div className="flex-shrink-0 bg-white/60 dark:bg-white/[0.03]">
        {/* Row 1: Namespace name and count */}
        <div className="px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 overflow-hidden">
            {isNamespaceTruncated ? (
              <Popover>
                <PopoverTrigger asChild>
                  <span
                    ref={namespaceTitleRef}
                    className="text-lg font-semibold text-foreground truncate max-w-[300px] cursor-text"
                  >
                    {namespace || '(default)'}
                  </span>
                </PopoverTrigger>
                <PopoverContent
                  className="px-2.5 py-1.5 min-w-0 max-w-[400px] rounded-md bg-popover/95 backdrop-blur-xl shadow-sm ring-1 ring-black/10 dark:ring-white/10"
                  align="start"
                  sideOffset={4}
                >
                  <div className="text-[13px] text-popover-foreground break-all select-all">{namespace || '(default)'}</div>
                </PopoverContent>
              </Popover>
            ) : (
              <span
                ref={namespaceTitleRef}
                className="text-lg font-semibold text-foreground truncate max-w-[300px]"
              >
                {namespace || '(default)'}
              </span>
            )}
            <div className="flex-shrink-0">
              <EmbeddingFunctionSelector
                indexName={indexName}
                currentOverride={embeddingOverride}
                serverConfig={null}
                onSave={handleSaveOverride}
                onClear={handleClearOverride}
                embeddingDimension={currentIndex?.dimension ?? null}
                indexEmbedConfig={currentIndex?.embed ?? null}
                textField={effectiveTextField}
                canOverride={!currentIndex?.embed}
                clientTextFieldOverride={textFieldOverride}
                onTextFieldSave={handleSaveTextFieldOverride}
                onTextFieldClear={handleClearTextFieldOverride}
                availableTextFields={availableTextFields}
              />
            </div>
          </div>
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {!loading && !error && `${vectors.length} vector${vectors.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {/* Row 2: Filters */}
        <div className="px-4 py-2 pb-3 space-y-2">
          {/* Filter rows */}
          {filterRows.map((row, index) => (
            <FilterRow
              key={row.id}
              row={row}
              isFirst={index === 0}
              isLast={index === filterRows.length - 1}
              canRemove={filterRows.length > 1}
              onChange={handleFilterRowChange}
              onAdd={handleAddFilterRow}
              onRemove={handleRemoveFilterRow}
              onSearch={handleSearch}
              nResults={nResults}
              onNResultsChange={setNResults}
              metadataFields={metadataFields}
            />
          ))}
        </div>

      </div>

      {/* Table - primary content canvas */}
      <div
        className="flex-1 overflow-auto"
        style={{
          background: 'var(--canvas-background)',
        }}
      >
        <VectorsTable
          vectors={vectors}
          loading={loading || isSearching}
          error={error ? (error as Error).message : null}
          hasActiveFilters={hasActiveFilters}
          selectedVectorIds={selectedVectorIds}
          selectionAnchor={selectionAnchor}
          onSingleSelect={onSingleSelect}
          onToggleSelect={onToggleSelect}
          onRangeSelect={onRangeSelect}
          onAddToSelection={onAddToSelection}
          draftVectors={draftVectors}
          onDraftChange={handleDraftChange}
          markedForDeletion={markedForDeletion}
          onVectorUpdate={handleInlineVectorUpdate}
          onVectorContextMenu={handleVectorContextMenu}
          onTableContextMenu={handleTableContextMenu}
          embeddingTextField={effectiveTextField}
        />
      </div>

      {/* Bottom Toolbar */}
      <div className="px-4 py-1.5 flex items-center justify-between">
        <button
          onClick={handleStartCreate}
          disabled={hasDrafts || markedForDeletion.size > 0}
          className="h-6 w-6 p-0 text-[11px] rounded-md bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.10] disabled:opacity-50 disabled:cursor-not-allowed"
          title="Add vector"
        >
          +
        </button>
        {hasDrafts && (
          <div className="flex items-center gap-3">
            {draftError && (
              <span className="text-[11px] text-destructive">{draftError}</span>
            )}
            <span className="text-[11px] text-muted-foreground">
              {draftVectors.length} vector{draftVectors.length !== 1 ? 's' : ''} to add
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleCancelDraft}
                disabled={createMutation.isPending || createBatchMutation.isPending}
                className="h-6 px-2 text-[11px] rounded-md bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.10] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDraft}
                disabled={createMutation.isPending || createBatchMutation.isPending || draftVectors.some(d => !d.id.trim())}
                className="h-6 px-2 text-[11px] rounded-md bg-[#007AFF] hover:bg-[#0071E3] active:bg-[#006DD9] text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {(createMutation.isPending || createBatchMutation.isPending) ? 'Saving...' : (draftVectors.length === 1 ? 'Save' : 'Save All')}
              </button>
            </div>
          </div>
        )}
        {!hasDrafts && markedForDeletion.size > 0 && (
          <div className="flex gap-2 items-center">
            {deleteError && (
              <span className="text-[11px] text-destructive">{deleteError}</span>
            )}
            <span className="text-[11px] text-muted-foreground">
              {markedForDeletion.size} marked for deletion
            </span>
            <button
              onClick={() => {
                setMarkedForDeletion(new Set())
                setDeleteError(null)
              }}
              disabled={deleteMutation.isPending}
              className="h-6 px-2 text-[11px] rounded-md bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.10] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleCommitDeletions}
              disabled={deleteMutation.isPending}
              className="h-6 px-2 text-[11px] rounded-md bg-red-500 hover:bg-red-600 active:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        )}
        {!hasDrafts && markedForDeletion.size === 0 && fetchTimeMs !== null && !loading && (
          <span className="text-[10px] text-muted-foreground">
            {isFetching ? 'fetching...' : `${fetchTimeMs}ms`}
          </span>
        )}
      </div>
    </div>
  )
}
