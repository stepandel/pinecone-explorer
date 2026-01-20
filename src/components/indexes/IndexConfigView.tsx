import { useState, useEffect, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { useDraftCollection } from '../../context/DraftCollectionContext'
import { useCollection } from '../../context/CollectionContext'

const inputClassName = "w-full h-6 text-[11px] px-1.5 rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
const inputStyle = { boxShadow: 'inset 0 1px 2px 0 rgb(0 0 0 / 0.05)' }

// Cloud regions for serverless indexes
const CLOUD_REGIONS = {
  aws: ['us-east-1', 'us-west-2', 'eu-west-1'],
  gcp: ['us-central1', 'europe-west1', 'asia-southeast1'],
  azure: ['eastus2'],
} as const

type CloudProvider = keyof typeof CLOUD_REGIONS

export function IndexConfigView() {
  const { draftCollection, updateDraft, cancelCreation, saveDraft, isCreating, validationErrors } = useDraftCollection()
  const { setActiveIndex } = useCollection()

  // Cloud and region selection
  const [cloud, setCloud] = useState<CloudProvider>('aws')
  const [region, setRegion] = useState('us-east-1')

  // Handle cloud change - update region to first available
  const handleCloudChange = useCallback((newCloud: CloudProvider) => {
    setCloud(newCloud)
    setRegion(CLOUD_REGIONS[newCloud][0])
  }, [])

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
      // Cmd+S or Cmd+Enter to save
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'Enter')) {
        e.preventDefault()
        handleSave()
      }
      // Escape to cancel
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelCreation()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, cancelCreation])

  if (!draftCollection) return null

  return (
    <div className="flex flex-col h-full bg-background">

      {/* Configuration Form */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
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
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">⌘↵</kbd> create
          {' · '}
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">Esc</kbd> cancel
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={cancelCreation}
            disabled={isCreating}
            className="h-6 px-2 text-[11px] rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            style={inputStyle}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isCreating || !draftCollection.name.trim()}
            className="h-6 px-2 text-[11px] rounded-md bg-[#007AFF] hover:bg-[#0071E3] active:bg-[#006DD9] text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Creating...' : 'Create Index'}
          </button>
        </div>
      </div>
    </div>
  )
}
