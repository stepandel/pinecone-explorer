import { useState, useEffect, useCallback, useMemo } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Upload, FileText, X, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Checkbox } from '../ui/checkbox'
import { useUploadFileMutation } from '../../hooks/useAssistantQueries'

const inputStyle = { boxShadow: 'inset 0 1px 2px 0 rgb(0 0 0 / 0.05)' }

interface UploadFileDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profileId: string
  assistantName: string
}

export function UploadFileDialog({
  open,
  onOpenChange,
  profileId,
  assistantName,
}: UploadFileDialogProps) {
  const [selectedFile, setSelectedFile] = useState<{ name: string; path: string; size: number } | null>(null)
  const [metadataJson, setMetadataJson] = useState('')
  const [metadataError, setMetadataError] = useState<string | null>(null)
  const [multimodal, setMultimodal] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const uploadMutation = useUploadFileMutation(profileId, assistantName)

  // Check if selected file is a PDF (for multimodal checkbox)
  const isPdf = useMemo(() => {
    if (!selectedFile) return false
    return selectedFile.name.toLowerCase().endsWith('.pdf')
  }, [selectedFile])

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setSelectedFile(null)
      setMetadataJson('')
      setMetadataError(null)
      setMultimodal(false)
      setUploadError(null)
    }
  }, [open])

  // Reset multimodal when file changes and it's not a PDF
  useEffect(() => {
    if (!isPdf) {
      setMultimodal(false)
    }
  }, [isPdf])

  // Validate metadata JSON
  const validateMetadata = useCallback((json: string): Record<string, string | number> | null => {
    if (!json.trim()) return null
    
    try {
      const parsed = JSON.parse(json)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setMetadataError('Metadata must be a JSON object')
        return null
      }
      // Validate values are strings or numbers
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value !== 'string' && typeof value !== 'number') {
          setMetadataError(`Value for "${key}" must be a string or number`)
          return null
        }
      }
      setMetadataError(null)
      return parsed as Record<string, string | number>
    } catch {
      setMetadataError('Invalid JSON syntax')
      return null
    }
  }, [])

  // Handle metadata change
  const handleMetadataChange = useCallback((value: string) => {
    setMetadataJson(value)
    if (value.trim()) {
      validateMetadata(value)
    } else {
      setMetadataError(null)
    }
  }, [validateMetadata])

  // Handle file picker button
  const handleFilePicker = useCallback(async () => {
    try {
      const result = await window.electronAPI.dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Documents', extensions: ['pdf', 'txt', 'md', 'json', 'csv', 'doc', 'docx'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      })

      if (result.canceled || !result.filePaths.length) return

      const filePath = result.filePaths[0]
      // Get file info - we'll extract name from path
      const fileName = filePath.split(/[/\\]/).pop() || 'Unknown'
      
      setSelectedFile({
        name: fileName,
        path: filePath,
        size: 0, // Size not available from dialog, could use fs in preload if needed
      })
      setUploadError(null)
    } catch (err) {
      console.error('Failed to open file picker:', err)
    }
  }, [])

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      // Note: In Electron, we need to use the file path from the dropped file
      // The path property is available in Electron's drag-and-drop
      const filePath = (file as any).path
      
      if (filePath) {
        setSelectedFile({
          name: file.name,
          path: filePath,
          size: file.size,
        })
        setUploadError(null)
      }
    }
  }, [])

  // Handle upload
  const handleUpload = useCallback(async () => {
    if (!selectedFile) return

    // Validate metadata if provided
    let metadata: Record<string, string | number> | undefined
    if (metadataJson.trim()) {
      const parsed = validateMetadata(metadataJson)
      if (parsed === null && metadataJson.trim()) {
        // Validation failed
        return
      }
      metadata = parsed || undefined
    }

    setUploadError(null)

    try {
      await uploadMutation.mutateAsync({
        filePath: selectedFile.path,
        metadata,
      })
      // Close dialog on success
      onOpenChange(false)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload file')
    }
  }, [selectedFile, metadataJson, validateMetadata, uploadMutation, onOpenChange])

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return 'Unknown size'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const isUploading = uploadMutation.isPending
  const canUpload = selectedFile && !metadataError && !isUploading

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/20 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]",
            "w-[380px] rounded-xl",
            "bg-background/80 backdrop-blur-2xl backdrop-saturate-150",
            "shadow-[0_24px_48px_-12px_rgba(0,0,0,0.3)]",
            "ring-1 ring-black/10 dark:ring-white/10",
            "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          )}
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-3">
            <DialogPrimitive.Title className="text-[13px] font-semibold text-foreground">
              Upload File
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 text-[11px] text-muted-foreground">
              Upload a file to the <span className="font-medium text-foreground">{assistantName}</span> assistant
            </DialogPrimitive.Description>
          </div>

          {/* Content */}
          <div className="px-5 pb-4 space-y-4">
            {/* Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "relative border-2 border-dashed rounded-lg p-6 transition-colors text-center",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/40",
                selectedFile && "border-solid border-primary/50 bg-primary/5"
              )}
            >
              {selectedFile ? (
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-primary flex-shrink-0" />
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-[12px] font-medium text-foreground truncate">
                      {selectedFile.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors"
                    disabled={isUploading}
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-[12px] text-muted-foreground">
                    Drag & drop a file here
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    or click below to browse
                  </p>
                </>
              )}
            </div>

            {/* Browse Button */}
            <button
              onClick={handleFilePicker}
              disabled={isUploading}
              className={cn(
                "w-full h-8 px-3 text-[12px] font-medium",
                "rounded-md",
                "bg-white/10 dark:bg-white/10",
                "text-foreground/90",
                "ring-1 ring-black/10 dark:ring-white/15",
                "shadow-sm",
                "transition-all duration-100",
                "hover:bg-white/20 dark:hover:bg-white/15",
                "active:bg-white/25 dark:active:bg-white/20",
                "disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              Browse Files
            </button>

            {/* Metadata JSON Editor */}
            <div>
              <label className="text-[10px] text-muted-foreground mb-1.5 block">
                Metadata (optional JSON)
              </label>
              <textarea
                value={metadataJson}
                onChange={(e) => handleMetadataChange(e.target.value)}
                placeholder='{"key": "value"}'
                disabled={isUploading}
                className={cn(
                  "w-full h-16 px-2 py-1.5 text-[11px] font-mono",
                  "rounded-md border bg-background/50",
                  "placeholder:text-muted-foreground/40",
                  "focus:outline-none focus:ring-1 focus:ring-ring",
                  "resize-none",
                  metadataError ? "border-destructive" : "border-input"
                )}
                style={inputStyle}
              />
              {metadataError && (
                <p className="text-[10px] text-destructive mt-1">{metadataError}</p>
              )}
            </div>

            {/* Multimodal Checkbox */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="multimodal"
                checked={multimodal}
                onCheckedChange={(checked) => setMultimodal(checked === true)}
                disabled={!isPdf || isUploading}
              />
              <label
                htmlFor="multimodal"
                className={cn(
                  "text-[11px] cursor-pointer select-none",
                  !isPdf ? "text-muted-foreground/50" : "text-foreground"
                )}
              >
                Enable multimodal processing
                {!isPdf && (
                  <span className="text-muted-foreground/50 ml-1">(PDF only)</span>
                )}
              </label>
            </div>

            {/* Upload Progress / Error */}
            {isUploading && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Uploading...</span>
              </div>
            )}

            {uploadError && (
              <div className="flex items-center gap-2 text-[11px] text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="px-4 pb-4 flex gap-2">
            <button
              onClick={() => onOpenChange(false)}
              disabled={isUploading}
              className={cn(
                "flex-1 h-[22px] px-3 text-[12px] font-normal",
                "rounded-md",
                "bg-white/10 dark:bg-white/10",
                "text-foreground/90",
                "ring-1 ring-black/10 dark:ring-white/15",
                "shadow-sm",
                "transition-all duration-100",
                "hover:bg-white/20 dark:hover:bg-white/15",
                "active:bg-white/25 dark:active:bg-white/20",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              )}
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!canUpload}
              className={cn(
                "flex-1 h-[22px] px-3 text-[12px] font-medium",
                "rounded-md",
                "bg-[#007AFF] hover:bg-[#0071E3] active:bg-[#006DD9]",
                "text-white",
                "shadow-sm",
                "transition-all duration-100",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]/50 focus-visible:ring-offset-1"
              )}
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
