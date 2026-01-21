import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus } from 'lucide-react'
import { usePinecone } from '../../providers/PineconeProvider'
import { useCollection } from '../../context/CollectionContext'
import { useDraftCollection } from '../../context/DraftCollectionContext'
import { useDeleteIndexMutation } from '../../hooks/usePineconeQueries'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'

export function IndexesPanel() {
  const { currentProfile, indexes, indexesLoading, indexesError } = usePinecone()
  const { activeIndex, setActiveIndex } = useCollection()
  const { startCreation, draftCollection } = useDraftCollection()

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [indexToDelete, setIndexToDelete] = useState<string | null>(null)
  const [confirmationInput, setConfirmationInput] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deleteMutation = useDeleteIndexMutation(currentProfile?.id || '')

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; indexName: string } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  const handleIndexClick = (indexName: string) => {
    setActiveIndex(indexName)
  }

  // Handle right-click context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, indexName: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, indexName })
  }, [])

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [contextMenu])

  // Handle delete action - opens confirmation dialog
  const openDeleteDialog = useCallback((indexName: string) => {
    setIndexToDelete(indexName)
    setConfirmationInput('')
    setDeleteError(null)
    setDeleteDialogOpen(true)
    setContextMenu(null)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!indexToDelete) return

    // Verify the confirmation input matches the index name
    if (confirmationInput !== indexToDelete) {
      setDeleteError('Index name does not match')
      return
    }

    try {
      await deleteMutation.mutateAsync(indexToDelete)
      // If we deleted the active index, clear selection
      if (activeIndex === indexToDelete) {
        setActiveIndex(null)
      }
      setDeleteDialogOpen(false)
      setIndexToDelete(null)
      setConfirmationInput('')
      setDeleteError(null)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete index')
    }
  }, [indexToDelete, confirmationInput, deleteMutation, activeIndex, setActiveIndex])

  const handleCancelDelete = useCallback(() => {
    setDeleteDialogOpen(false)
    setIndexToDelete(null)
    setConfirmationInput('')
    setDeleteError(null)
  }, [])

  // Listen for menu delete event
  useEffect(() => {
    const handleMenuDelete = () => {
      if (activeIndex) {
        openDeleteDialog(activeIndex)
      }
    }

    window.addEventListener('menu:delete-collection', handleMenuDelete)
    return () => window.removeEventListener('menu:delete-collection', handleMenuDelete)
  }, [activeIndex, openDeleteDialog])

  // Keyboard shortcut: Cmd+Delete or Cmd+Backspace to delete active index
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'Delete' || e.key === 'Backspace')) {
        // Only trigger if not in an input/textarea and we have an active index
        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && activeIndex) {
          e.preventDefault()
          openDeleteDialog(activeIndex)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeIndex, openDeleteDialog])

  return (
    <aside
      className="h-full w-full flex flex-col flex-shrink-0"
      style={{
        background: 'var(--sidebar)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div className="px-2 py-2 border-b border-border">
        <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Indexes
        </h2>
      </div>

      {/* Indexes List */}
      <div className="flex-1 overflow-y-auto py-1">
        {indexesLoading && (
          <div className="px-2 py-2 text-[10px] text-muted-foreground">Loading...</div>
        )}

        {indexesError && (
          <div className="px-2 py-2 text-[10px] text-destructive">{indexesError}</div>
        )}

        {!indexesLoading && !indexesError && indexes.length === 0 && (
          <div className="px-2 py-2 text-[10px] text-muted-foreground text-center">
            No indexes
          </div>
        )}

        {!indexesLoading && !indexesError && indexes.length > 0 && (
          <div className="space-y-0.5">
            {indexes.map((index) => {
              const isActive = index.name === activeIndex

              return (
                <div
                  key={index.name}
                  className={`w-full px-2 py-1.5 text-left transition-colors duration-100 cursor-pointer ${
                    isActive
                      ? 'bg-black/[0.08] dark:bg-white/[0.10]'
                      : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'
                  }`}
                  onClick={() => handleIndexClick(index.name)}
                  onContextMenu={(e) => handleContextMenu(e, index.name)}
                  title={`${index.name}\n${index.dimension ? `${index.dimension}d · ` : ''}${index.metric}`}
                >
                  <div
                    className={`text-[11px] truncate ${
                      isActive
                        ? 'text-sidebar-foreground font-medium'
                        : 'text-sidebar-foreground'
                    }`}
                  >
                    {index.name}
                  </div>
                  <div className="text-[9px] text-muted-foreground truncate">
                    {index.dimension ? `${index.dimension}d` : 'sparse'}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer with Create button */}
      <div className="px-2 py-2 border-t border-border">
        <button
          onClick={startCreation}
          disabled={draftCollection !== null}
          className="w-full h-6 flex items-center justify-center gap-1 text-[10px] rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Create new index"
        >
          <Plus className="h-3 w-3" />
          <span>New</span>
        </button>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[160px] bg-popover border border-border rounded-md shadow-md py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full px-3 py-1.5 text-left text-[12px] text-destructive hover:bg-destructive/10 transition-colors"
            onClick={() => openDeleteDialog(contextMenu.indexName)}
          >
            Delete Index
          </button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => !open && handleCancelDelete()}>
        <DialogContent className="sm:max-w-[320px] p-0 gap-0 rounded-xl border-0 bg-background/80 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.3)] ring-1 ring-black/10 dark:ring-white/10">
          <DialogHeader className="px-5 pt-5 pb-4 text-center space-y-2">
            <DialogTitle className="text-[13px] font-semibold text-destructive">
              Delete Index
            </DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground leading-[1.4]">
              This will permanently delete the <span className="font-medium text-foreground">{indexToDelete}</span> index
              and all its vectors. This action cannot be undone.
            </DialogDescription>

            {/* Confirmation input */}
            <div className="pt-1">
              <label className="text-[10px] text-muted-foreground">
                Type <span className="font-mono text-foreground">{indexToDelete}</span> to confirm
              </label>
              <input
                type="text"
                value={confirmationInput}
                onChange={(e) => {
                  setConfirmationInput(e.target.value)
                  setDeleteError(null)
                }}
                placeholder={indexToDelete || ''}
                className={cn(
                  "mt-1.5 w-full h-7 px-2 text-[11px] text-center",
                  "rounded-md border border-input bg-background/50",
                  "placeholder:text-muted-foreground/40",
                  "focus:outline-none focus:ring-1 focus:ring-ring"
                )}
                style={{ boxShadow: 'inset 0 1px 2px 0 rgb(0 0 0 / 0.05)' }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && confirmationInput === indexToDelete) {
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
              disabled={deleteMutation.isPending || confirmationInput !== indexToDelete}
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
