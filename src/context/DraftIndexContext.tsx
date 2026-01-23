import { createContext, useContext, useState, useCallback, useEffect, useMemo, ReactNode } from 'react'
import { usePinecone } from '../providers/PineconeProvider'
import { useCreateIndexMutation } from '../hooks/usePineconeQueries'
import { useSelection } from './SelectionContext'
import { useNamespaceSetup } from './NamespaceSetupContext'
import { getEmbeddingFunctionById, getEmbeddingFunctionByModelStrict, DEFAULT_EMBEDDING_FUNCTION_ID } from '../constants/embedding-functions'
import { SchemaField } from '../components/shared/SchemaEditor'

export interface CloneProgressState {
  phase: 'preparing' | 'copying' | 'complete' | 'error' | 'cancelled'
  totalVectors: number
  processedVectors: number
  message: string
}

export interface FirstNamespaceConfig {
  name: string
  schema: SchemaField[]
  textField: string | null
}

export interface DraftIndex {
  name: string
  dimensionOverride: string
  metric?: 'cosine' | 'euclidean' | 'dotproduct'
  serverlessSpec?: {
    cloud: 'aws' | 'gcp' | 'azure'
    region: string
  }
  embeddingFunctionId?: string
  sourceIndex?: IndexInfo
  textField?: string
  availableTextFields?: string[]
  firstNamespace?: FirstNamespaceConfig
}

interface DraftIndexContextValue {
  draftIndex: DraftIndex | null
  isCreating: boolean
  validationErrors: Record<string, string>
  startCreation: () => void
  startCopyFromIndex: (index: IndexInfo) => void
  updateDraft: (updates: Partial<DraftIndex>) => void
  cancelCreation: () => void
  saveDraft: () => Promise<void>
  isCopyMode: boolean
  cloneProgress: CloneProgressState | null
  cloneProgressOpen: boolean
  setCloneProgressOpen: (open: boolean) => void
  cancelClone: () => Promise<void>
}

const DraftIndexContext = createContext<DraftIndexContextValue | null>(null)

// Helper: create initial draft with defaults
function createInitialDraft(): DraftIndex {
  const defaultFunc = getEmbeddingFunctionById(DEFAULT_EMBEDDING_FUNCTION_ID)
  return {
    name: '',
    dimensionOverride: String(defaultFunc?.defaultDimension || 1024),
    metric: 'cosine',
    serverlessSpec: { cloud: 'aws', region: 'us-east-1' },
    embeddingFunctionId: DEFAULT_EMBEDDING_FUNCTION_ID,
  }
}

// Helper: validate draft and return errors
function validateDraft(draft: DraftIndex, isSparseModel: boolean): Record<string, string> {
  const errors: Record<string, string> = {}

  if (!draft.name.trim()) {
    errors.name = 'Index name is required'
  }

  if (!isSparseModel) {
    const dimension = parseInt(draft.dimensionOverride, 10)
    if (!draft.dimensionOverride.trim() || isNaN(dimension) || dimension <= 0) {
      errors.dimension = 'Dimension must be a positive number'
    }
  }

  return errors
}

// Helper: build Pinecone create index params
function buildCreateParams(draft: DraftIndex, isSparseModel: boolean): CreateIndexParams {
  const params: CreateIndexParams = {
    name: draft.name.trim(),
    metric: isSparseModel ? 'dotproduct' : (draft.metric || 'cosine'),
    spec: {
      serverless: draft.serverlessSpec || { cloud: 'aws', region: 'us-east-1' },
    },
  }

  if (isSparseModel) {
    params.vectorType = 'sparse'
  } else {
    params.dimension = parseInt(draft.dimensionOverride, 10)
  }

  return params
}

// Helper: discover text fields from sample vectors across all namespaces
async function discoverTextFields(profileId: string, indexName: string): Promise<string[]> {
  // Get index stats to find namespaces with vectors
  const stats = await window.electronAPI.pinecone.getIndexStats(profileId, indexName)
  const namespacesWithVectors = Object.entries(stats.namespaces)
    .filter(([, ns]) => ns.vectorCount > 0)
    .map(([name]) => name)

  const fieldSet = new Set<string>()

  // Sample from each namespace until we find fields (limit to first 3 namespaces)
  for (const namespace of namespacesWithVectors.slice(0, 3)) {
    const sampleVectors = await window.electronAPI.pinecone.getAllVectors(
      profileId,
      indexName,
      namespace || undefined,
      20
    )

    sampleVectors.forEach(vector => {
      if (vector.metadata) {
        Object.entries(vector.metadata).forEach(([key, value]) => {
          if (typeof value === 'string' && value.length > 0) {
            fieldSet.add(key)
          }
        })
      }
    })

    // Stop if we found fields
    if (fieldSet.size > 0) break
  }

  if (fieldSet.size === 0) return ['_text']

  // Sort with common text field names first
  const priorityFields = ['_text', 'text', 'content', 'body', 'description', 'message']
  return Array.from(fieldSet).sort((a, b) => {
    const aIdx = priorityFields.indexOf(a)
    const bIdx = priorityFields.indexOf(b)
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx
    if (aIdx >= 0) return -1
    if (bIdx >= 0) return 1
    return a.localeCompare(b)
  })
}

export function DraftIndexProvider({ children }: { children: ReactNode }) {
  const [draftIndex, setDraftIndex] = useState<DraftIndex | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [cloneProgress, setCloneProgress] = useState<CloneProgressState | null>(null)
  const [cloneProgressOpen, setCloneProgressOpen] = useState(false)

  const { currentProfile, refreshIndexes } = usePinecone()
  const { setActiveIndex } = useSelection()
  const { selectIndexAndNamespace } = useSelection()
  const { setPendingSetup } = useNamespaceSetup()
  const createMutation = useCreateIndexMutation(currentProfile?.id || '')

  // Listen for clone progress updates
  useEffect(() => {
    return window.electronAPI.pinecone.onCloneProgress((progress) => {
      const phase = progress.phase === 'creating' ? 'preparing' : progress.phase
      setCloneProgress({
        phase: phase as CloneProgressState['phase'],
        totalVectors: progress.totalVectors,
        processedVectors: progress.processedVectors,
        message: progress.message,
      })
    })
  }, [])

  const cancelClone = useCallback(async () => {
    if (currentProfile) {
      try {
        await window.electronAPI.pinecone.cancelClone(currentProfile.id)
      } catch {
        // Ignore cancel errors
      }
    }
  }, [currentProfile])

  const startCreation = useCallback(() => {
    setDraftIndex(createInitialDraft())
    setValidationErrors({})
    setActiveIndex(null)
  }, [setActiveIndex])

  const startCopyFromIndex = useCallback(async (index: IndexInfo) => {
    let embeddingFunctionId = DEFAULT_EMBEDDING_FUNCTION_ID
    let availableTextFields: string[] = ['_text']

    if (currentProfile) {
      // Try to get source index's embedding config
      try {
        const sourceConfig = await window.electronAPI.profiles.getEmbeddingOverride(
          currentProfile.id,
          index.name
        )
        if (sourceConfig?.modelName) {
          const matchingFunction = getEmbeddingFunctionByModelStrict(
            sourceConfig.provider,
            sourceConfig.modelName
          )
          if (matchingFunction) {
            embeddingFunctionId = matchingFunction.id
          }
        }
      } catch {
        // Use default
      }

      // Discover available text fields
      try {
        availableTextFields = await discoverTextFields(currentProfile.id, index.name)
      } catch {
        // Use default
      }
    }

    setDraftIndex({
      name: `${index.name}-copy`,
      dimensionOverride: String(index.dimension),
      metric: index.metric,
      serverlessSpec: index.spec.serverless
        ? { cloud: index.spec.serverless.cloud, region: index.spec.serverless.region }
        : { cloud: 'aws', region: 'us-east-1' },
      sourceIndex: index,
      embeddingFunctionId,
      textField: availableTextFields[0],
      availableTextFields,
    })
    setValidationErrors({})
    setActiveIndex(null)
  }, [currentProfile, setActiveIndex])

  const updateDraft = useCallback((updates: Partial<DraftIndex>) => {
    setDraftIndex(prev => prev ? { ...prev, ...updates } : prev)
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
    setDraftIndex(null)
    setValidationErrors({})
  }, [])

  const saveDraft = useCallback(async () => {
    if (!draftIndex || !currentProfile) return

    const embeddingConfig = draftIndex.embeddingFunctionId
      ? getEmbeddingFunctionById(draftIndex.embeddingFunctionId)
      : null
    const isSparseModel = embeddingConfig?.vectorType === 'sparse'

    // Validate
    const errors = validateDraft(draftIndex, isSparseModel)
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    setIsCreating(true)
    try {
      // Create the index
      const params = buildCreateParams(draftIndex, isSparseModel)
      await createMutation.mutateAsync(params)

      const newIndexName = draftIndex.name.trim()

      // Save embedding config
      if (embeddingConfig) {
        const dimension = parseInt(draftIndex.dimensionOverride, 10)
        await window.electronAPI.profiles.setEmbeddingOverride(
          currentProfile.id,
          newIndexName,
          {
            provider: embeddingConfig.type as EmbeddingProviderType,
            modelName: embeddingConfig.modelName,
            vectorType: embeddingConfig.vectorType,
            ...(embeddingConfig.defaultDimension && !isSparseModel && {
              dimensions: dimension || embeddingConfig.defaultDimension
            }),
          }
        )
      }

      // Handle copy mode
      if (draftIndex.sourceIndex) {
        await handleCloneOperation(newIndexName, draftIndex, currentProfile.id)
      } else if (draftIndex.firstNamespace) {
        // Handle first namespace setup
        const { name: namespaceName, schema, textField } = draftIndex.firstNamespace

        // Save text field override if specified
        if (textField) {
          await window.electronAPI.profiles.setTextFieldOverride(
            currentProfile.id,
            newIndexName,
            textField
          )
        }

        // Set up pending setup for VectorsView if schema is defined
        if (schema.length > 0) {
          setPendingSetup({
            indexName: newIndexName,
            namespace: namespaceName.trim(),
            schema,
            textField,
          })
        }

        setDraftIndex(null)
        setValidationErrors({})
        // Navigate to the index and namespace
        selectIndexAndNamespace(newIndexName, namespaceName.trim())
      } else {
        setDraftIndex(null)
        setValidationErrors({})
        setActiveIndex(newIndexName)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create index'
      setValidationErrors({ _form: message })
    } finally {
      setIsCreating(false)
    }
  }, [draftIndex, currentProfile, createMutation, setActiveIndex, selectIndexAndNamespace, setPendingSetup, refreshIndexes])

  // Helper for clone operation (kept inside provider for access to state setters)
  const handleCloneOperation = async (newIndexName: string, draft: DraftIndex, profileId: string) => {
    const sourceIndex = draft.sourceIndex!

    // Verify source still exists
    try {
      const currentIndexes = await window.electronAPI.pinecone.listIndexes(profileId)
      if (!currentIndexes.some(idx => idx.name === sourceIndex.name)) {
        setValidationErrors({ _form: 'Source index no longer exists' })
        return
      }
    } catch {
      setValidationErrors({ _form: 'Failed to verify source index' })
      return
    }

    const textField = draft.textField || '_text'

    // Show progress dialog
    setCloneProgress({
      phase: 'preparing',
      totalVectors: 0,
      processedVectors: 0,
      message: 'Starting vector copy...',
    })
    setCloneProgressOpen(true)
    setDraftIndex(null)
    setValidationErrors({})

    try {
      const result = await window.electronAPI.pinecone.cloneIndex(profileId, {
        sourceIndexName: sourceIndex.name,
        targetIndexName: newIndexName,
        regenerateEmbeddings: true,
        textField,
      })

      if (result.success) {
        setCloneProgress({
          phase: 'complete',
          totalVectors: result.totalVectors,
          processedVectors: result.copiedVectors,
          message: `Copied ${result.copiedVectors} vectors`,
        })
        refreshIndexes()
        setActiveIndex(newIndexName)
      } else {
        setCloneProgress({
          phase: 'error',
          totalVectors: result.totalVectors,
          processedVectors: result.copiedVectors,
          message: result.error || 'Clone failed',
        })
      }
    } catch (error) {
      setCloneProgress({
        phase: 'error',
        totalVectors: 0,
        processedVectors: 0,
        message: error instanceof Error ? error.message : 'Failed to clone vectors',
      })
    }
  }

  const value = useMemo<DraftIndexContextValue>(() => ({
    draftIndex,
    isCreating,
    validationErrors,
    startCreation,
    startCopyFromIndex,
    updateDraft,
    cancelCreation,
    saveDraft,
    isCopyMode: draftIndex?.sourceIndex !== undefined,
    cloneProgress,
    cloneProgressOpen,
    setCloneProgressOpen,
    cancelClone,
  }), [
    draftIndex,
    isCreating,
    validationErrors,
    startCreation,
    startCopyFromIndex,
    updateDraft,
    cancelCreation,
    saveDraft,
    cloneProgress,
    cloneProgressOpen,
    cancelClone,
  ])

  return <DraftIndexContext.Provider value={value}>{children}</DraftIndexContext.Provider>
}

export function useDraftIndex() {
  const context = useContext(DraftIndexContext)
  if (!context) {
    throw new Error('useDraftIndex must be used within a DraftIndexProvider')
  }
  return context
}