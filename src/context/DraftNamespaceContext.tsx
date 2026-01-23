import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react'
import { usePinecone } from '../providers/PineconeProvider'
import { useSelection } from './SelectionContext'
import { useNamespaceSetup } from './NamespaceSetupContext'
import { SchemaField } from '../components/shared/SchemaEditor'

export interface DraftNamespace {
  name: string
  indexName: string
  schema: SchemaField[]
  textField: string | null
}

interface DraftNamespaceContextValue {
  draftNamespace: DraftNamespace | null
  validationErrors: Record<string, string>
  startCreation: (indexName: string) => void
  updateDraft: (updates: Partial<DraftNamespace>) => void
  cancelCreation: () => void
  saveDraft: () => Promise<void>
  isSaving: boolean
}

const DraftNamespaceContext = createContext<DraftNamespaceContextValue | null>(null)

// Helper: create initial draft
function createInitialDraft(indexName: string): DraftNamespace {
  return {
    name: '',
    indexName,
    schema: [],
    textField: null,
  }
}

// Helper: validate draft
function validateDraft(draft: DraftNamespace): Record<string, string> {
  const errors: Record<string, string> = {}

  // Namespace name can be empty (default namespace), but must not contain invalid chars
  if (draft.name.trim()) {
    // Pinecone namespace naming: alphanumeric, hyphens, underscores
    // Actually Pinecone is quite permissive with namespace names
    // But let's ensure no leading/trailing whitespace
    if (draft.name !== draft.name.trim()) {
      errors.name = 'Namespace name cannot have leading/trailing spaces'
    }
  }

  // Check for duplicate field names
  const fieldNames = draft.schema.map(f => f.key.trim()).filter(k => k)
  const uniqueFieldNames = new Set(fieldNames)
  if (fieldNames.length !== uniqueFieldNames.size) {
    errors.schema = 'Field names must be unique'
  }

  // Check for empty field names (if any fields exist)
  if (draft.schema.length > 0 && draft.schema.some(f => !f.key.trim())) {
    errors.schema = 'All field names must be filled in'
  }

  return errors
}

export function DraftNamespaceProvider({ children }: { children: ReactNode }) {
  const [draftNamespace, setDraftNamespace] = useState<DraftNamespace | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)

  const { currentProfile } = usePinecone()
  const { selectIndexAndNamespace } = useSelection()
  const { setPendingSetup } = useNamespaceSetup()

  const startCreation = useCallback((indexName: string) => {
    setDraftNamespace(createInitialDraft(indexName))
    setValidationErrors({})
  }, [])

  const updateDraft = useCallback((updates: Partial<DraftNamespace>) => {
    setDraftNamespace(prev => prev ? { ...prev, ...updates } : prev)
    // Clear validation errors for updated fields
    const updatedKeys = Object.keys(updates)
    if (updatedKeys.length > 0) {
      setValidationErrors(prev => {
        const next = { ...prev }
        updatedKeys.forEach(key => delete next[key])
        return next
      })
    }
  }, [])

  const cancelCreation = useCallback(() => {
    setDraftNamespace(null)
    setValidationErrors({})
  }, [])

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
      const namespaceName = draftNamespace.name.trim() // Empty string = default namespace

      // Save text field override if specified
      if (draftNamespace.textField) {
        await window.electronAPI.profiles.setTextFieldOverride(
          currentProfile.id,
          draftNamespace.indexName,
          draftNamespace.textField
        )
      }

      // Set up pending setup for VectorsView if schema is defined
      if (draftNamespace.schema.length > 0) {
        setPendingSetup({
          indexName: draftNamespace.indexName,
          namespace: namespaceName,
          schema: draftNamespace.schema,
          textField: draftNamespace.textField,
        })
      }

      // Navigate to the namespace (this will create it when first vector is added)
      selectIndexAndNamespace(draftNamespace.indexName, namespaceName)

      // Clear draft
      setDraftNamespace(null)
      setValidationErrors({})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set up namespace'
      setValidationErrors({ _form: message })
    } finally {
      setIsSaving(false)
    }
  }, [draftNamespace, currentProfile, selectIndexAndNamespace, setPendingSetup])

  const value = useMemo<DraftNamespaceContextValue>(() => ({
    draftNamespace,
    validationErrors,
    startCreation,
    updateDraft,
    cancelCreation,
    saveDraft,
    isSaving,
  }), [
    draftNamespace,
    validationErrors,
    startCreation,
    updateDraft,
    cancelCreation,
    saveDraft,
    isSaving,
  ])

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
