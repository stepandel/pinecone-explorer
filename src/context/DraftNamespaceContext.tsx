import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react'
import { usePinecone } from '../providers/PineconeProvider'
import { useSelection } from './SelectionContext'
import { useQueryClient } from '@tanstack/react-query'
import { pineconeQueryKeys } from '../hooks/usePineconeQueries'
import {
  type MetadataField,
  fieldsToMetadata,
  parseVectorJson,
  metadataToFields,
} from '../utils/vectorJsonParser'

export interface DraftVector {
  id: string
  metadataFields: MetadataField[]
}

export interface DraftNamespace {
  indexName: string
  name: string // Namespace name (empty = default namespace)
  vectors: DraftVector[]
  jsonMode: boolean
  jsonValue: string
}

interface DraftNamespaceContextValue {
  draftNamespace: DraftNamespace | null
  validationErrors: Record<string, string>
  isSaving: boolean
  startCreation: (indexName: string) => void
  updateDraft: (updates: Partial<DraftNamespace>) => void
  updateVector: (index: number, updates: Partial<DraftVector>) => void
  addVector: () => void
  removeVector: (index: number) => void
  cancelCreation: () => void
  saveDraft: () => Promise<void>
  parseJson: () => void
}

const DraftNamespaceContext = createContext<DraftNamespaceContextValue | null>(null)

// Generate a UUID for vector IDs
function generateUUID(): string {
  return crypto.randomUUID()
}

// Create initial draft with one vector
function createInitialDraft(indexName: string): DraftNamespace {
  return {
    indexName,
    name: '',
    vectors: [
      {
        id: generateUUID(),
        metadataFields: [],
      },
    ],
    jsonMode: false,
    jsonValue: '',
  }
}

// Validate the draft namespace
function validateDraft(draft: DraftNamespace): Record<string, string> {
  const errors: Record<string, string> = {}

  // Namespace name validation - optional, but no leading/trailing spaces
  if (draft.name !== draft.name.trim()) {
    errors.name = 'Namespace name cannot have leading or trailing spaces'
  }

  // Validate each vector
  draft.vectors.forEach((vector, vIndex) => {
    // Vector ID is required
    if (!vector.id.trim()) {
      errors[`vector_${vIndex}_id`] = 'Vector ID is required'
    }

    // Metadata field names must be unique and non-empty if present
    const fieldNames = new Set<string>()
    vector.metadataFields.forEach((field, fIndex) => {
      if (field.key.trim()) {
        if (fieldNames.has(field.key.trim())) {
          errors[`vector_${vIndex}_field_${fIndex}_key`] = 'Duplicate field name'
        }
        fieldNames.add(field.key.trim())

        // Validate value based on type
        if (field.type === 'number') {
          const num = parseFloat(field.value)
          if (isNaN(num)) {
            errors[`vector_${vIndex}_field_${fIndex}_value`] = 'Invalid number'
          }
        } else if (field.type === 'string[]') {
          try {
            const arr = JSON.parse(field.value)
            if (!Array.isArray(arr) || !arr.every((v) => typeof v === 'string')) {
              // Try comma-separated - always valid
            }
          } catch {
            // Comma-separated is always valid
          }
        }
      }
    })
  })

  return errors
}

export function DraftNamespaceProvider({ children }: { children: ReactNode }) {
  const [draftNamespace, setDraftNamespace] = useState<DraftNamespace | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  const { currentProfile } = usePinecone()
  const { selectIndexAndNamespace } = useSelection()
  const queryClient = useQueryClient()

  const startCreation = useCallback((indexName: string) => {
    setDraftNamespace(createInitialDraft(indexName))
    setValidationErrors({})
  }, [])

  const updateDraft = useCallback((updates: Partial<DraftNamespace>) => {
    setDraftNamespace((prev) => (prev ? { ...prev, ...updates } : prev))
    // Clear relevant validation errors
    const updatedKeys = Object.keys(updates)
    if (updatedKeys.length > 0) {
      setValidationErrors((prev) => {
        const next = { ...prev }
        updatedKeys.forEach((key) => delete next[key])
        return next
      })
    }
  }, [])

  const updateVector = useCallback((index: number, updates: Partial<DraftVector>) => {
    setDraftNamespace((prev) => {
      if (!prev) return prev
      const newVectors = [...prev.vectors]
      newVectors[index] = { ...newVectors[index], ...updates }
      return { ...prev, vectors: newVectors }
    })
  }, [])

  const addVector = useCallback(() => {
    setDraftNamespace((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        vectors: [
          ...prev.vectors,
          {
            id: generateUUID(),
            metadataFields: [],
          },
        ],
      }
    })
  }, [])

  const removeVector = useCallback((index: number) => {
    setDraftNamespace((prev) => {
      if (!prev || prev.vectors.length <= 1) return prev // Keep at least one vector
      return {
        ...prev,
        vectors: prev.vectors.filter((_, i) => i !== index),
      }
    })
  }, [])

  const cancelCreation = useCallback(() => {
    setDraftNamespace(null)
    setValidationErrors({})
  }, [])

  const parseJson = useCallback(() => {
    if (!draftNamespace) return

    const result = parseVectorJson(draftNamespace.jsonValue)
    if (!result.success) {
      setValidationErrors({
        json: result.error || 'Invalid JSON',
        ...(result.errorPosition && {
          jsonPosition: `Line ${result.errorPosition.line}, Column ${result.errorPosition.column}`,
        }),
      })
      return
    }

    // Convert parsed vectors to draft format
    const vectors: DraftVector[] = (result.vectors || []).map((v) => ({
      id: v.id || generateUUID(),
      metadataFields: v.metadata ? metadataToFields(v.metadata) : [],
    }))

    if (vectors.length === 0) {
      setValidationErrors({ json: 'No valid vectors found in JSON' })
      return
    }

    // Update draft with parsed vectors and switch to form mode
    setDraftNamespace({
      ...draftNamespace,
      vectors,
      jsonMode: false,
      jsonValue: '',
    })
    setValidationErrors({})
  }, [draftNamespace])

  const saveDraft = useCallback(async () => {
    if (!draftNamespace || !currentProfile) return

    // Validate
    const errors = validateDraft(draftNamespace)
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    setIsSaving(true)
    try {
      const namespace = draftNamespace.name.trim() || undefined

      // Get text field config for embedding generation
      let textField: string | undefined
      try {
        const textFieldOverride = await window.electronAPI.profiles.getTextFieldOverride(
          currentProfile.id,
          draftNamespace.indexName
        )
        textField = textFieldOverride || undefined
      } catch {
        // No text field configured
      }

      // Upsert each vector
      for (const vector of draftNamespace.vectors) {
        const metadata = fieldsToMetadata(vector.metadataFields)

        // Get text from configured text field for embedding generation
        let text: string | undefined
        if (textField && metadata[textField] && typeof metadata[textField] === 'string') {
          text = metadata[textField] as string
        }

        await window.electronAPI.pinecone.createVector(currentProfile.id, {
          indexName: draftNamespace.indexName,
          namespace,
          id: vector.id.trim(),
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          text,
          textField,
          generateEmbedding: !!text,
        })
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({
        queryKey: pineconeQueryKeys.indexStats(currentProfile.id, draftNamespace.indexName),
      })
      if (namespace !== undefined) {
        queryClient.invalidateQueries({
          queryKey: pineconeQueryKeys.vectors(currentProfile.id, draftNamespace.indexName, namespace),
        })
      }

      // Navigate to the namespace
      selectIndexAndNamespace(draftNamespace.indexName, namespace || '')

      // Clear draft
      setDraftNamespace(null)
      setValidationErrors({})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create namespace'
      setValidationErrors({ _form: message })
    } finally {
      setIsSaving(false)
    }
  }, [draftNamespace, currentProfile, selectIndexAndNamespace, queryClient])

  const value = useMemo<DraftNamespaceContextValue>(
    () => ({
      draftNamespace,
      validationErrors,
      isSaving,
      startCreation,
      updateDraft,
      updateVector,
      addVector,
      removeVector,
      cancelCreation,
      saveDraft,
      parseJson,
    }),
    [
      draftNamespace,
      validationErrors,
      isSaving,
      startCreation,
      updateDraft,
      updateVector,
      addVector,
      removeVector,
      cancelCreation,
      saveDraft,
      parseJson,
    ]
  )

  return (
    <DraftNamespaceContext.Provider value={value}>
      {children}
    </DraftNamespaceContext.Provider>
  )
}

export function useDraftNamespace() {
  const context = useContext(DraftNamespaceContext)
  if (!context) {
    throw new Error('useDraftNamespace must be used within a DraftNamespaceProvider')
  }
  return context
}
