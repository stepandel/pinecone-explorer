import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface CollectionContextValue {
  // Index selection (Pinecone indexes)
  activeIndex: string | null
  setActiveIndex: (indexName: string | null) => void

  // Namespace selection (within an index)
  activeNamespace: string | null
  setActiveNamespace: (namespace: string | null) => void

  // Combined selection helper
  selectIndexAndNamespace: (indexName: string | null, namespace?: string | null) => void

  // Legacy alias for backwards compatibility
  activeCollection: string | null
  setActiveCollection: (collectionName: string | null) => void
}

const CollectionContext = createContext<CollectionContextValue | null>(null)

interface CollectionProviderProps {
  children: ReactNode
}

export function CollectionProvider({ children }: CollectionProviderProps) {
  const [activeIndex, setActiveIndexState] = useState<string | null>(null)
  const [activeNamespace, setActiveNamespaceState] = useState<string | null>(null)

  // When setting active index, clear namespace if index changes
  const setActiveIndex = useCallback((indexName: string | null) => {
    setActiveIndexState((prevIndex) => {
      if (prevIndex !== indexName) {
        // Clear namespace when index changes
        setActiveNamespaceState(null)
      }
      return indexName
    })
  }, [])

  const setActiveNamespace = useCallback((namespace: string | null) => {
    setActiveNamespaceState(namespace)
  }, [])

  // Helper to set both at once
  const selectIndexAndNamespace = useCallback((indexName: string | null, namespace: string | null = null) => {
    setActiveIndexState(indexName)
    setActiveNamespaceState(namespace)
  }, [])

  // Legacy aliases - map to namespace for backwards compatibility
  const activeCollection = activeNamespace
  const setActiveCollection = setActiveNamespace

  const value: CollectionContextValue = {
    activeIndex,
    setActiveIndex,
    activeNamespace,
    setActiveNamespace,
    selectIndexAndNamespace,
    // Legacy
    activeCollection,
    setActiveCollection,
  }

  return (
    <CollectionContext.Provider value={value}>
      {children}
    </CollectionContext.Provider>
  )
}

export function useCollection() {
  const context = useContext(CollectionContext)
  if (!context) {
    throw new Error('useCollection must be used within a CollectionProvider')
  }
  return context
}
