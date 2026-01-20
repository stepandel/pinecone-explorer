import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { useChromaDB } from '../providers/ChromaDBProvider'
import { useCreateIndexMutation } from '../hooks/usePineconeQueries'
import { useCollection } from './CollectionContext'

export interface DraftCollection {
  name: string
  dimensionOverride: string // String to allow empty input
  metric?: 'cosine' | 'euclidean' | 'dotproduct'
  serverlessSpec?: {
    cloud: 'aws' | 'gcp' | 'azure'
    region: string
  }
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

  const { currentProfile } = useChromaDB()
  const { setActiveCollection } = useCollection()
  const createMutation = useCreateIndexMutation(currentProfile?.id || '')

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

    // Validate
    const errors: Record<string, string> = {}
    if (!draftCollection.name.trim()) {
      errors.name = 'Index name is required'
    }

    // Validate dimension
    const dimension = parseInt(draftCollection.dimensionOverride, 10)
    if (!draftCollection.dimensionOverride.trim() || isNaN(dimension) || dimension <= 0) {
      errors.dimension = 'Dimension must be a positive number'
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
        dimension,
        metric: draftCollection.metric || 'cosine',
        spec: {
          serverless: draftCollection.serverlessSpec || {
            cloud: 'aws',
            region: 'us-east-1',
          },
        },
      }

      await createMutation.mutateAsync(params)

      // Success: clear draft and select new index
      const newIndexName = draftCollection.name.trim()
      setDraftCollection(null)
      setValidationErrors({})
      setActiveCollection(newIndexName)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create index'
      setValidationErrors({ _form: message })
    } finally {
      setIsCreating(false)
    }
  }, [draftCollection, currentProfile, createMutation, setActiveCollection])

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
