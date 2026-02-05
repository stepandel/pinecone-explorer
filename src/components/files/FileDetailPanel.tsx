import { useCallback } from 'react'
import { FileText, Download, Trash2, AlertCircle, Loader2, Check } from 'lucide-react'
import { usePinecone } from '../../providers/PineconeProvider'
import { useAssistantSelection } from '../../context/AssistantSelectionContext'
import { useFileSelection } from '../../context/FileSelectionContext'
import { useFileQuery, useDeleteFileMutation } from '../../hooks/useAssistantQueries'
import { Button } from '../ui/button'
import { AssistantFileStatus } from '../../../electron/types'

function FileStatusBadge({ status }: { status: AssistantFileStatus }) {
  switch (status) {
    case 'Available':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400 bg-green-500/10 rounded-full px-2 py-0.5">
          <Check className="h-3 w-3" /> Ready
        </span>
      )
    case 'Processing':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 rounded-full px-2 py-0.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Processing
        </span>
      )
    case 'ProcessingFailed':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400 bg-red-500/10 rounded-full px-2 py-0.5">
          <AlertCircle className="h-3 w-3" /> Failed
        </span>
      )
    case 'Deleting':
      return (
        <span className="inline-flex items-center gap-1 text-[11px] text-orange-600 dark:text-orange-400 bg-orange-500/10 rounded-full px-2 py-0.5">
          <Trash2 className="h-3 w-3" /> Deleting
        </span>
      )
    default:
      return null
  }
}

export function FileDetailPanel() {
  const { currentProfile } = usePinecone()
  const { activeAssistant } = useAssistantSelection()
  const { activeFile, setActiveFile } = useFileSelection()

  const { data: file, isLoading, error } = useFileQuery(
    currentProfile?.id || null,
    activeAssistant,
    activeFile,
    !!activeFile && !!activeAssistant
  )

  const deleteMutation = useDeleteFileMutation(
    currentProfile?.id || '',
    activeAssistant || ''
  )

  const handleDelete = useCallback(async () => {
    if (!activeFile || !currentProfile?.id || !activeAssistant) return
    try {
      await deleteMutation.mutateAsync(activeFile)
      setActiveFile(null)
    } catch (err) {
      console.error('Failed to delete file:', err)
    }
  }, [activeFile, currentProfile?.id, activeAssistant, deleteMutation, setActiveFile])

  const handleDownload = useCallback(async () => {
    if (!file?.signedUrl) return
    
    // Validate URL for security - only allow https:
    try {
      const url = new URL(file.signedUrl)
      if (url.protocol !== 'https:') {
        console.error('Invalid URL protocol for download:', url.protocol)
        return
      }
      await window.electronAPI.shell.openExternal(file.signedUrl)
    } catch (err) {
      console.error('Failed to open download URL:', err)
    }
  }, [file?.signedUrl])

  // Empty state
  if (!activeFile) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{
          background: 'var(--panel-detail)',
          backdropFilter: 'blur(24px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
          boxShadow: 'var(--panel-detail-shadow)',
        }}
        data-testid="file-detail-panel"
      >
        <div className="text-center text-muted-foreground" data-testid="file-detail-empty-state">
          <p className="text-sm">No file selected</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="h-full flex flex-col"
      style={{
        background: 'var(--panel-detail)',
        backdropFilter: 'blur(24px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
        boxShadow: 'var(--panel-detail-shadow)',
      }}
      data-testid="file-detail-panel"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          File Details
        </h3>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading file details...
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load file'}
          </div>
        )}

        {file && (
          <div className="space-y-4">
            {/* File name */}
            <div className="flex items-start gap-2">
              <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground break-all">
                  {file.name}
                </p>
              </div>
            </div>

            {/* Status */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Status</p>
              <FileStatusBadge status={file.status} />
              {file.errorMessage && (
                <p className="mt-1 text-[11px] text-destructive">{file.errorMessage}</p>
              )}
            </div>

            {/* ID */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">ID</p>
              <p className="text-[11px] text-foreground font-mono break-all">{file.id}</p>
            </div>

            {/* Dates */}
            {file.createdOn && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Created</p>
                <p className="text-[11px] text-foreground">
                  {new Date(file.createdOn).toLocaleString()}
                </p>
              </div>
            )}

            {file.updatedOn && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Updated</p>
                <p className="text-[11px] text-foreground">
                  {new Date(file.updatedOn).toLocaleString()}
                </p>
              </div>
            )}

            {/* Metadata */}
            {file.metadata && Object.keys(file.metadata).length > 0 && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Metadata</p>
                <div className="space-y-1">
                  {Object.entries(file.metadata).map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-[11px]">
                      <span className="text-muted-foreground font-mono">{key}:</span>
                      <span className="text-foreground">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      {file && (
        <div className="px-4 py-3 border-t border-border space-y-2">
          {file.signedUrl && (
            <Button
              onClick={handleDownload}
              size="sm"
              variant="outline"
              className="w-full h-7 text-[11px] gap-1.5"
              data-testid="file-download-button"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          )}
          <Button
            onClick={handleDelete}
            size="sm"
            variant="destructive"
            disabled={deleteMutation.isPending || file.status === 'Deleting'}
            className="w-full h-7 text-[11px] gap-1.5"
            data-testid="file-delete-button"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleteMutation.isPending || file.status === 'Deleting' ? 'Deleting...' : 'Delete File'}
          </Button>
        </div>
      )}
    </div>
  )
}
