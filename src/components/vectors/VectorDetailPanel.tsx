import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, X, ChevronDown } from 'lucide-react'
import EmbeddingCell from './EmbeddingCell'
import { RegenerateEmbeddingDialog } from './RegenerateEmbeddingDialog'
import { EmbeddingFieldRequiredDialog } from './EmbeddingFieldRequiredDialog'
import { useUpdateVectorMutation } from '../../hooks/usePineconeQueries'
import { useMetadataEditing } from '../../hooks/useMetadataEditing'
import { SHORTCUTS, matchesShortcut } from '../../constants/keyboard-shortcuts'
import { TypedMetadataField, MetadataValueType, validateMetadataValue } from '../../types/metadata'
import { LocalVectorRecord } from '../../types/vectors'

interface VectorDetailPanelProps {
  vector: LocalVectorRecord
  indexName: string
  namespace?: string
  profileId: string
  isDraft?: boolean
  isFirstVector?: boolean
  onDraftChange?: (updates: { id?: string; metadata?: Record<string, unknown> }) => void
  embeddingTextField?: string // The metadata field used for embedding text
  isEmbeddingFieldConfigured?: boolean // Whether the embedding text field is explicitly configured
}

export default function VectorDetailPanel({
  vector,
  indexName,
  namespace,
  profileId,
  isDraft = false,
  isFirstVector = false,
  onDraftChange,
  embeddingTextField,
  isEmbeddingFieldConfigured,
}: VectorDetailPanelProps) {
  // Embedding editing state
  const [draftEmbedding, setDraftEmbedding] = useState<string>('')
  const [embeddingError, setEmbeddingError] = useState<string | null>(null)
  const [isEditingEmbedding, setIsEditingEmbedding] = useState(false)
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false)
  const [showFieldRequiredDialog, setShowFieldRequiredDialog] = useState(false)
  const [pendingSaveData, setPendingSaveData] = useState<{
    metadata: Record<string, unknown>
    values?: number[]
  } | null>(null)
  const embeddingTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Update mutation
  const updateMutation = useUpdateVectorMutation(profileId, indexName, namespace)

  // Metadata editing hook
  const {
    draftMetadata,
    hasChanges: hasMetadataChanges,
    reset: resetMetadata,
    handleChange: handleMetadataChange,
    addField: handleAddMetadataField,
    removeField: handleRemoveMetadataField,
    renameField: handleMetadataKeyRename,
    changeFieldType: handleMetadataTypeChange,
  } = useMetadataEditing({
    initialMetadata: vector.metadata,
    vectorId: vector.id,
    isDraft,
    onDraftChange,
  })

  // Helper to get embedding display string
  const getEmbeddingDisplayString = useCallback(() => {
    const hasDense = vector.embedding && vector.embedding.length > 0
    const hasSparse = vector.sparseEmbedding && vector.sparseEmbedding.indices.length > 0

    if (hasDense && hasSparse) {
      // Hybrid: show both embeddings in a structured format
      return JSON.stringify({
        dense: vector.embedding,
        sparse: vector.sparseEmbedding,
      }, null, 2)
    } else if (hasDense) {
      return JSON.stringify(vector.embedding)
    } else if (hasSparse) {
      return JSON.stringify({ sparse: vector.sparseEmbedding }, null, 2)
    }
    return ''
  }, [vector.embedding, vector.sparseEmbedding])

  // Check if this is a sparse-only vector (no editable dense values)
  const isSparseOnly = Boolean(
    (!vector.embedding || vector.embedding.length === 0) &&
    vector.sparseEmbedding && vector.sparseEmbedding.indices.length > 0
  )

  // Check if this is a hybrid vector (has both dense and sparse)
  const isHybrid = Boolean(
    vector.embedding && vector.embedding.length > 0 &&
    vector.sparseEmbedding && vector.sparseEmbedding.indices.length > 0
  )

  // Check for embedding changes
  const hasEmbeddingChanges = (() => {
    if (!draftEmbedding && !vector.embedding) return false
    if (!draftEmbedding || !vector.embedding) return true
    try {
      const parsed = JSON.parse(draftEmbedding)
      return JSON.stringify(parsed) !== JSON.stringify(vector.embedding)
    } catch {
      return true
    }
  })()

  const hasDirtyChanges = isDraft || hasMetadataChanges || hasEmbeddingChanges

  // Reset embedding when vector changes
  useEffect(() => {
    setDraftEmbedding(getEmbeddingDisplayString())
    setEmbeddingError(null)
    setIsEditingEmbedding(false)
  }, [vector.id, vector.embedding, vector.sparseEmbedding, getEmbeddingDisplayString])

  // Auto-resize and focus embedding textarea
  useEffect(() => {
    if (isEditingEmbedding && embeddingTextareaRef.current) {
      const textarea = embeddingTextareaRef.current
      const scrollContainer = textarea.closest('.overflow-auto')
      const savedScrollTop = scrollContainer?.scrollTop ?? 0

      textarea.style.height = 'auto'
      textarea.style.height = `${Math.max(textarea.scrollHeight, 100)}px`

      if (scrollContainer) scrollContainer.scrollTop = savedScrollTop
      textarea.focus({ preventScroll: true })
    }
  }, [draftEmbedding, isEditingEmbedding])

  const handleCancel = useCallback(() => {
    resetMetadata()
    setDraftEmbedding(getEmbeddingDisplayString())
    setEmbeddingError(null)
    setIsEditingEmbedding(false)
  }, [getEmbeddingDisplayString, resetMetadata])

  const handleSave = useCallback(async () => {
    // Gate: require embedding field to be configured before saving
    if (!isEmbeddingFieldConfigured) {
      setShowFieldRequiredDialog(true)
      return
    }

    try {
      const updates: {
        id: string
        metadata?: Record<string, unknown>
        values?: number[]
        sparseValues?: { indices: number[]; values: number[] }
      } = {
        id: vector.id
      }

      if (hasMetadataChanges && draftMetadata) {
        updates.metadata = draftMetadata
      }

      if (hasEmbeddingChanges && draftEmbedding) {
        const parsed = JSON.parse(draftEmbedding)

        // Handle hybrid format: { dense: [...], sparse: { indices: [...], values: [...] } }
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          if (parsed.dense) {
            if (!Array.isArray(parsed.dense) || !parsed.dense.every((n: unknown) => typeof n === 'number')) {
              setEmbeddingError('Dense embedding must be an array of numbers')
              return
            }
            updates.values = parsed.dense
          }
          if (parsed.sparse) {
            if (!parsed.sparse.indices || !parsed.sparse.values ||
                !Array.isArray(parsed.sparse.indices) || !Array.isArray(parsed.sparse.values)) {
              setEmbeddingError('Sparse embedding must have indices and values arrays')
              return
            }
            updates.sparseValues = parsed.sparse
          }
        } else if (Array.isArray(parsed)) {
          // Simple array format (dense only)
          if (!parsed.every(n => typeof n === 'number')) {
            setEmbeddingError('Embedding must be an array of numbers')
            return
          }
          updates.values = parsed
        } else {
          setEmbeddingError('Invalid embedding format')
          return
        }
      }

      if (hasMetadataChanges || hasEmbeddingChanges) {
        // Check if the embedding text field was modified
        const textFieldChanged = embeddingTextField &&
          draftMetadata &&
          draftMetadata[embeddingTextField] !== vector.metadata?.[embeddingTextField]

        if (textFieldChanged && !hasEmbeddingChanges) {
          // Text field changed but embedding wasn't manually edited - ask user
          setPendingSaveData({
            metadata: draftMetadata,
            values: updates.values,
          })
          setShowRegenerateDialog(true)
          return
        }

        // Save directly (no text field change, or embedding was manually edited)
        await updateMutation.mutateAsync({
          ...updates,
          textField: embeddingTextField,
        })
      }
      setEmbeddingError(null)
    } catch (e) {
      if (e instanceof SyntaxError) {
        setEmbeddingError('Invalid JSON format')
      } else {
        const message = e instanceof Error ? e.message : 'Failed to save changes'
        setEmbeddingError(message)
      }
    }
  }, [vector.id, vector.metadata, hasMetadataChanges, hasEmbeddingChanges, draftMetadata, draftEmbedding, updateMutation, embeddingTextField, isEmbeddingFieldConfigured])

  // Handle regenerate dialog confirmation
  const handleRegenerateConfirm = useCallback(async (regenerate: boolean) => {
    if (!pendingSaveData) return

    try {
      await updateMutation.mutateAsync({
        id: vector.id,
        metadata: pendingSaveData.metadata,
        values: pendingSaveData.values,
        regenerateEmbedding: regenerate,
        textField: embeddingTextField,
      })
      setEmbeddingError(null)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save changes'
      setEmbeddingError(message)
    } finally {
      setPendingSaveData(null)
      setShowRegenerateDialog(false)
    }
  }, [pendingSaveData, vector.id, updateMutation, embeddingTextField])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((matchesShortcut(e, SHORTCUTS.SAVE) || matchesShortcut(e, SHORTCUTS.SAVE_ENTER)) && hasDirtyChanges) {
        e.preventDefault()
        handleSave()
      }
      if (matchesShortcut(e, SHORTCUTS.UNDO) && hasDirtyChanges) {
        e.preventDefault()
        handleCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasDirtyChanges, handleSave, handleCancel])

  const canEditSchema = isDraft && isFirstVector

  return (
    <div
      className="h-full"
      style={{
        background: 'var(--panel-detail)',
        backdropFilter: 'blur(24px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
        boxShadow: 'var(--panel-detail-shadow)',
      }}
    >
      <div className="h-full overflow-auto space-y-3 p-3">
        {/* ID Section */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground mb-1">id</h3>
          {isDraft ? (
            <input
              type="text"
              value={vector.id}
              onChange={e => onDraftChange?.({ id: e.target.value })}
              placeholder="Enter vector ID"
              className="w-full text-xs font-mono p-2 bg-black/[0.03] dark:bg-white/[0.04] rounded-md ring-1 ring-blue-500/20 focus:outline-none focus:ring-blue-500/30"
            />
          ) : (
            <div className="p-2 bg-black/[0.03] dark:bg-white/[0.04] rounded-md">
              <code className="text-xs font-mono break-all">{vector.id}</code>
            </div>
          )}
        </section>

        {/* Metadata Fields */}
        {draftMetadata && Object.entries(draftMetadata).map(([key, value], index) => (
          <MetadataFieldSection
            key={canEditSchema ? `field-${index}` : key}
            fieldKey={key}
            value={value}
            isDraft={isDraft}
            canEditSchema={canEditSchema}
            initialValue={vector.metadata?.[key]}
            onValueChange={handleMetadataChange}
            onKeyRename={handleMetadataKeyRename}
            onTypeChange={handleMetadataTypeChange}
            onRemove={handleRemoveMetadataField}
          />
        ))}

        {/* Add metadata field button */}
        {canEditSchema && (
          <section>
            <button
              type="button"
              onClick={handleAddMetadataField}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add metadata field
            </button>
          </section>
        )}

        {/* Embedding Section */}
        {!isDraft && (
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground mb-1">
              embedding
              {isHybrid && <span className="ml-1 text-[10px] opacity-70">(hybrid)</span>}
              {isSparseOnly && <span className="ml-1 text-[10px] opacity-70">(sparse)</span>}
            </h3>
            {isEditingEmbedding ? (
              <div>
                <textarea
                  ref={embeddingTextareaRef}
                  value={draftEmbedding}
                  onChange={e => {
                    if (!isSparseOnly) {
                      setDraftEmbedding(e.target.value)
                      setEmbeddingError(null)
                    }
                  }}
                  onBlur={() => setIsEditingEmbedding(false)}
                  placeholder="No embedding"
                  readOnly={isSparseOnly}
                  className={`w-full text-xs font-mono overflow-hidden focus:outline-none resize-none p-2 bg-black/[0.03] dark:bg-white/[0.04] rounded-md ${
                    hasEmbeddingChanges ? 'ring-1 ring-blue-500/20' : ''
                  } focus-within:ring-1 focus-within:ring-blue-500/30 ${isSparseOnly ? 'cursor-default' : ''}`}
                />
                {isSparseOnly && (
                  <p className="text-xs text-muted-foreground mt-1">Sparse embeddings are read-only</p>
                )}
                {isHybrid && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Edit both dense and sparse values. Format: {'{ "dense": [...], "sparse": { "indices": [...], "values": [...] } }'}
                  </p>
                )}
                {embeddingError && <p className="text-xs text-destructive mt-1">{embeddingError}</p>}
              </div>
            ) : (
              <div
                onClick={() => setIsEditingEmbedding(true)}
                className={`cursor-pointer p-2 bg-black/[0.03] dark:bg-white/[0.04] rounded-md ${
                  hasEmbeddingChanges ? 'ring-1 ring-blue-500/20' : ''
                }`}
              >
                <EmbeddingCell embedding={vector.embedding} sparseEmbedding={vector.sparseEmbedding} />
              </div>
            )}
          </section>
        )}

        {/* Dirty indicator */}
        {hasDirtyChanges && (
          <div className="text-xs text-muted-foreground text-center py-2">
            {updateMutation.isPending ? 'Saving...' : 'Unsaved changes — ⌘↵ to save, ⌘Z to revert'}
          </div>
        )}

        <EmbeddingFieldRequiredDialog
          open={showFieldRequiredDialog}
          onOpenChange={(open) => {
            if (!open) setShowFieldRequiredDialog(false)
          }}
        />

        <RegenerateEmbeddingDialog
          open={showRegenerateDialog}
          onOpenChange={(open) => {
            if (!open) {
              setPendingSaveData(null)
              setShowRegenerateDialog(false)
            }
          }}
          onConfirm={handleRegenerateConfirm}
          isLoading={updateMutation.isPending}
        />
      </div>
    </div>
  )
}

// Metadata field section component
interface MetadataFieldSectionProps {
  fieldKey: string
  value: unknown
  isDraft: boolean
  canEditSchema: boolean
  initialValue: unknown
  onValueChange: (key: string, value: string) => void
  onKeyRename: (oldKey: string, newKey: string) => void
  onTypeChange: (key: string, newType: MetadataValueType) => void
  onRemove: (key: string) => void
}

function MetadataFieldSection({
  fieldKey,
  value,
  isDraft,
  canEditSchema,
  initialValue,
  onValueChange,
  onKeyRename,
  onTypeChange,
  onRemove,
}: MetadataFieldSectionProps) {
  const isTypedField = value && typeof value === 'object' && 'value' in value && 'type' in value
  const typedField = isTypedField ? (value as TypedMetadataField) : null

  const displayValue = typedField
    ? typedField.value
    : value !== undefined
      ? typeof value === 'object' ? JSON.stringify(value) : String(value)
      : ''

  const isDirty = isDraft ? true : value !== initialValue
  const validationError = isDraft && typedField
    ? validateMetadataValue(typedField.value, typedField.type)
    : null

  const fieldStyle = `w-full text-xs whitespace-pre-wrap overflow-hidden focus:outline-none resize-none p-2 bg-black/[0.03] dark:bg-white/[0.04] rounded-md transition-colors ${
    isDirty ? 'ring-1 ring-blue-500/20' : ''
  } focus-within:ring-1 focus-within:ring-blue-500/30 ${validationError ? 'border-destructive' : ''}`

  return (
    <section>
      {canEditSchema ? (
        <div className="flex items-center gap-1 mb-1">
          <input
            type="text"
            value={fieldKey}
            onChange={e => onKeyRename(fieldKey, e.target.value)}
            className="flex-1 text-xs font-semibold text-muted-foreground bg-transparent border-none outline-none focus:text-foreground"
          />
          {typedField && (
            <div className="relative">
              <select
                value={typedField.type}
                onChange={e => onTypeChange(fieldKey, e.target.value as MetadataValueType)}
                className="h-5 pl-1.5 pr-5 appearance-none rounded-md bg-black/[0.05] dark:bg-white/[0.08] text-[10px] focus:outline-none focus:ring-1 focus:ring-ring/50 cursor-pointer"
              >
                <option value="string">str</option>
                <option value="number">num</option>
                <option value="boolean">bool</option>
              </select>
              <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 h-2.5 w-2.5 text-muted-foreground pointer-events-none" />
            </div>
          )}
          <button
            type="button"
            onClick={() => onRemove(fieldKey)}
            className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <h3 className="text-xs font-semibold text-muted-foreground mb-1">{fieldKey}</h3>
      )}
      <textarea
        rows={1}
        value={displayValue}
        onChange={e => onValueChange(fieldKey, e.target.value)}
        placeholder={typedField?.type === 'boolean' ? 'true / false' : typedField?.type === 'number' ? '0' : undefined}
        style={{ fieldSizing: 'content' } as React.CSSProperties}
        className={fieldStyle}
      />
      {validationError && <p className="text-xs text-destructive mt-0.5">{validationError}</p>}
    </section>
  )
}
