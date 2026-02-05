import { useCallback } from 'react'
import { ChevronsLeft } from 'lucide-react'
import { usePinecone } from '../../providers/PineconeProvider'
import { useAssistantSelection } from '../../context/AssistantSelectionContext'
import { useAssistantsQuery } from '../../hooks/useAssistantQueries'
import { NewButton } from '../ui/new-button'
import { AssistantStatus } from '../../../electron/types'

interface AssistantsPanelProps {
  onToggleCollapse?: () => void
  onCreateNew?: () => void
}

// Status indicator colors based on assistant status
function getStatusColor(status: AssistantStatus): string {
  switch (status) {
    case 'Ready':
      return 'bg-green-500'
    case 'Initializing':
      return 'bg-yellow-500'
    case 'Failed':
      return 'bg-red-500'
    case 'Terminating':
      return 'bg-orange-500'
    default:
      return 'bg-gray-400'
  }
}

// Status tooltip text
function getStatusTooltip(status: AssistantStatus): string {
  switch (status) {
    case 'Ready':
      return 'Ready'
    case 'Initializing':
      return 'Initializing...'
    case 'Failed':
      return 'Failed'
    case 'Terminating':
      return 'Terminating...'
    default:
      return status
  }
}

export function AssistantsPanel({ onToggleCollapse, onCreateNew }: AssistantsPanelProps) {
  const { currentProfile } = usePinecone()
  const { activeAssistant, setActiveAssistant } = useAssistantSelection()

  // Fetch assistants
  const {
    data: assistants = [],
    isLoading: assistantsLoading,
    error: assistantsError,
  } = useAssistantsQuery(currentProfile?.id || null)

  const handleAssistantClick = useCallback(
    (assistantName: string) => {
      setActiveAssistant(assistantName)
    },
    [setActiveAssistant]
  )

  // Handle right-click on assistant item - show native context menu
  const handleAssistantContextMenu = useCallback(
    (e: React.MouseEvent, assistantName: string) => {
      e.preventDefault()
      e.stopPropagation()
      // TODO: Implement context menu for assistants when needed
      // window.electronAPI.contextMenu.showAssistantMenu(assistantName)
      console.log('Context menu for assistant:', assistantName)
    },
    []
  )

  // Handle right-click on panel background
  const handlePanelContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    // TODO: Implement panel context menu for assistants when needed
    // window.electronAPI.contextMenu.showAssistantPanelMenu()
    console.log('Panel context menu')
  }, [])

  const handleCreateNew = useCallback(() => {
    if (onCreateNew) {
      onCreateNew()
    }
  }, [onCreateNew])

  return (
    <aside
      className="h-full w-full flex flex-col flex-shrink-0"
      style={{
        background: 'var(--sidebar)',
        borderRight: '1px solid var(--border)',
        boxShadow: 'var(--sidebar-shadow)',
      }}
      onContextMenu={handlePanelContextMenu}
    >
      {/* Header */}
      <div className="px-2 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Assistants
          </h2>
          <NewButton
            onClick={handleCreateNew}
            label="Assistant"
            title="Create new assistant"
            iconOnly
          />
        </div>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-0.5 rounded hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors"
            title="Collapse panel"
          >
            <ChevronsLeft className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Assistants List */}
      <div className="flex-1 overflow-y-auto py-1">
        {assistantsLoading && (
          <div className="px-2 py-2 text-[10px] text-muted-foreground">Loading...</div>
        )}

        {assistantsError && (
          <div className="px-2 py-2 text-[10px] text-destructive">
            {assistantsError instanceof Error ? assistantsError.message : 'Failed to load assistants'}
          </div>
        )}

        {!assistantsLoading && !assistantsError && assistants.length === 0 && (
          <div className="px-2 py-2 text-[10px] text-muted-foreground text-center">
            No assistants
          </div>
        )}

        {!assistantsLoading && !assistantsError && assistants.length > 0 && (
          <div className="space-y-0.5">
            {assistants.map((assistant) => {
              const isActive = assistant.name === activeAssistant

              return (
                <div
                  key={assistant.name}
                  className={`w-full px-2 py-1.5 text-left transition-colors duration-100 cursor-pointer ${
                    isActive
                      ? 'bg-black/[0.08] dark:bg-white/[0.10]'
                      : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'
                  }`}
                  onClick={() => handleAssistantClick(assistant.name)}
                  onContextMenu={(e) => handleAssistantContextMenu(e, assistant.name)}
                  title={`${assistant.name}\nStatus: ${getStatusTooltip(assistant.status)}`}
                >
                  <div className="flex items-center gap-1.5">
                    {/* Status indicator */}
                    <div
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getStatusColor(assistant.status)}`}
                      title={getStatusTooltip(assistant.status)}
                    />
                    <div
                      className={`text-[11px] truncate flex-1 ${
                        isActive
                          ? 'text-sidebar-foreground font-medium'
                          : 'text-sidebar-foreground'
                      }`}
                    >
                      {assistant.name}
                    </div>
                  </div>
                  {assistant.instructions && (
                    <div className="text-[9px] text-muted-foreground truncate pl-3">
                      {assistant.instructions}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
