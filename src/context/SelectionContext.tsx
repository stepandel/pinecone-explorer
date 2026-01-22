import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react'

interface SelectionContextValue {
  // Index selection (Pinecone indexes)
  activeIndex: string | null
  setActiveIndex: (indexName: string | null) => void

  // Namespace selection (within an index)
  activeNamespace: string | null
  setActiveNamespace: (namespace: string | null) => void

  // Combined selection helper
  selectIndexAndNamespace: (indexName: string | null, namespace?: string | null) => void
}

const SelectionContext = createContext<SelectionContextValue | null>(null)

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [activeIndex, setActiveIndexState] = useState<string | null>(null)
  const [activeNamespace, setActiveNamespaceState] = useState<string | null>(null)

  // When setting active index, clear namespace if index changes
  const setActiveIndex = useCallback((indexName: string | null) => {
    setActiveIndexState((prevIndex) => {
      if (prevIndex !== indexName) {
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

  const value = useMemo<SelectionContextValue>(() => ({
    activeIndex,
    setActiveIndex,
    activeNamespace,
    setActiveNamespace,
    selectIndexAndNamespace,
  }), [activeIndex, setActiveIndex, activeNamespace, setActiveNamespace, selectIndexAndNamespace])

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  )
}

export function useSelection() {
  const context = useContext(SelectionContext)
  if (!context) {
    throw new Error('useSelection must be used within a SelectionProvider')
  }
  return context
}