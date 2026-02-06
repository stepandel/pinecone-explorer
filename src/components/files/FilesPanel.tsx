import { useState, useMemo, useCallback, useEffect } from 'react'
import { FileText, Upload, Check, AlertCircle, Loader2, Trash2 } from 'lucide-react'
import { usePinecone } from '../../providers/PineconeProvider'
import { useAssistantSelection } from '../../context/AssistantSelectionContext'
import { useFileSelection } from '../../context/FileSelectionContext'
import { useFilesQuery } from '../../hooks/useAssistantQueries'
import { Button } from '../ui/button'
import { NewButton } from '../ui/new-button'
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
  const [operationError, setOperationError] = useState<string | null>(null)

  // Fetch files for the selected assistant
  const { data: files = [], isLoading, error, refetch } = useFilesQuery(
    currentProfile?.id || null,
    activeAssistant,
    !!activeAssistant
  )

  // Handle upload button click - open file picker
  const handleUploadClick = useCallback(async () => {
    if (!currentProfile?.id || !activeAssistant) return
    setOperationError(null)

    try {
      // Open native file picker dialog
      const result = await window.electronAPI.dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Documents', extensions: ['pdf', 'txt', 'md', 'json', 'csv', 'doc', 'docx'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })

      if (result.canceled || !result.filePaths.length) return

      // Upload each selected file
      for (const filePath of result.filePaths) {
        await window.electronAPI.assistant.files.upload(currentProfile.id, activeAssistant, {
          filePath,
        })
      }

      // Refetch to show new files
      refetch()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload file'
      setOperationError(message)
    }
  }, [currentProfile?.id, activeAssistant, refetch])

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

  // Handle right-click context menu on file items
  const handleFileContextMenu = useCallback((e: React.MouseEvent, file: AssistantFile) => {
    e.preventDefault()
    if (!activeAssistant) return
    window.electronAPI.contextMenu.showFileMenu(activeAssistant, file.id, file.name)
  }, [activeAssistant])

  // Listen for file context menu actions
  useEffect(() => {
    if (!currentProfile?.id || !activeAssistant) return

    const cleanup = window.electronAPI.contextMenu.onFileAction(async (data) => {
      if (data.assistantName !== activeAssistant) return
      setOperationError(null)

      if (data.action === 'delete') {
        // Confirm deletion
        const confirmed = window.confirm(`Delete "${data.fileName}"?\n\nThis action cannot be undone.`)
        if (!confirmed) return

        try {
          await window.electronAPI.assistant.files.delete(currentProfile.id, activeAssistant, data.fileId)
          // Clear selection if deleted file was selected
          if (activeFile === data.fileId) {
            setActiveFile(null)
          }
          refetch()
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to delete file'
          setOperationError(message)
        }
      } else if (data.action === 'download') {
        // Get file details to get signed URL
        try {
          const file = await window.electronAPI.assistant.files.describe(currentProfile.id, activeAssistant, data.fileId)
          if (file.signedUrl) {
            const url = new URL(file.signedUrl)
            if (url.protocol !== 'https:') {
              setOperationError('Invalid download URL protocol')
              return
            }
            await window.electronAPI.shell.openExternal(file.signedUrl)
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to download file'
          setOperationError(message)
        }
      }
    })

    return cleanup
  }, [currentProfile?.id, activeAssistant, activeFile, setActiveFile, refetch])

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
        data-testid="files-panel"
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
          <div className="text-center text-muted-foreground px-4" data-testid="files-empty-state">
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
      data-testid="files-panel"
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
              data-testid="upload-file-button"
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

      {/* Operation Error Banner */}
      {operationError && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-1.5 text-[11px] text-destructive bg-destructive/10 rounded-md px-2 py-1.5">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-1 min-w-0 truncate">{operationError}</span>
            <button
              onClick={() => setOperationError(null)}
              className="text-destructive hover:text-destructive/80 flex-shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

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
                  data-testid="file-item"
                  data-file-id={file.id}
                  data-file-name={file.name}
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
    </aside>
  )
}
