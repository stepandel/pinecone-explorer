import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { FileText, Upload, Check, AlertCircle, Loader2, Trash2 } from 'lucide-react'
import { usePinecone } from '../../providers/PineconeProvider'
import { useAssistantSelection } from '../../context/AssistantSelectionContext'
import { useFileSelection } from '../../context/FileSelectionContext'
import { useFilesQuery, useDeleteFileMutation, useFileDetailQuery } from '../../hooks/useAssistantQueries'
import { Button } from '../ui/button'
import { NewButton } from '../ui/new-button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'
import { UploadFileDialog } from './UploadFileDialog'
import { AssistantFile, AssistantFileStatus } from '../../../electron/types'

const inputClassName = "w-full h-6 text-[11px] py-0 px-1.5 pr-5 rounded-md bg-black/[0.04] dark:bg-white/[0.06] placeholder:text-sidebar-foreground/50 text-sidebar-foreground focus:outline-none focus:ring-1 focus:ring-sidebar-ring/50 transition-colors"
const inputStyle = { boxShadow: 'inset 0 0.5px 1px 0 rgb(0 0 0 / 0.04)' }

interface FilesPanelProps {
  className?: string
}

// Status indicator component
function FileStatusIndicator({ status, percentDone }: { status: AssistantFileStatus; percentDone?: number | null }) {
  switch (status) {
    case 'Available':
      return (
        <div className="flex items-center gap-1">
          <Check className="h-3 w-3 text-green-500" />
          <span className="text-[9px] text-green-600 dark:text-green-400">Ready</span>
        </div>
      )
    case 'Processing':
      return (
        <div className="flex items-center gap-1">
          <Loader2 className="h-3 w-3 text-yellow-500 animate-spin" />
          <span className="text-[9px] text-yellow-600 dark:text-yellow-400">
            {percentDone != null ? `${Math.round(percentDone * 100)}%` : 'Processing...'}
          </span>
        </div>
      )
    case 'ProcessingFailed':
      return (
        <div className="flex items-center gap-1">
          <AlertCircle className="h-3 w-3 text-red-500" />
          <span className="text-[9px] text-red-600 dark:text-red-400">Failed</span>
        </div>
      )
    case 'Deleting':
      return (
        <div className="flex items-center gap-1">
          <Trash2 className="h-3 w-3 text-orange-500" />
          <span className="text-[9px] text-orange-600 dark:text-orange-400">Deleting...</span>
        </div>
      )
    default:
      return null
  }
}

export function FilesPanel({ className }: FilesPanelProps) {
  const { currentProfile } = usePinecone()
  const { activeAssistant } = useAssistantSelection()
  const { activeFile, setActiveFile } = useFileSelection()
  const [searchTerm, setSearchTerm] = useState('')
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [fileToDelete, setFileToDelete] = useState<{ id: string; name: string } | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deleteMutation = useDeleteFileMutation(currentProfile?.id || '', activeAssistant || '')

  // Download state
  const [fileToDownload, setFileToDownload] = useState<{ id: string; name: string } | null>(null)

  // Fetch files for the selected assistant
  const { data: files = [], isLoading, error, refetch } = useFilesQuery(
    currentProfile?.id || null,
    activeAssistant,
    !!activeAssistant
  )

  // Fetch file detail for download (with signedUrl)
  const { data: fileDetail, isLoading: isDownloadLoading } = useFileDetailQuery(
    currentProfile?.id || null,
    activeAssistant,
    fileToDownload?.id || null,
    !!fileToDownload
  )

  // Track if download was already initiated to prevent duplicates on refetch
  const downloadInitiatedRef = useRef<string | null>(null)

  // Handle download when file detail is fetched
  useEffect(() => {
    if (fileDetail?.signedUrl && fileToDownload && downloadInitiatedRef.current !== fileToDownload.id) {
      downloadInitiatedRef.current = fileToDownload.id
      // Open the signed URL in the browser to trigger download
      window.electronAPI.shell.openExternal(fileDetail.signedUrl)
      setFileToDownload(null)
    }
  }, [fileDetail, fileToDownload])

  // Reset download tracker when fileToDownload is cleared
  useEffect(() => {
    if (!fileToDownload) {
      downloadInitiatedRef.current = null
    }
  }, [fileToDownload])

  // Handle upload button click - open upload dialog
  const handleUploadClick = useCallback(() => {
    if (!currentProfile?.id || !activeAssistant) return
    setUploadDialogOpen(true)
  }, [currentProfile?.id, activeAssistant])

  // Handle right-click on file item - show native context menu
  const handleFileContextMenu = useCallback(
    (e: React.MouseEvent, file: AssistantFile) => {
      e.preventDefault()
      e.stopPropagation()
      if (activeAssistant) {
        window.electronAPI.contextMenu.showFileMenu(activeAssistant, file.id, file.name)
      }
    },
    [activeAssistant]
  )

  // Handle delete action - opens confirmation dialog
  const openDeleteDialog = useCallback((fileId: string, fileName: string) => {
    setFileToDelete({ id: fileId, name: fileName })
    setDeleteError(null)
    setDeleteDialogOpen(true)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!fileToDelete) return

    try {
      await deleteMutation.mutateAsync(fileToDelete.id)
      // If we deleted the active file, clear selection
      if (activeFile === fileToDelete.id) {
        setActiveFile(null)
      }
      setDeleteDialogOpen(false)
      setFileToDelete(null)
      setDeleteError(null)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete file')
    }
  }, [fileToDelete, deleteMutation, activeFile, setActiveFile])

  const handleCancelDelete = useCallback(() => {
    setDeleteDialogOpen(false)
    setFileToDelete(null)
    setDeleteError(null)
  }, [])

  // Handle download action
  const handleDownloadFile = useCallback((fileId: string, fileName: string) => {
    setFileToDownload({ id: fileId, name: fileName })
  }, [])

  // Listen for native context menu actions
  useEffect(() => {
    const unsubscribe = window.electronAPI.contextMenu.onFileAction((data) => {
      if (data.action === 'delete' && data.fileId && data.fileName) {
        openDeleteDialog(data.fileId, data.fileName)
      } else if (data.action === 'download' && data.fileId && data.fileName) {
        handleDownloadFile(data.fileId, data.fileName)
      }
    })
    return unsubscribe
  }, [openDeleteDialog, handleDownloadFile])

  // Filter files by search term
  const filteredFiles = useMemo(() => {
    if (!files) return []
    return files.filter((file: AssistantFile) =>
      file.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [files, searchTerm])

  // Sort files: processing first, then by name
  const sortedFiles = useMemo(() => {
    return [...filteredFiles].sort((a, b) => {
      // Processing files first
      if (a.status === 'Processing' && b.status !== 'Processing') return -1
      if (a.status !== 'Processing' && b.status === 'Processing') return 1
      // Then alphabetically by name
      return a.name.localeCompare(b.name)
    })
  }, [filteredFiles])

  const handleFileClick = useCallback((fileId: string) => {
    setActiveFile(fileId)
  }, [setActiveFile])

  // If no assistant is selected, show prompt
  if (!activeAssistant) {
    return (
      <aside
        className={`w-full h-full flex flex-col ${className || ''}`}
        style={{
          background: 'var(--sidebar)',
          backdropFilter: 'blur(20px) saturate(1.1)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.1)',
          boxShadow: 'var(--sidebar-shadow)',
        }}
      >
        {/* Header */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Files
            </h2>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground px-4">
            <p className="text-sm">Select an assistant</p>
            <p className="text-[11px] mt-1">to view files</p>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className={`w-full h-full flex flex-col ${className || ''}`}
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
          <div className="flex items-center gap-1">
            <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Files
            </h2>
            <NewButton
              onClick={handleUploadClick}
              label="File"
              title="Upload file"
              iconOnly
            />
          </div>
          <div className="text-[10px] text-muted-foreground truncate" title={activeAssistant}>
            Assistant: <span className="text-sidebar-foreground">{activeAssistant}</span>
          </div>
        </div>
        {/* Search input */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search files..."
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

      {/* Upload Button (prominent) */}
      <div className="px-3 pb-2">
        <Button
          onClick={handleUploadClick}
          size="sm"
          variant="outline"
          className="w-full h-7 text-[11px] gap-1.5"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload File
        </Button>
      </div>

      {/* Files List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-4 text-sm text-muted-foreground">Loading files...</div>
        )}

        {error && (
          <div className="p-4">
            <div className="text-sm text-destructive mb-2">
              {error instanceof Error ? error.message : 'Failed to load files'}
            </div>
            <Button onClick={() => refetch()} size="sm" variant="outline" className="w-full">
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !error && files.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground text-center">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No files yet</p>
            <p className="text-[11px] mt-1">Upload files to get started</p>
          </div>
        )}

        {!isLoading && !error && files.length > 0 && sortedFiles.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No files match "{searchTerm}"
          </div>
        )}

        {!isLoading && !error && sortedFiles.length > 0 && (
          <div className="py-1">
            {sortedFiles.map((file) => {
              const isActive = activeFile === file.id

              return (
                <button
                  key={file.id}
                  onClick={() => handleFileClick(file.id)}
                  onContextMenu={(e) => handleFileContextMenu(e, file)}
                  className={`w-full px-3 py-1.5 text-left transition-colors duration-100 mx-1 rounded-md ${
                    isActive
                      ? 'bg-black/[0.08] dark:bg-white/[0.10]'
                      : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'
                  }`}
                  style={{ width: 'calc(100% - 8px)' }}
                  title={file.errorMessage || file.name}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <div
                      className={`text-[12px] truncate flex-1 ${
                        isActive
                          ? 'text-sidebar-foreground font-medium'
                          : 'text-sidebar-foreground'
                      }`}
                    >
                      {file.name}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-0.5 pl-5">
                    <FileStatusIndicator status={file.status} percentDone={file.percentDone} />
                    {file.createdOn && (
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(file.createdOn).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Upload File Dialog */}
      {currentProfile?.id && activeAssistant && (
        <UploadFileDialog
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          profileId={currentProfile.id}
          assistantName={activeAssistant}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => !open && handleCancelDelete()}>
        <DialogContent className="sm:max-w-[320px] p-0 gap-0 rounded-xl border-0 bg-background/80 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.3)] ring-1 ring-black/10 dark:ring-white/10">
          <DialogHeader className="px-5 pt-5 pb-4 text-center space-y-2">
            <DialogTitle className="text-[13px] font-semibold text-destructive">
              Delete File
            </DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground leading-[1.4]">
              Are you sure you want to delete <span className="font-medium text-foreground">{fileToDelete?.name}</span>?
              This action cannot be undone.
            </DialogDescription>

            {deleteError && (
              <p className="mt-2 text-[10px] text-destructive">{deleteError}</p>
            )}
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
              disabled={deleteMutation.isPending}
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
