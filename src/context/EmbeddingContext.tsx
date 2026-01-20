import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useChromaDB } from '../providers/ChromaDBProvider'
import { useCollection } from './CollectionContext'

interface EmbeddingContextType {
  // Client-side override (persisted per profile/index)
  clientOverride: EmbeddingConfig | null

  // The active config
  activeConfig: {
    type: 'client' | 'default'
    config: EmbeddingConfig | null
  }

  // Actions
  setOverride: (override: EmbeddingConfig) => Promise<void>
  clearOverride: () => Promise<void>

  // Loading state
  isLoading: boolean
}

const EmbeddingContext = createContext<EmbeddingContextType | undefined>(undefined)

export function EmbeddingProvider({ children }: { children: ReactNode }) {
  const { currentProfile } = useChromaDB()
  const { activeCollection } = useCollection()

  const [clientOverride, setClientOverride] = useState<EmbeddingConfig | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Fetch client override when index changes
  useEffect(() => {
    const fetchOverride = async () => {
      if (!currentProfile?.id || !activeCollection) {
        setClientOverride(null)
        return
      }

      setIsLoading(true)
      try {
        const override = await window.electronAPI.profiles.getEmbeddingOverride(
          currentProfile.id,
          activeCollection
        )
        setClientOverride(override)
      } catch (err) {
        console.error('Failed to fetch embedding override:', err)
        setClientOverride(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchOverride()
  }, [currentProfile?.id, activeCollection])

  const setOverride = useCallback(async (override: EmbeddingConfig) => {
    if (!currentProfile?.id || !activeCollection) return

    await window.electronAPI.profiles.setEmbeddingOverride(
      currentProfile.id,
      activeCollection,
      override
    )
    setClientOverride(override)
  }, [currentProfile?.id, activeCollection])

  const clearOverride = useCallback(async () => {
    if (!currentProfile?.id || !activeCollection) return

    await window.electronAPI.profiles.clearEmbeddingOverride(
      currentProfile.id,
      activeCollection
    )
    setClientOverride(null)
  }, [currentProfile?.id, activeCollection])

  // Determine active config - use client override or profile default
  const defaultConfig = currentProfile?.defaultEmbeddingConfig || null
  const activeConfig: EmbeddingContextType['activeConfig'] = clientOverride
    ? { type: 'client', config: clientOverride }
    : { type: 'default', config: defaultConfig }

  return (
    <EmbeddingContext.Provider
      value={{
        clientOverride,
        activeConfig,
        setOverride,
        clearOverride,
        isLoading,
      }}
    >
      {children}
    </EmbeddingContext.Provider>
  )
}

export function useEmbedding() {
  const context = useContext(EmbeddingContext)
  if (context === undefined) {
    throw new Error('useEmbedding must be used within an EmbeddingProvider')
  }
  return context
}
