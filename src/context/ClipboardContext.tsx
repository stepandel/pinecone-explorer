import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface VectorsClipboard {
  type: 'vectors'
  vectors: Array<{
    id: string
    metadata: Record<string, unknown> | null
  }>
  sourceIndexName: string
  sourceProfileId: string
}

type ClipboardItem = VectorsClipboard

interface ClipboardContextValue {
  clipboard: ClipboardItem | null

  // Vector methods
  copyVectors: (vectors: VectorRecord[], indexName: string, profileId: string) => void
  hasCopiedVectors: boolean

  // Shared
  clearClipboard: () => void
}

const ClipboardContext = createContext<ClipboardContextValue | null>(null)

interface ClipboardProviderProps {
  children: ReactNode
}

export function ClipboardProvider({ children }: ClipboardProviderProps) {
  const [clipboard, setClipboard] = useState<ClipboardItem | null>(null)


  const copyVectors = useCallback((vectors: VectorRecord[], indexName: string, profileId: string) => {
    // Copy vectors without embeddings (they'll be regenerated on paste)
    const vectorsToClipboard = vectors.map(vec => ({
      id: vec.id,
      metadata: vec.metadata || null,
    }))
    setClipboard({
      type: 'vectors',
      vectors: vectorsToClipboard,
      sourceIndexName: indexName,
      sourceProfileId: profileId,
    })
  }, [])

  const clearClipboard = useCallback(() => {
    setClipboard(null)
  }, [])

  const value: ClipboardContextValue = {
    clipboard,
    copyVectors,
    hasCopiedVectors: clipboard?.type === 'vectors',
    clearClipboard,
  }

  return <ClipboardContext.Provider value={value}>{children}</ClipboardContext.Provider>
}

export function useClipboard() {
  const context = useContext(ClipboardContext)
  if (!context) {
    throw new Error('useClipboard must be used within a ClipboardProvider')
  }
  return context
}
