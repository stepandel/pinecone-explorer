import { useState, useMemo, useEffect, useCallback } from 'react'
import { usePinecone } from '../../providers/PineconeProvider'
import { useSelection } from '../../context/SelectionContext'
import { useIndexStatsQuery, useDeleteNamespaceMutation } from '../../hooks/usePineconeQueries'
import { Button } from '../ui/button'
import { DeleteNamespaceDialog } from './DeleteNamespaceDialog'
import { DuplicateNamespaceDialog } from './DuplicateNamespaceDialog'
import { DuplicateNamespaceProgressDialog } from './DuplicateNamespaceProgressDialog'

const inputClassName = "w-full h-6 text-[11px] py-0 px-1.5 pr-5 rounded-md bg-black/[0.04] dark:bg-white/[0.06] placeholder:text-sidebar-foreground/50 text-sidebar-foreground focus:outline-none focus:ring-1 focus:ring-sidebar-ring/50 transition-colors"
const inputStyle = { boxShadow: 'inset 0 0.5px 1px 0 rgb(0 0 0 / 0.04)' }

interface NamespaceInfo {
  name: string
  vectorCount: number
}

interface CloneProgress {
  phase: 'copying' | 'complete' | 'error' | 'cancelled'
  totalVectors: number
  processedVectors: number
  message: string
}

export function NamespacesPanel() {
  const { currentProfile } = usePinecone()
  const { activeIndex, activeNamespace, setActiveNamespace } = useSelection()
  const [searchTerm, setSearchTerm] = useState('')

  // Dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const [progressDialogOpen, setProgressDialogOpen] = useState(false)
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null)
  const [targetNamespace, setTargetNamespace] = useState('')
  const [cloneProgress, setCloneProgress] = useState<CloneProgress>({
    phase: 'copying',
    totalVectors: 0,
    processedVectors: 0,
    message: '',
  })

  // Fetch namespaces (from index stats)
  const { data: indexStats, isLoading, error, refetch } = useIndexStatsQuery(
    currentProfile?.id || null,
    activeIndex,
    !!activeIndex
  )

  // Delete namespace mutation
  const deleteNamespaceMutation = useDeleteNamespaceMutation()

  // Context menu action handler
  useEffect(() => {
    const unsubscribe = window.electronAPI.contextMenu.onNamespaceAction((data) => {
      if (data.action === 'duplicate') {
        setSelectedNamespace(data.namespace)
        setDuplicateDialogOpen(true)
      } else if (data.action === 'delete') {
        setSelectedNamespace(data.namespace)
        setDeleteDialogOpen(true)
      }
    })
    return unsubscribe
  }, [])

  // Clone progress listener
  useEffect(() => {
    const unsubscribe = window.electronAPI.pinecone.onCloneNamespaceProgress((progress) => {
      setCloneProgress(progress as CloneProgress)
    })
    return unsubscribe
  }, [])

  // Handle context menu on namespace
  const handleContextMenu = useCallback((e: React.MouseEvent, namespace: string) => {
    e.preventDefault()
    window.electronAPI.contextMenu.showNamespaceMenu(namespace)
  }, [])

  // Handle duplicate confirmation
  const handleDuplicateConfirm = useCallback(async (newNamespace: string) => {
    if (!currentProfile?.id || !activeIndex || selectedNamespace === null) return

    setTargetNamespace(newNamespace)
    setDuplicateDialogOpen(false)
    setProgressDialogOpen(true)
    setCloneProgress({
      phase: 'copying',
      totalVectors: 0,
      processedVectors: 0,
      message: 'Starting...',
    })

    try {
      await window.electronAPI.pinecone.cloneNamespace(currentProfile.id, {
        indexName: activeIndex,
        sourceNamespace: selectedNamespace,
        targetNamespace: newNamespace,
      })
      // Refetch stats to show new namespace
      refetch()
    } catch (error) {
      // Error is handled via progress events
    }
  }, [currentProfile?.id, activeIndex, selectedNamespace, refetch])

  // Handle cancel clone
  const handleCancelClone = useCallback(async () => {
    if (!currentProfile?.id) return
    try {
      await window.electronAPI.pinecone.cancelCloneNamespace(currentProfile.id)
    } catch (error) {
      // Ignore errors
    }
  }, [currentProfile?.id])

  // Handle progress dialog close
  const handleProgressDialogClose = useCallback((open: boolean) => {
    if (!open) {
      setProgressDialogOpen(false)
      // Refetch stats after close to ensure list is up to date
      refetch()
    }
  }, [refetch])

  // Handle delete confirmation
  const handleDeleteConfirm = useCallback(async () => {
    if (!currentProfile?.id || !activeIndex || selectedNamespace === null) return

    try {
      await deleteNamespaceMutation.mutateAsync({
        profileId: currentProfile.id,
        indexName: activeIndex,
        namespace: selectedNamespace,
      })
      setDeleteDialogOpen(false)
      // If deleted the active namespace, clear selection
      if (activeNamespace === selectedNamespace) {
        setActiveNamespace('')
      }
    } catch (error) {
      // Error is handled by mutation
    }
  }, [currentProfile?.id, activeIndex, selectedNamespace, deleteNamespaceMutation, activeNamespace, setActiveNamespace])

  // Transform namespaces object to array
  const namespaces: NamespaceInfo[] = useMemo(() => {
    if (!indexStats?.namespaces) return []

    return Object.entries(indexStats.namespaces)
      .map(([name, data]) => ({
        name: name || '(default)', // Empty string is the default namespace
        vectorCount: data.vectorCount,
      }))
      .sort((a, b) => {
        // Default namespace first, then alphabetically
        if (a.name === '(default)') return -1
        if (b.name === '(default)') return 1
        return a.name.localeCompare(b.name)
      })
  }, [indexStats?.namespaces])

  const filteredNamespaces = namespaces.filter(ns =>
    ns.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleNamespaceClick = (namespaceName: string) => {
    // Convert "(default)" back to empty string for API calls
    const actualNamespace = namespaceName === '(default)' ? '' : namespaceName
    setActiveNamespace(actualNamespace)
  }

  // If no index is selected, show prompt
  if (!activeIndex) {
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
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground px-4">
            <p className="text-sm">Select an index</p>
            <p className="text-[11px] mt-1">to view namespaces</p>
          </div>
        </div>
      </aside>
    )
  }

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
      <div className="px-3 py-2">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Namespaces
          </h2>
          {indexStats && (
            <span className="text-[10px] text-muted-foreground">
              {indexStats.totalVectorCount.toLocaleString()} vectors
            </span>
          )}
        </div>
        {/* Search input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search namespaces..."
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
      </div>

      {/* Namespaces List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-4 text-sm text-muted-foreground">Loading namespaces...</div>
        )}

        {error && (
          <div className="p-4">
            <div className="text-sm text-destructive mb-2">
              {error instanceof Error ? error.message : 'Failed to load'}
            </div>
            <Button onClick={() => refetch()} size="sm" variant="outline" className="w-full">
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !error && namespaces.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No namespaces yet
          </div>
        )}

        {!isLoading && !error && namespaces.length > 0 && filteredNamespaces.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No namespaces match "{searchTerm}"
          </div>
        )}

        {!isLoading && !error && filteredNamespaces.length > 0 && (
          <div className="py-1">
            {filteredNamespaces.map((ns) => {
              const actualNamespace = ns.name === '(default)' ? '' : ns.name
              const isActive = activeNamespace === actualNamespace

              return (
                <button
                  key={ns.name}
                  onClick={() => handleNamespaceClick(ns.name)}
                  onContextMenu={(e) => handleContextMenu(e, actualNamespace)}
                  className={`w-full px-3 py-1.5 text-left transition-colors duration-100 mx-1 rounded-md ${
                    isActive
                      ? 'bg-black/[0.08] dark:bg-white/[0.10]'
                      : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'
                  }`}
                  style={{ width: 'calc(100% - 8px)' }}
                >
                  <div
                    className={`text-[12px] truncate ${
                      isActive
                        ? 'text-sidebar-foreground font-medium'
                        : 'text-sidebar-foreground'
                    }`}
                  >
                    {ns.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {ns.vectorCount.toLocaleString()} vectors
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer - Index info */}
      <div className="px-3 py-2 border-t border-border">
        <div className="text-[10px] text-muted-foreground truncate" title={activeIndex}>
          Index: <span className="text-sidebar-foreground">{activeIndex}</span>
        </div>
      </div>

      {/* Delete Namespace Dialog */}
      <DeleteNamespaceDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        namespaceName={selectedNamespace || ''}
        vectorCount={
          selectedNamespace !== null
            ? namespaces.find(ns => (ns.name === '(default)' ? '' : ns.name) === selectedNamespace)?.vectorCount || 0
            : 0
        }
        onConfirm={handleDeleteConfirm}
        isDeleting={deleteNamespaceMutation.isPending}
      />

      {/* Duplicate Namespace Dialog */}
      <DuplicateNamespaceDialog
        open={duplicateDialogOpen}
        onOpenChange={setDuplicateDialogOpen}
        sourceNamespace={selectedNamespace || ''}
        onConfirm={handleDuplicateConfirm}
      />

      {/* Duplicate Progress Dialog */}
      <DuplicateNamespaceProgressDialog
        open={progressDialogOpen}
        onOpenChange={handleProgressDialogClose}
        sourceNamespace={selectedNamespace || ''}
        targetNamespace={targetNamespace}
        progress={cloneProgress}
        onCancel={handleCancelClone}
      />
    </aside>
  )
}
