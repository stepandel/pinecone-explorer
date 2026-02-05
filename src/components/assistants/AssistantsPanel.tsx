import { useCallback, useEffect, useState } from 'react'
import { ChevronsLeft } from 'lucide-react'
import { usePinecone } from '../../providers/PineconeProvider'
import { useAssistantSelection } from '../../context/AssistantSelectionContext'
import { useAssistantsQuery, useDeleteAssistantMutation } from '../../hooks/useAssistantQueries'
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut'
import { SHORTCUTS } from '../../constants/keyboard-shortcuts'
import { NewButton } from '../ui/new-button'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'
import { cn } from '@/lib/utils'
import { AssistantStatus } from '../../../electron/types'

interface AssistantsPanelProps {
  onToggleCollapse?: () => void
  onCreateNew?: () => void
  onEditAssistant?: (assistantName: string) => void
}

// Status indicator colors based on assistant status
function getStatusColor(status: AssistantStatus): string {
  switch (status) {
    case 'Ready':
      return 'bg-green-500'
    case 'Initializing':
      return 'bg-yellow-500'
    case 'Failed':
    case 'InitializationFailed':
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
    case 'InitializationFailed':
      return 'Initialization failed'
    case 'Terminating':
      return 'Terminating...'
    default:
      return status
  }
}

export function AssistantsPanel({ onToggleCollapse, onCreateNew, onEditAssistant }: AssistantsPanelProps) {
  const { currentProfile } = usePinecone()
  const { activeAssistant, setActiveAssistant } = useAssistantSelection()

  // Fetch assistants
  const {
    data: assistants = [],
    isLoading: assistantsLoading,
    error: assistantsError,
  } = useAssistantsQuery(currentProfile?.id || null)

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [assistantToDelete, setAssistantToDelete] = useState<string | null>(null)
  const [confirmationInput, setConfirmationInput] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deleteMutation = useDeleteAssistantMutation(currentProfile?.id || '')

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
      window.electronAPI.contextMenu.showAssistantMenu(assistantName)
    },
    []
  )

  // Handle right-click on panel background
  const handlePanelContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    // No panel-level context menu for assistants currently
  }, [])

  // Handle delete action - opens confirmation dialog
  const openDeleteDialog = useCallback((assistantName: string) => {
    setAssistantToDelete(assistantName)
    setConfirmationInput('')
    setDeleteError(null)
    setDeleteDialogOpen(true)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!assistantToDelete || !currentProfile?.id) return
    
    // Prevent duplicate delete calls while mutation is in flight
    if (deleteMutation.isPending) return

    // Verify the confirmation input matches the assistant name
    if (confirmationInput !== assistantToDelete) {
      setDeleteError('Assistant name does not match')
      return
    }

    try {
      await deleteMutation.mutateAsync(assistantToDelete)
      // If we deleted the active assistant, clear selection
      if (activeAssistant === assistantToDelete) {
        setActiveAssistant(null)
      }
      setDeleteDialogOpen(false)
      setAssistantToDelete(null)
      setConfirmationInput('')
      setDeleteError(null)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete assistant')
    }
  }, [assistantToDelete, confirmationInput, deleteMutation, activeAssistant, setActiveAssistant])

  const handleCancelDelete = useCallback(() => {
    setDeleteDialogOpen(false)
    setAssistantToDelete(null)
    setConfirmationInput('')
    setDeleteError(null)
  }, [])

  // Handle edit action
  const handleEditAssistant = useCallback((assistantName: string) => {
    // Select the assistant first
    setActiveAssistant(assistantName)
    // Call the edit callback if provided
    if (onEditAssistant) {
      onEditAssistant(assistantName)
    }
  }, [setActiveAssistant, onEditAssistant])

  // Listen for native context menu actions
  useEffect(() => {
    const unsubscribe = window.electronAPI.contextMenu.onAssistantAction((data) => {
      if (data.action === 'delete' && data.assistantName) {
        openDeleteDialog(data.assistantName)
      } else if (data.action === 'edit' && data.assistantName) {
        handleEditAssistant(data.assistantName)
      }
    })
    return unsubscribe
  }, [openDeleteDialog, handleEditAssistant])

  const handleCreateNew = useCallback(() => {
    if (onCreateNew) {
      onCreateNew()
    }
  }, [onCreateNew])

  // Keyboard shortcut for new assistant (Cmd+Shift+N)
  useKeyboardShortcut(SHORTCUTS.NEW_ASSISTANT, handleCreateNew)

  // Listen for menu IPC events
  useEffect(() => {
    const unsubNewAssistant = window.electronAPI.menu.onNewAssistant(() => {
      handleCreateNew()
    })
    const unsubEditAssistant = window.electronAPI.menu.onEditAssistant(() => {
      if (activeAssistant) {
        handleEditAssistant(activeAssistant)
      }
    })
    const unsubDeleteAssistant = window.electronAPI.menu.onDeleteAssistant(() => {
      if (activeAssistant) {
        openDeleteDialog(activeAssistant)
      }
    })

    return () => {
      unsubNewAssistant()
      unsubEditAssistant()
      unsubDeleteAssistant()
    }
  }, [handleCreateNew, activeAssistant, handleEditAssistant, openDeleteDialog])

  return (
    <aside
      className="h-full w-full flex flex-col flex-shrink-0"
      style={{
        background: 'var(--sidebar)',
        borderRight: '1px solid var(--border)',
        boxShadow: 'var(--sidebar-shadow)',
      }}
      onContextMenu={handlePanelContextMenu}
      data-testid="assistants-panel"
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
            data-testid="new-assistant-button"
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
                <button
                  key={assistant.name}
                  type="button"
                  aria-pressed={isActive}
                  className={`w-full px-2 py-1.5 text-left transition-colors duration-100 cursor-pointer ${
                    isActive
                      ? 'bg-black/[0.08] dark:bg-white/[0.10]'
                      : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'
                  }`}
                  onClick={() => handleAssistantClick(assistant.name)}
                  onContextMenu={(e) => handleAssistantContextMenu(e, assistant.name)}
                  title={`${assistant.name}\nStatus: ${getStatusTooltip(assistant.status)}`}
                  data-testid="assistant-item"
                  data-assistant-name={assistant.name}
                >
                  <div className="flex items-center gap-1.5">
                    {/* Status indicator */}
                    <div
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getStatusColor(assistant.status)}`}
                      title={getStatusTooltip(assistant.status)}
                      data-testid="assistant-status"
                      data-status={assistant.status}
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
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => !open && handleCancelDelete()}>
        <DialogContent className="sm:max-w-[320px] p-0 gap-0 rounded-xl border-0 bg-background/80 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.3)] ring-1 ring-black/10 dark:ring-white/10">
          <DialogHeader className="px-5 pt-5 pb-4 text-center space-y-2">
            <DialogTitle className="text-[13px] font-semibold text-destructive">
              Delete Assistant
            </DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground leading-[1.4]">
              This will permanently delete the <span className="font-medium text-foreground">{assistantToDelete}</span> assistant
              and all its files. This action cannot be undone.
            </DialogDescription>

            {/* Confirmation input */}
            <div className="pt-1">
              <label className="text-[10px] text-muted-foreground">
                Type <span className="font-mono text-foreground">{assistantToDelete}</span> to confirm
              </label>
              <input
                type="text"
                value={confirmationInput}
                onChange={(e) => {
                  setConfirmationInput(e.target.value)
                  setDeleteError(null)
                }}
                placeholder={assistantToDelete || ''}
                className={cn(
                  "mt-1.5 w-full h-7 px-2 text-[11px] text-center",
                  "rounded-md border border-input bg-background/50",
                  "placeholder:text-muted-foreground/40",
                  "focus:outline-none focus:ring-1 focus:ring-ring"
                )}
                style={{ boxShadow: 'inset 0 1px 2px 0 rgb(0 0 0 / 0.05)' }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && confirmationInput === assistantToDelete) {
                    handleConfirmDelete()
                  }
                }}
              />
              {deleteError && (
                <p className="mt-2 text-[10px] text-destructive">{deleteError}</p>
              )}
            </div>
          </DialogHeader>

          <DialogFooter className="px-4 pb-4 flex-row gap-2 sm:space-x-0">
            <Button
              variant="outline"
              onClick={handleCancelDelete}
              disabled={deleteMutation.isPending}
              className="flex-1 h-[26px] text-[12px] font-normal"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending || confirmationInput !== assistantToDelete}
              className="flex-1 h-[26px] text-[12px] font-medium"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
