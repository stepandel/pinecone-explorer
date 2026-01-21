import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { usePinecone } from '../providers/PineconeProvider'
import { useCreateIndexMutation } from '../hooks/usePineconeQueries'
import { useCollection } from './CollectionContext'
import { getEmbeddingFunctionById } from '../constants/embedding-functions'

// Clone progress type matching the dialog's expected format
export interface CloneProgressState {
  phase: 'preparing' | 'copying' | 'complete' | 'error' | 'cancelled'
  totalVectors: number
  processedVectors: number
  message: string
}

export interface DraftCollection {
  name: string
  dimensionOverride: string // String to allow empty input
  metric?: 'cosine' | 'euclidean' | 'dotproduct'
  serverlessSpec?: {
    cloud: 'aws' | 'gcp' | 'azure'
    region: string
  }
  embeddingFunctionId?: string // Track selected embedding model
  // If cloning from an existing index, this will be set
  sourceCollection?: IndexInfo
}

// Legacy alias for backwards compatibility
export type DraftHNSWConfig = {
  space: 'l2' | 'cosine' | 'ip'
  efConstruction: string
  maxNeighbors: string
}

interface DraftCollectionContextValue {
  draftCollection: DraftCollection | null
  isCreating: boolean
  validationErrors: Record<string, string>

  // Actions
  startCreation: () => void
  startCopyFromCollection: (index: IndexInfo) => void
  updateDraft: (updates: Partial<DraftCollection>) => void
  cancelCreation: () => void
  saveDraft: () => Promise<void>
  isCopyMode: boolean

  // Clone progress (for copy mode)
  cloneProgress: CloneProgressState | null
  cloneProgressOpen: boolean
  setCloneProgressOpen: (open: boolean) => void
  cancelClone: () => Promise<void>
}

const DraftCollectionContext = createContext<DraftCollectionContextValue | null>(null)

interface DraftCollectionProviderProps {
  children: ReactNode
}

function createInitialDraft(): DraftCollection {
  return {
    name: '',
    dimensionOverride: '',
    metric: 'cosine',
    serverlessSpec: {
      cloud: 'aws',
      region: 'us-east-1',
    },
  }
}

export function DraftCollectionProvider({ children }: DraftCollectionProviderProps) {
  const [draftCollection, setDraftCollection] = useState<DraftCollection | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  // Clone progress state
  const [cloneProgress, setCloneProgress] = useState<CloneProgressState | null>(null)
  const [cloneProgressOpen, setCloneProgressOpen] = useState(false)

  const { currentProfile, refreshIndexes } = usePinecone()
  const { setActiveCollection } = useCollection()
  const createMutation = useCreateIndexMutation(currentProfile?.id || '')

  // Listen for clone progress updates
  useEffect(() => {
    const unsubscribe = window.electronAPI.pinecone.onCloneProgress((progress) => {
      // Map 'creating' phase to 'preparing' for the dialog
      const phase = progress.phase === 'creating' ? 'preparing' : progress.phase
      setCloneProgress({
        phase: phase as CloneProgressState['phase'],
        totalVectors: progress.totalVectors,
        processedVectors: progress.processedVectors,
        message: progress.message,
      })
    })
    return unsubscribe
  }, [])

  // Cancel clone operation
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
    setDraftCollection(createInitialDraft())
    setValidationErrors({})
    // Deselect current index when starting creation
    setActiveCollection(null)
  }, [setActiveCollection])

  const startCopyFromCollection = useCallback((index: IndexInfo) => {
    // Pre-fill with source index settings
    setDraftCollection({
      name: `${index.name}-copy`,
      dimensionOverride: String(index.dimension),
      metric: index.metric,
      serverlessSpec: index.spec.serverless ? {
        cloud: index.spec.serverless.cloud,
        region: index.spec.serverless.region,
      } : {
        cloud: 'aws',
        region: 'us-east-1',
      },
      sourceCollection: index,
    })
    setValidationErrors({})
    setActiveCollection(null)
  }, [setActiveCollection])

  const updateDraft = useCallback((updates: Partial<DraftCollection>) => {
    setDraftCollection((prev) => {
      if (!prev) return prev
      return { ...prev, ...updates }
    })
    // Clear validation errors for updated fields
    if (updates.name !== undefined) {
      setValidationErrors((prev) => {
        const { name, ...rest } = prev
        return rest
      })
    }
  }, [])

  const cancelCreation = useCallback(() => {
    setDraftCollection(null)
    setValidationErrors({})
  }, [])

  const saveDraft = useCallback(async () => {
    if (!draftCollection || !currentProfile) return

    // Check if selected model is sparse (no dimension required)
    const embeddingConfig = draftCollection.embeddingFunctionId
      ? getEmbeddingFunctionById(draftCollection.embeddingFunctionId)
      : null
    const isSparseModel = embeddingConfig?.vectorType === 'sparse'

    // Validate
    const errors: Record<string, string> = {}
    if (!draftCollection.name.trim()) {
      errors.name = 'Index name is required'
    }

    // Validate dimension (only for dense models)
    const dimension = parseInt(draftCollection.dimensionOverride, 10)
    if (!isSparseModel) {
      if (!draftCollection.dimensionOverride.trim() || isNaN(dimension) || dimension <= 0) {
        errors.dimension = 'Dimension must be a positive number'
      }
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    setIsCreating(true)
    try {
      // Build params for Pinecone index creation
      const params: CreateIndexParams = {
        name: draftCollection.name.trim(),
        metric: isSparseModel ? 'dotproduct' : (draftCollection.metric || 'cosine'),
        spec: {
          serverless: draftCollection.serverlessSpec || {
            cloud: 'aws',
            region: 'us-east-1',
          },
        },
      }

      // Check if this is a Pinecone-hosted embedding model (integrated inference)
      const isPineconeModel = embeddingConfig?.type === 'pinecone'

      // For sparse indexes: set vectorType, omit dimension
      // For dense indexes with Pinecone model: use integrated inference (no dimension needed)
      // For dense indexes with other models: set dimension
      if (isSparseModel) {
        params.vectorType = 'sparse'
      } else if (isPineconeModel && embeddingConfig) {
        // Use integrated inference - Pinecone will handle embeddings
        params.embed = {
          model: embeddingConfig.modelName,
          fieldMap: { text: '_text' }, // Map the _text field for embedding
          metric: draftCollection.metric || 'cosine',
        }
      } else {
        // Standard index - we'll generate embeddings client-side
        params.dimension = dimension
      }

      await createMutation.mutateAsync(params)

      // Success: save embedding config override for this index
      const newIndexName = draftCollection.name.trim()
      const sourceCollection = draftCollection.sourceCollection

      // Always save the embedding config locally (for client-side embedding fallback)
      if (draftCollection.embeddingFunctionId && embeddingConfig) {
        const embeddingOverride: EmbeddingConfig = {
          provider: embeddingConfig.type as EmbeddingProviderType,
          modelName: embeddingConfig.modelName,
          ...(embeddingConfig.defaultDimension && !isSparseModel && {
            dimensions: dimension || embeddingConfig.defaultDimension
          }),
        }

        await window.electronAPI.profiles.setEmbeddingOverride(
          currentProfile.id,
          newIndexName,
          embeddingOverride
        )
      }

      // If this is a copy operation, clone vectors from source to target
      if (sourceCollection) {
        // Show clone progress dialog
        setCloneProgress({
          phase: 'preparing',
          totalVectors: 0,
          processedVectors: 0,
          message: 'Starting vector copy...',
        })
        setCloneProgressOpen(true)

        // Clear draft but keep isCreating true during clone
        setDraftCollection(null)
        setValidationErrors({})

        try {
          const result = await window.electronAPI.pinecone.cloneIndex(currentProfile.id, {
            sourceIndexName: sourceCollection.name,
            targetIndexName: newIndexName,
            regenerateEmbeddings: true,
          })

          if (result.success) {
            setCloneProgress({
              phase: 'complete',
              totalVectors: result.totalVectors,
              processedVectors: result.copiedVectors,
              message: `Copied ${result.copiedVectors} vectors`,
            })
            // Refresh indexes list
            refreshIndexes()
            // Select the new index
            setActiveCollection(newIndexName)
          } else {
            setCloneProgress({
              phase: 'error',
              totalVectors: result.totalVectors,
              processedVectors: result.copiedVectors,
              message: result.error || 'Clone failed',
            })
          }
        } catch (cloneError) {
          const cloneMessage = cloneError instanceof Error ? cloneError.message : 'Failed to clone vectors'
          setCloneProgress({
            phase: 'error',
            totalVectors: 0,
            processedVectors: 0,
            message: cloneMessage,
          })
        }
      } else {
        // Not a copy operation, just clear draft and select new index
        setDraftCollection(null)
        setValidationErrors({})
        setActiveCollection(newIndexName)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create index'
      setValidationErrors({ _form: message })
    } finally {
      setIsCreating(false)
    }
  }, [draftCollection, currentProfile, createMutation, setActiveCollection, refreshIndexes])

  const value: DraftCollectionContextValue = {
    draftCollection,
    isCreating,
    validationErrors,
    startCreation,
    startCopyFromCollection,
    updateDraft,
    cancelCreation,
    saveDraft,
    isCopyMode: draftCollection?.sourceCollection !== undefined,
    cloneProgress,
    cloneProgressOpen,
    setCloneProgressOpen,
    cancelClone,
  }

  return <DraftCollectionContext.Provider value={value}>{children}</DraftCollectionContext.Provider>
}

export function useDraftCollection() {
  const context = useContext(DraftCollectionContext)
  if (!context) {
    throw new Error('useDraftCollection must be used within a DraftCollectionProvider')
  }
  return context
}
