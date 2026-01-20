import { useState, useEffect, useCallback } from 'react'
import { Plus } from 'lucide-react'
import { usePinecone } from '../../providers/PineconeProvider'
import { useCollection } from '../../context/CollectionContext'
import { useDraftCollection } from '../../context/DraftCollectionContext'
import { useClipboard } from '../../context/ClipboardContext'
import { useDeleteIndexMutation } from '../../hooks/usePineconeQueries'
import { SHORTCUTS, matchesShortcut } from '../../constants/keyboard-shortcuts'
import { Button } from '../ui/button'
import { DeleteCollectionDialog } from './DeleteCollectionDialog'

const inputClassName = "w-full h-6 text-[11px] py-0 px-1.5 pr-5 rounded-md bg-black/[0.04] dark:bg-white/[0.06] placeholder:text-sidebar-foreground/50 text-sidebar-foreground focus:outline-none focus:ring-1 focus:ring-sidebar-ring/50 transition-colors"
const inputStyle = { boxShadow: 'inset 0 0.5px 1px 0 rgb(0 0 0 / 0.04)' }

export function CollectionPanel() {
  const { indexes, indexesLoading, indexesError, refreshIndexes, currentProfile } = usePinecone()
  const { activeCollection, setActiveCollection } = useCollection()
  const { draftCollection, startCreation, startCopyFromCollection, updateDraft, cancelCreation } = useDraftCollection()
  const { clipboard, copyCollection, hasCopiedCollection } = useClipboard()
  const [searchTerm, setSearchTerm] = useState('')

  // Deletion state
  const [markedForDeletion, setMarkedForDeletion] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const deleteMutation = useDeleteIndexMutation(currentProfile?.id || '')

  // Get the index info for the one marked for deletion
  const markedIndex = markedForDeletion
    ? indexes.find(c => c.name === markedForDeletion)
    : null

  const handleCollectionClick = (indexName: string) => {
    // Cancel creation mode if selecting existing index
    if (draftCollection) {
      cancelCreation()
    }
    // Clear deletion mark if clicking on a different index
    if (markedForDeletion && markedForDeletion !== indexName) {
      setMarkedForDeletion(null)
    }
    setActiveCollection(indexName)
  }

  const handleCreateClick = () => {
    setMarkedForDeletion(null) // Clear any deletion mark
    startCreation()
  }

  // Toggle deletion mark for active index
  const handleToggleDeletion = useCallback(() => {
    if (!activeCollection || draftCollection) return

    if (markedForDeletion === activeCollection) {
      // Unmark
      setMarkedForDeletion(null)
    } else {
      // Mark for deletion
      setMarkedForDeletion(activeCollection)
    }
  }, [activeCollection, markedForDeletion, draftCollection])

  // Commit deletion
  const handleCommitDeletion = useCallback(async () => {
    if (!markedForDeletion || !markedIndex) return

    // Show confirmation dialog for indexes (they may have vectors)
    setShowDeleteDialog(true)
  }, [markedForDeletion, markedIndex])

  // Handle confirmed deletion (from dialog)
  const handleConfirmedDeletion = useCallback(async () => {
    if (!markedForDeletion) return

    try {
      await deleteMutation.mutateAsync(markedForDeletion)
      // Clear selection if we deleted the active index
      if (activeCollection === markedForDeletion) {
        setActiveCollection(null)
      }
      setMarkedForDeletion(null)
      setShowDeleteDialog(false)
    } catch (error) {
      console.error('Failed to delete index:', error)
    }
  }, [markedForDeletion, deleteMutation, activeCollection, setActiveCollection])

  // Copy index to clipboard
  const handleCopyIndex = useCallback((indexName: string) => {
    if (!currentProfile) return
    const index = indexes.find(c => c.name === indexName)
    if (index) {
      copyCollection(index, currentProfile.id)
    }
  }, [indexes, currentProfile, copyCollection])

  // Paste index (start copy mode)
  const handlePasteIndex = useCallback(() => {
    if (!clipboard || clipboard.type !== 'collection' || draftCollection) return
    startCopyFromCollection(clipboard.collection)
  }, [clipboard, draftCollection, startCopyFromCollection])

  // Context menu handler for index item
  const handleContextMenu = useCallback((e: React.MouseEvent, indexName: string) => {
    e.preventDefault()
    e.stopPropagation()
    window.electronAPI.contextMenu.showIndexMenu(indexName, { hasCopiedIndex: hasCopiedCollection })
  }, [hasCopiedCollection])

  // Context menu handler for empty space in panel
  const handlePanelContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    window.electronAPI.contextMenu.showIndexPanelMenu({ hasCopiedIndex: hasCopiedCollection })
  }, [hasCopiedCollection])

  // Context menu action listener
  useEffect(() => {
    const unsubscribe = window.electronAPI.contextMenu.onAction((data) => {
      if (data.action === 'copy') {
        handleCopyIndex(data.indexName)
      } else if (data.action === 'paste') {
        handlePasteIndex()
      } else if (data.action === 'delete') {
        // Select and mark for deletion
        setActiveCollection(data.indexName)
        setMarkedForDeletion(data.indexName)
      }
    })
    return unsubscribe
  }, [handleCopyIndex, handlePasteIndex, setActiveCollection])

  // Menu event listeners (from native app menu)
  useEffect(() => {
    // Duplicate index = copy + paste in one action
    const handleMenuDuplicate = () => {
      if (activeCollection && currentProfile) {
        const index = indexes.find(c => c.name === activeCollection)
        if (index) {
          copyCollection(index, currentProfile.id)
          // Small delay to ensure clipboard is set
          setTimeout(() => {
            startCopyFromCollection(index)
          }, 0)
        }
      }
    }

    // Copy index to clipboard
    const handleMenuCopy = () => {
      if (activeCollection) {
        handleCopyIndex(activeCollection)
      }
    }

    // Paste index from clipboard
    const handleMenuPaste = () => {
      handlePasteIndex()
    }

    // Delete index
    const handleMenuDelete = () => {
      if (activeCollection) {
        handleToggleDeletion()
      }
    }

    // Listen for menu events dispatched from useMenuHandlers
    window.addEventListener('menu:duplicate-collection', handleMenuDuplicate)
    window.addEventListener('menu:copy-collection', handleMenuCopy)
    window.addEventListener('menu:paste-collection', handleMenuPaste)
    window.addEventListener('menu:delete-collection', handleMenuDelete)

    return () => {
      window.removeEventListener('menu:duplicate-collection', handleMenuDuplicate)
      window.removeEventListener('menu:copy-collection', handleMenuCopy)
      window.removeEventListener('menu:paste-collection', handleMenuPaste)
      window.removeEventListener('menu:delete-collection', handleMenuDelete)
    }
  }, [activeCollection, indexes, currentProfile, copyCollection, startCopyFromCollection, handleCopyIndex, handlePasteIndex, handleToggleDeletion])

  // Keyboard shortcuts - using centralized SHORTCUTS definitions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInputting = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      // Command+S or Command+Enter to confirm deletion
      if ((matchesShortcut(e, SHORTCUTS.SAVE) || matchesShortcut(e, SHORTCUTS.SAVE_ENTER)) && markedForDeletion && !draftCollection) {
        e.preventDefault()
        handleCommitDeletion()
      }

      // Escape or Command+Z to cancel deletion mark
      if ((matchesShortcut(e, SHORTCUTS.CANCEL) || matchesShortcut(e, SHORTCUTS.UNDO)) && markedForDeletion) {
        e.preventDefault()
        setMarkedForDeletion(null)
        return
      }

      // Command+Z to cancel copy mode (draft index)
      if (matchesShortcut(e, SHORTCUTS.UNDO) && draftCollection) {
        e.preventDefault()
        cancelCreation()
        return
      }

      // Escape to cancel draft index
      if (matchesShortcut(e, SHORTCUTS.CANCEL) && draftCollection) {
        e.preventDefault()
        cancelCreation()
      }

      // Command+V to paste (start copy mode)
      if (matchesShortcut(e, SHORTCUTS.PASTE_COLLECTION) && hasCopiedCollection && !draftCollection && !isInputting) {
        e.preventDefault()
        handlePasteIndex()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleCommitDeletion, handlePasteIndex, cancelCreation, markedForDeletion, draftCollection, hasCopiedCollection])

  const filteredIndexes = indexes.filter(index =>
    index.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Use collections/indexes interchangeably for backward compatibility
  const collections = indexes
  const collectionsLoading = indexesLoading
  const collectionsError = indexesError
  const refreshCollections = refreshIndexes

  return (
    <aside
      className="w-full h-full flex flex-col"
      style={{
        background: 'var(--sidebar)',
        backdropFilter: 'blur(20px) saturate(1.1)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.1)',
        boxShadow: 'var(--sidebar-shadow)',
      }}
    >
      {/* Header */}
      <div className="px-4 py-2">
        {/* Search input and add button */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search indexes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={inputClassName}
              style={inputStyle}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors text-xs w-4 h-4 flex items-center justify-center"
              >
                ✕
              </button>
            )}
          </div>
          <button
            onClick={handleCreateClick}
            disabled={!!draftCollection}
            className="h-6 w-6 flex-shrink-0 flex items-center justify-center rounded-md bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.10] disabled:opacity-50 disabled:cursor-not-allowed transition-colors translate-y-px"
            style={inputStyle}
            title="Create new index"
          >
            <Plus className="h-2 w-2" />
          </button>
        </div>
      </div>

      {/* Indexes List */}
      <div className="flex-1 overflow-y-auto" onContextMenu={handlePanelContextMenu}>
        {collectionsLoading && (
          <div className="p-4 text-sm text-muted-foreground">Loading indexes...</div>
        )}

        {collectionsError && (
          <div className="p-4">
            <div className="text-sm text-destructive mb-2">{collectionsError}</div>
            <Button onClick={refreshCollections} size="sm" variant="outline" className="w-full">
              Retry
            </Button>
          </div>
        )}

        {!collectionsLoading && !collectionsError && collections.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No indexes found
          </div>
        )}

        {!collectionsLoading && !collectionsError && collections.length > 0 && filteredIndexes.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No indexes match "{searchTerm}"
          </div>
        )}

        {/* Draft index row */}
        {draftCollection && (
          <div className="py-1 px-2">
            <div className="w-full px-3 py-1.5 bg-black/[0.08] dark:bg-white/[0.10] rounded-md">
              <input
                type="text"
                value={draftCollection.name}
                onChange={(e) => updateDraft({ name: e.target.value })}
                placeholder="Index name..."
                className="w-full text-[12px] font-medium bg-transparent border-none outline-none text-sidebar-foreground placeholder:text-sidebar-foreground/40"
                autoFocus
              />
            </div>
          </div>
        )}

        {!collectionsLoading && !collectionsError && filteredIndexes.length > 0 && (
          <div className="py-2">
            {filteredIndexes.map(index => {
              const isActive = index.name === activeCollection && !draftCollection
              const isMarkedForDeletion = index.name === markedForDeletion

              // Determine row styling - macOS source list style
              let bgClass = 'rounded-md mx-2'
              let textClass = 'text-sidebar-foreground'
              let hoverClass = 'hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'

              if (isMarkedForDeletion) {
                bgClass = 'bg-destructive/12 rounded-md mx-2'
                textClass = 'text-destructive'
                hoverClass = ''
              } else if (isActive) {
                bgClass = 'bg-black/[0.08] dark:bg-white/[0.10] rounded-md mx-2'
                textClass = 'text-sidebar-foreground font-medium'
                hoverClass = ''
              }

              return (
                <button
                  key={index.name}
                  onClick={() => handleCollectionClick(index.name)}
                  onContextMenu={(e) => handleContextMenu(e, index.name)}
                  className={`w-full px-3 py-1.5 text-left transition-colors duration-100 ${bgClass} ${hoverClass}`}
                >
                  <div className={`text-[12px] truncate ${textClass}`}>
                    {index.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {index.dimension}d · {index.metric}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer - only shown when in deletion mode */}
      {markedForDeletion && !draftCollection && (
        <div className="px-4 py-2 bg-black/[0.02] dark:bg-white/[0.02]">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMarkedForDeletion(null)}
              disabled={deleteMutation.isPending}
              className="h-6 px-2.5 text-[11px] rounded-md bg-black/[0.06] dark:bg-white/[0.10] hover:bg-black/[0.10] dark:hover:bg-white/[0.15] text-sidebar-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCommitDeletion}
              disabled={deleteMutation.isPending}
              className="h-6 px-2.5 text-[11px] rounded-md bg-destructive/75 hover:bg-destructive/90 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {deleteMutation.isPending ? '...' : 'Delete'}
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog for indexes */}
      {markedIndex && (
        <DeleteCollectionDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          collectionName={markedIndex.name}
          documentCount={0}
          onConfirm={handleConfirmedDeletion}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </aside>
  )
}
