import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react'

interface AssistantSelectionContextValue {
  // Selected assistant name
  activeAssistant: string | null
  setActiveAssistant: (assistantName: string | null) => void
}

const AssistantSelectionContext = createContext<AssistantSelectionContextValue | null>(null)

export function AssistantSelectionProvider({ children }: { children: ReactNode }) {
  const [activeAssistant, setActiveAssistantState] = useState<string | null>(null)

  const setActiveAssistant = useCallback((assistantName: string | null) => {
    setActiveAssistantState(assistantName)
  }, [])

  const value = useMemo<AssistantSelectionContextValue>(
    () => ({
      activeAssistant,
      setActiveAssistant,
    }),
    [activeAssistant, setActiveAssistant]
  )

  return (
    <AssistantSelectionContext.Provider value={value}>
      {children}
    </AssistantSelectionContext.Provider>
  )
}

export function useAssistantSelection() {
  const context = useContext(AssistantSelectionContext)
  if (!context) {
    throw new Error('useAssistantSelection must be used within an AssistantSelectionProvider')
  }
  return context
}
