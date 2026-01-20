import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface IndexClipboard {
  type: 'collection'  // Keep 'collection' for internal compatibility
  collection: IndexInfo
  sourceProfileId: string
}

interface VectorsClipboard {
  type: 'documents'  // Keep 'documents' for internal compatibility
  documents: Array<{
    id: string
    document: string | null  // Will store text from metadata if available
    metadata: Record<string, unknown> | null
  }>
  sourceCollectionName: string
  sourceProfileId: string
}

type ClipboardItem = IndexClipboard | VectorsClipboard

interface ClipboardContextValue {
  clipboard: ClipboardItem | null

  // Index methods (legacy name: collection)
  copyCollection: (index: IndexInfo, profileId: string) => void
  hasCopiedCollection: boolean

  // Vector methods (legacy name: documents)
  copyDocuments: (vectors: VectorRecord[], indexName: string, profileId: string) => void
  hasCopiedDocuments: boolean

  // Shared
  clearClipboard: () => void
}

const ClipboardContext = createContext<ClipboardContextValue | null>(null)

interface ClipboardProviderProps {
  children: ReactNode
}

export function ClipboardProvider({ children }: ClipboardProviderProps) {
  const [clipboard, setClipboard] = useState<ClipboardItem | null>(null)

  const copyCollection = useCallback((index: IndexInfo, profileId: string) => {
    setClipboard({ type: 'collection', collection: index, sourceProfileId: profileId })
  }, [])

  const copyDocuments = useCallback((vectors: VectorRecord[], indexName: string, profileId: string) => {
    // Copy vectors without embeddings (they'll be regenerated on paste)
    // Store text from metadata.text if available
    const vectorsToClipboard = vectors.map(vec => ({
      id: vec.id,
      document: (vec.metadata?.text as string) || null,
      metadata: vec.metadata || null,
    }))
    setClipboard({
      type: 'documents',
      documents: vectorsToClipboard,
      sourceCollectionName: indexName,
      sourceProfileId: profileId,
    })
  }, [])

  const clearClipboard = useCallback(() => {
    setClipboard(null)
  }, [])

  const value: ClipboardContextValue = {
    clipboard,
    copyCollection,
    hasCopiedCollection: clipboard?.type === 'collection',
    copyDocuments,
    hasCopiedDocuments: clipboard?.type === 'documents',
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
