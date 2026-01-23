import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react'
import { SchemaField } from '../components/shared/SchemaEditor'

export interface NamespaceSetup {
  indexName: string
  namespace: string
  schema: SchemaField[]
  textField: string | null
}

interface NamespaceSetupContextValue {
  pendingSetup: NamespaceSetup | null
  setPendingSetup: (setup: NamespaceSetup | null) => void
  clearPendingSetup: () => void
}

const NamespaceSetupContext = createContext<NamespaceSetupContextValue | null>(null)

export function NamespaceSetupProvider({ children }: { children: ReactNode }) {
  const [pendingSetup, setPendingSetupState] = useState<NamespaceSetup | null>(null)

  const setPendingSetup = useCallback((setup: NamespaceSetup | null) => {
    setPendingSetupState(setup)
  }, [])

  const clearPendingSetup = useCallback(() => {
    setPendingSetupState(null)
  }, [])

  const value = useMemo<NamespaceSetupContextValue>(() => ({
    pendingSetup,
    setPendingSetup,
    clearPendingSetup,
  }), [pendingSetup, setPendingSetup, clearPendingSetup])

  return (
    <NamespaceSetupContext.Provider value={value}>
      {children}
    </NamespaceSetupContext.Provider>
  )
}

export function useNamespaceSetup() {
  const context = useContext(NamespaceSetupContext)
  if (!context) {
    throw new Error('useNamespaceSetup must be used within a NamespaceSetupProvider')
  }
  return context
}
