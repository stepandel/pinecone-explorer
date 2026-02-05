import { useState, useCallback } from 'react'
import { Copy, Check, Download, Trash2, AlertCircle, Loader2, FileText } from 'lucide-react'
import { usePinecone } from '../../providers/PineconeProvider'
import { useAssistantSelection } from '../../context/AssistantSelectionContext'
import { useFileSelection } from '../../context/FileSelectionContext'
import { useFilesQuery, useDeleteFileMutation, useFileDetailQuery } from '../../hooks/useAssistantQueries'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'
import { AssistantFile, AssistantFileStatus } from '../../../electron/types'

interface FileDetailPanelProps {
  className?: string
}

// Status indicator with color coding
function StatusIndicator({ status, percentDone }: { status: AssistantFileStatus; percentDone?: number | null }) {
  switch (status) {
    case 'Available':
      return (
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs text-green-600 dark:text-green-400">Available</span>
        </div>
      )
    case 'Processing':
      return (
        <div className="flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 text-yellow-500 animate-spin" />
          <span className="text-xs text-yellow-600 dark:text-yellow-400">
            Processing{percentDone != null ? ` (${Math.round(percentDone * 100)}%)` : '...'}
          </span>
        </div>
      )
    case 'ProcessingFailed':
      return (
        <div className="flex items-center gap-1.5">
          <AlertCircle className="h-3 w-3 text-red-500" />
          <span className="text-xs text-red-600 dark:text-red-400">Failed</span>
        </div>
      )
    case 'Deleting':
      return (
        <div className="flex items-center gap-1.5">
          <Trash2 className="h-3 w-3 text-orange-500" />
          <span className="text-xs text-orange-600 dark:text-orange-400">Deleting...</span>
        </div>
      )
    default:
      return null
  }
}

// Copy to clipboard button component
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  )
}

// Format date for display
function formatDate(dateString: string | undefined): string {
  if (!dateString) return '—'
  try {
    return new Date(dateString).toLocaleString()
  } catch {
    return dateString
  }
}

export function FileDetailPanel({ className }: FileDetailPanelProps) {
  const { currentProfile } = usePinecone()
  const { activeAssistant } = useAssistantSelection()
  const { activeFile, setActiveFile } = useFileSelection()
  
  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Get files from list query to find the selected file
  const { data: files = [] } = useFilesQuery(
    currentProfile?.id || null,
    activeAssistant,
    !!activeAssistant
  )

  // Fetch detailed file info including signedUrl
  const { data: fileDetail } = useFileDetailQuery(
    currentProfile?.id || null,
    activeAssistant,
    activeFile,
    !!activeFile
  )

  // Delete mutation
  const deleteMutation = useDeleteFileMutation(
    currentProfile?.id || '',
    activeAssistant || ''
  )

  // Find the selected file from the list (for basic info) and merge with detail
  const file = files.find((f: AssistantFile) => f.id === activeFile)
  const selectedFile = fileDetail || file

  // Handle download
  const handleDownload = useCallback(async () => {
    if (!fileDetail?.signedUrl) return
    try {
      await window.electronAPI.shell.openExternal(fileDetail.signedUrl)
    } catch (err) {
      console.error('Failed to open file URL:', err)
    }
  }, [fileDetail?.signedUrl])

  // Handle delete confirmation
  const handleDeleteClick = useCallback(() => {
    setDeleteError(null)
    setDeleteDialogOpen(true)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!activeFile) return
    try {
      await deleteMutation.mutateAsync(activeFile)
      setDeleteDialogOpen(false)
      setActiveFile(null) // Clear selection after delete
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete file')
    }
  }, [activeFile, deleteMutation, setActiveFile])

  const handleCancelDelete = useCallback(() => {
    setDeleteDialogOpen(false)
    setDeleteError(null)
  }, [])

  // No file selected state
  if (!activeFile || !selectedFile) {
    return (
      <div
        className={`h-full flex flex-col ${className || ''}`}
        style={{
          background: 'var(--panel-detail)',
          backdropFilter: 'blur(24px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
          boxShadow: 'var(--panel-detail-shadow)',
        }}
      >
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground px-4">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Select a file</p>
            <p className="text-[11px] mt-1">to view details</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="file-detail-panel"
      className={`h-full ${className || ''}`}
      style={{
        background: 'var(--panel-detail)',
        backdropFilter: 'blur(24px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
        boxShadow: 'var(--panel-detail-shadow)',
      }}
    >
      <div className="h-full overflow-auto space-y-3 p-3">
        {/* File Name Header */}
        <section>
          <h2 className="text-sm font-semibold text-foreground break-all">{selectedFile.name}</h2>
        </section>

        {/* ID Section with Copy Button */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground mb-1">ID</h3>
          <div className="flex items-center gap-1 p-2 bg-black/[0.03] dark:bg-white/[0.04] rounded-md">
            <code className="text-xs font-mono break-all flex-1">{selectedFile.id}</code>
            <CopyButton text={selectedFile.id} />
          </div>
        </section>

        {/* Status Section */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground mb-1">Status</h3>
          <div className="p-2 bg-black/[0.03] dark:bg-white/[0.04] rounded-md">
            <StatusIndicator status={selectedFile.status} percentDone={selectedFile.percentDone} />
          </div>
        </section>

        {/* Processing Progress Bar */}
        {selectedFile.status === 'Processing' && selectedFile.percentDone != null && (
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground mb-1">Progress</h3>
            <div className="p-2 bg-black/[0.03] dark:bg-white/[0.04] rounded-md">
              <div className="w-full h-2 bg-black/[0.08] dark:bg-white/[0.08] rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-500 transition-all duration-300 rounded-full"
                  style={{ width: `${Math.round(selectedFile.percentDone * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1 text-center">
                {Math.round(selectedFile.percentDone * 100)}% complete
              </p>
            </div>
          </section>
        )}

        {/* Error Message Section */}
        {selectedFile.status === 'ProcessingFailed' && selectedFile.errorMessage && (
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground mb-1">Error</h3>
            <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-md">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-600 dark:text-red-400 break-words">
                  {selectedFile.errorMessage}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Timestamps Section */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground mb-1">Created</h3>
          <div className="p-2 bg-black/[0.03] dark:bg-white/[0.04] rounded-md">
            <span className="text-xs">{formatDate(selectedFile.createdOn)}</span>
          </div>
        </section>

        {selectedFile.updatedOn && selectedFile.updatedOn !== selectedFile.createdOn && (
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground mb-1">Updated</h3>
            <div className="p-2 bg-black/[0.03] dark:bg-white/[0.04] rounded-md">
              <span className="text-xs">{formatDate(selectedFile.updatedOn)}</span>
            </div>
          </section>
        )}

        {/* Metadata Section */}
        {selectedFile.metadata && Object.keys(selectedFile.metadata).length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground mb-1">Metadata</h3>
            <div className="p-2 bg-black/[0.03] dark:bg-white/[0.04] rounded-md">
              <pre className="text-xs font-mono whitespace-pre-wrap break-all overflow-x-auto">
                {JSON.stringify(selectedFile.metadata, null, 2)}
              </pre>
            </div>
          </section>
        )}

        {/* Action Buttons */}
        <section className="pt-2 space-y-2">
          {/* Download Button */}
          <Button
            onClick={handleDownload}
            disabled={!fileDetail?.signedUrl || selectedFile.status !== 'Available'}
            variant="outline"
            size="sm"
            className="w-full gap-2"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>

          {/* Delete Button */}
          <Button
            onClick={handleDeleteClick}
            disabled={selectedFile.status === 'Deleting' || deleteMutation.isPending}
            variant="destructive"
            size="sm"
            className="w-full gap-2"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </section>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete File</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-medium text-foreground">"{selectedFile.name}"</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive">{deleteError}</p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelDelete}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
