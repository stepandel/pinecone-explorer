import { useState, useEffect, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { useDraftCollection } from '../../context/DraftCollectionContext'
import { usePinecone } from '../../providers/PineconeProvider'
import { useCollection } from '../../context/CollectionContext'
import { CopyProgressDialog } from './CopyProgressDialog'

const inputClassName = "w-full h-6 text-[11px] px-1.5 rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
const inputStyle = { boxShadow: 'inset 0 1px 2px 0 rgb(0 0 0 / 0.05)' }

// Cloud regions for serverless indexes
const CLOUD_REGIONS = {
  aws: ['us-east-1', 'us-west-2', 'eu-west-1'],
  gcp: ['us-central1', 'europe-west1', 'asia-southeast1'],
  azure: ['eastus2'],
} as const

type CloudProvider = keyof typeof CLOUD_REGIONS

interface CloneProgress {
  phase: 'creating' | 'copying' | 'complete' | 'error' | 'cancelled'
  totalVectors: number
  processedVectors: number
  message: string
}

export function CollectionConfigView() {
  const { draftCollection, updateDraft, cancelCreation, saveDraft, isCreating, validationErrors, isCopyMode } = useDraftCollection()
  const { currentProfile, refreshIndexes } = usePinecone()
  const { setActiveCollection } = useCollection()

  // Cloud and region selection
  const [cloud, setCloud] = useState<CloudProvider>('aws')
  const [region, setRegion] = useState('us-east-1')

  // Copy operation state
  const [isCopying, setIsCopying] = useState(false)
  const [showCopyProgress, setShowCopyProgress] = useState(false)
  const [copyProgress, setCopyProgress] = useState<CloneProgress>({
    phase: 'creating',
    totalVectors: 0,
    processedVectors: 0,
    message: 'Preparing...',
  })

  // Handle cloud change - update region to first available
  const handleCloudChange = useCallback((newCloud: CloudProvider) => {
    setCloud(newCloud)
    setRegion(CLOUD_REGIONS[newCloud][0])
  }, [])

  // Handle copy/clone index
  const handleCopyIndex = useCallback(async () => {
    if (!draftCollection?.sourceCollection || !currentProfile) return

    const errors: Record<string, string> = {}
    if (!draftCollection.name.trim()) {
      errors.name = 'Index name is required'
    }

    if (Object.keys(errors).length > 0) {
      return
    }

    setIsCopying(true)
    setShowCopyProgress(true)
    setCopyProgress({
      phase: 'creating',
      totalVectors: 0,
      processedVectors: 0,
      message: 'Creating index...',
    })

    // Subscribe to progress updates
    const unsubscribe = window.electronAPI.pinecone.onCloneProgress((progress: CloneProgress) => {
      setCopyProgress(progress)
    })

    try {
      const result = await window.electronAPI.pinecone.cloneIndex(currentProfile.id, {
        sourceIndexName: draftCollection.sourceCollection.name,
        targetIndexName: draftCollection.name.trim(),
        regenerateEmbeddings: false,
      })

      if (result.success) {
        setCopyProgress({
          phase: 'complete',
          totalVectors: result.totalVectors,
          processedVectors: result.copiedVectors,
          message: `Copied ${result.copiedVectors} vectors`,
        })
        // Refresh indexes list
        await refreshIndexes()
        // Select the new index after dialog is closed
        setTimeout(() => {
          setActiveCollection(draftCollection.name.trim())
          cancelCreation()
        }, 500)
      } else {
        setCopyProgress({
          phase: 'error',
          totalVectors: 0,
          processedVectors: 0,
          message: result.error || 'Clone failed',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to clone index'
      setCopyProgress({
        phase: 'error',
        totalVectors: 0,
        processedVectors: 0,
        message,
      })
    } finally {
      unsubscribe()
      setIsCopying(false)
    }
  }, [draftCollection, currentProfile, refreshIndexes, setActiveCollection, cancelCreation])

  // Handle cancel clone
  const handleCancelClone = useCallback(async () => {
    if (!currentProfile) return
    try {
      await window.electronAPI.pinecone.cancelClone(currentProfile.id)
    } catch (error) {
      console.error('Failed to cancel clone:', error)
    }
  }, [currentProfile])

  // Handle save with spec
  const handleSave = useCallback(async () => {
    if (!draftCollection) return

    // Update draft with serverless spec before saving
    updateDraft({
      serverlessSpec: {
        cloud,
        region,
      },
    })

    // Small delay to ensure state is updated
    setTimeout(() => {
      saveDraft()
    }, 0)
  }, [draftCollection, cloud, region, updateDraft, saveDraft])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+S or Cmd+Enter to save/copy
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'Enter')) {
        e.preventDefault()
        if (isCopyMode) {
          handleCopyIndex()
        } else {
          handleSave()
        }
      }
      // Escape to cancel
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelCreation()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, cancelCreation, isCopyMode, handleCopyIndex])

  if (!draftCollection) return null

  return (
    <div className="flex flex-col h-full bg-background">

      {/* Configuration Form */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Copy mode indicator */}
        {isCopyMode && draftCollection.sourceCollection && (
          <div className="p-2 bg-primary/10 border border-primary/20 rounded-md">
            <p className="text-[11px] text-primary">
              Cloning from <span className="font-medium">{draftCollection.sourceCollection.name}</span>
              {' · '}
              <span className="text-muted-foreground">{draftCollection.sourceCollection.dimension}d</span>
            </p>
          </div>
        )}

        {/* Form error */}
        {validationErrors._form && (
          <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-[11px] text-destructive">{validationErrors._form}</p>
          </div>
        )}

        {/* Index Name */}
        <div className="space-y-1">
          <label htmlFor="index-name" className="text-[11px] font-medium text-muted-foreground">
            Name
          </label>
          <input
            id="index-name"
            type="text"
            value={draftCollection.name}
            onChange={(e) => updateDraft({ name: e.target.value })}
            placeholder="my-index"
            className={inputClassName}
            style={inputStyle}
            autoFocus
          />
          {validationErrors.name && <p className="text-[10px] text-destructive">{validationErrors.name}</p>}
        </div>

        {/* Dimension */}
        <div className="space-y-1">
          <label htmlFor="dimension" className="text-[11px] font-medium text-muted-foreground">
            Dimension
          </label>
          <input
            id="dimension"
            type="number"
            value={draftCollection.dimensionOverride || ''}
            onChange={(e) => updateDraft({ dimensionOverride: e.target.value })}
            placeholder="1536"
            className={inputClassName}
            style={inputStyle}
          />
          <p className="text-[10px] text-muted-foreground">
            Common: 1536 (OpenAI), 768 (Cohere), 384 (MiniLM)
          </p>
        </div>

        {/* Metric */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            Distance Metric
          </label>
          <div className="flex gap-3">
            {(['cosine', 'euclidean', 'dotproduct'] as const).map((metric) => (
              <label key={metric} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="metric"
                  value={metric}
                  checked={(draftCollection.metric || 'cosine') === metric}
                  onChange={() => updateDraft({ metric })}
                  className="h-3 w-3"
                />
                <span className="text-[10px] text-foreground capitalize">{metric}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Cloud Provider */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            Cloud Provider
          </label>
          <div className="relative">
            <select
              value={cloud}
              onChange={(e) => handleCloudChange(e.target.value as CloudProvider)}
              className="w-full h-6 appearance-none rounded-md border border-input bg-background pl-1.5 pr-6 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              style={inputStyle}
            >
              <option value="aws">AWS</option>
              <option value="gcp">GCP</option>
              <option value="azure">Azure</option>
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Region */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            Region
          </label>
          <div className="relative">
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full h-6 appearance-none rounded-md border border-input bg-background pl-1.5 pr-6 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              style={inputStyle}
            >
              {CLOUD_REGIONS[cloud].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-2 border-t border-border flex items-center justify-between bg-background">
        <div className="text-[10px] text-muted-foreground">
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">⌘↵</kbd> {isCopyMode ? 'clone' : 'create'}
          {' · '}
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">Esc</kbd> cancel
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={cancelCreation}
            disabled={isCreating || isCopying}
            className="h-6 px-2 text-[11px] rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            style={inputStyle}
          >
            Cancel
          </button>
          {isCopyMode ? (
            <button
              onClick={handleCopyIndex}
              disabled={isCopying || !draftCollection.name.trim()}
              className="h-6 px-2 text-[11px] rounded-md bg-[#007AFF] hover:bg-[#0071E3] active:bg-[#006DD9] text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCopying ? 'Cloning...' : 'Clone Index'}
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={isCreating || !draftCollection.name.trim()}
              className="h-6 px-2 text-[11px] rounded-md bg-[#007AFF] hover:bg-[#0071E3] active:bg-[#006DD9] text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          )}
        </div>
      </div>

      {/* Clone Progress Dialog */}
      {isCopyMode && draftCollection.sourceCollection && (
        <CopyProgressDialog
          open={showCopyProgress}
          onOpenChange={(open) => {
            if (!open && copyProgress.phase !== 'copying' && copyProgress.phase !== 'creating') {
              setShowCopyProgress(false)
              if (copyProgress.phase === 'complete') {
                cancelCreation()
              }
            }
          }}
          sourceCollectionName={draftCollection.sourceCollection.name}
          targetCollectionName={draftCollection.name}
          progress={{
            phase: copyProgress.phase,
            totalDocuments: copyProgress.totalVectors,
            processedDocuments: copyProgress.processedVectors,
            message: copyProgress.message,
          }}
          onCancel={handleCancelClone}
        />
      )}
    </div>
  )
}
