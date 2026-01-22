import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react'
import { usePinecone } from '../providers/PineconeProvider'
import { useSelection } from './SelectionContext'
import { useIndexesQuery } from '../hooks/usePineconeQueries'

interface EmbeddingContextType {
  // Index's embed config from API (for integrated inference indexes)
  indexEmbedConfig: IndexEmbedConfig | null

  // Client-side override (persisted per profile/index, ignored for integrated inference indexes)
  clientOverride: EmbeddingConfig | null

  // The active config - priority: index embed > client override > profile default
  activeConfig: {
    type: 'index' | 'client' | 'default'  // 'index' when using integrated inference
    config: EmbeddingConfig | null
  }

  // Text field to use for embedding (from index's fieldMap.text or '_text')
  textField: string

  // Actions (disabled when using integrated inference)
  setOverride: (override: EmbeddingConfig) => Promise<void>
  clearOverride: () => Promise<void>

  // Whether override is allowed (false for integrated inference indexes)
  canOverride: boolean

  // Loading state
  isLoading: boolean
}

const EmbeddingContext = createContext<EmbeddingContextType | undefined>(undefined)

/**
 * Convert index embed config (from Pinecone API) to our EmbeddingConfig format
 */
function convertIndexEmbedToConfig(embed: IndexEmbedConfig): EmbeddingConfig {
  return {
    provider: 'pinecone',
    modelName: embed.model,
    vectorType: embed.vectorType || 'dense',
    dimensions: embed.dimension,
    // inputType will be set at call time ('query' for search, 'passage' for upsert)
  }
}

export function EmbeddingProvider({ children }: { children: ReactNode }) {
  const { currentProfile } = usePinecone()
  const { activeIndex } = useSelection()

  const [clientOverride, setClientOverride] = useState<EmbeddingConfig | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Fetch indexes to get embed config for active index
  const { data: indexes } = useIndexesQuery(currentProfile?.id || null)

  // Get the current index's info (including embed config if integrated inference)
  const currentIndexInfo = useMemo(() => {
    if (!activeIndex || !indexes) return null
    return indexes.find(idx => idx.name === activeIndex) || null
  }, [activeIndex, indexes])

  // Index's embed config (null if not an integrated inference index)
  const indexEmbedConfig = currentIndexInfo?.embed || null

  // Text field to use (from index's fieldMap.text or '_text')
  const textField = indexEmbedConfig?.fieldMap?.text || '_text'

  // Whether override is allowed (not allowed for integrated inference indexes)
  const canOverride = !indexEmbedConfig

  // Fetch client override when index changes
  useEffect(() => {
    const fetchOverride = async () => {
      if (!currentProfile?.id || !activeIndex) {
        setClientOverride(null)
        return
      }

      setIsLoading(true)
      try {
        const override = await window.electronAPI.profiles.getEmbeddingOverride(
          currentProfile.id,
          activeIndex
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
  }, [currentProfile?.id, activeIndex])

  const setOverride = useCallback(async (override: EmbeddingConfig) => {
    // Don't allow override for integrated inference indexes
    if (!currentProfile?.id || !activeIndex || !canOverride) return

    await window.electronAPI.profiles.setEmbeddingOverride(
      currentProfile.id,
      activeIndex,
      override
    )
    setClientOverride(override)
  }, [currentProfile?.id, activeIndex, canOverride])

  const clearOverride = useCallback(async () => {
    if (!currentProfile?.id || !activeIndex) return

    await window.electronAPI.profiles.clearEmbeddingOverride(
      currentProfile.id,
      activeIndex
    )
    setClientOverride(null)
  }, [currentProfile?.id, activeIndex])

  // Determine active config - priority: index embed > client override > profile default
  const defaultConfig = currentProfile?.defaultEmbeddingConfig || null

  const activeConfig: EmbeddingContextType['activeConfig'] = useMemo(() => {
    // If index has integrated inference, it's authoritative (no override)
    if (indexEmbedConfig) {
      return { type: 'index' as const, config: convertIndexEmbedToConfig(indexEmbedConfig) }
    }
    // Otherwise check client override
    if (clientOverride) {
      return { type: 'client' as const, config: clientOverride }
    }
    // Fall back to profile default
    return { type: 'default' as const, config: defaultConfig }
  }, [indexEmbedConfig, clientOverride, defaultConfig])

  return (
    <EmbeddingContext.Provider
      value={{
        indexEmbedConfig,
        clientOverride,
        activeConfig,
        textField,
        setOverride,
        clearOverride,
        canOverride,
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
