import { useState, useEffect } from 'react'
import { ChevronDown, Lock } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { EMBEDDING_FUNCTIONS, EMBEDDING_FUNCTION_GROUPS, DEFAULT_EMBEDDING_FUNCTION_ID, getEmbeddingFunctionById } from '../../constants/embedding-functions'

interface EmbeddingFunctionSelectorProps {
  collectionName: string
  currentOverride: EmbeddingConfig | null
  serverConfig: { name: string; type: string; config?: Record<string, unknown> } | null
  onSave: (override: EmbeddingConfig) => Promise<void>
  onClear: () => Promise<void>
  embeddingDimension?: number | null
  // Integrated inference support
  indexEmbedConfig?: IndexEmbedConfig | null  // Index's embed config (if integrated inference)
  textField?: string                           // Effective text field used for embedding
  canOverride?: boolean                        // Whether override is allowed (false for integrated inference)
  // Text field configuration
  clientTextFieldOverride?: string | null      // Client-side text field override
  onTextFieldSave?: (textField: string) => Promise<void>
  onTextFieldClear?: () => Promise<void>
}

export function EmbeddingFunctionSelector({
  collectionName,
  currentOverride,
  serverConfig,
  onSave,
  onClear,
  embeddingDimension,
  indexEmbedConfig,
  textField = '_text',
  canOverride = true,
  clientTextFieldOverride,
  onTextFieldSave,
  onTextFieldClear,
}: EmbeddingFunctionSelectorProps) {
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string>('')
  const [textFieldInput, setTextFieldInput] = useState(clientTextFieldOverride || '')
  const [saving, setSaving] = useState(false)

  // Check if using integrated inference
  const hasIntegratedInference = !!indexEmbedConfig

  // Sync text field input when override changes
  useEffect(() => {
    setTextFieldInput(clientTextFieldOverride || '')
  }, [clientTextFieldOverride, open])

  // Set initial selection based on current override
  useEffect(() => {
    if (currentOverride) {
      const match = EMBEDDING_FUNCTIONS.find(
        ef => ef.type === currentOverride.provider && ef.modelName === currentOverride.modelName
      )
      setSelectedId(match?.id || '')
    } else {
      setSelectedId('')
    }
  }, [currentOverride, open])

  const selectedEF = EMBEDDING_FUNCTIONS.find(ef => ef.id === selectedId)

  const serverFunction = EMBEDDING_FUNCTIONS.find(ef => ef.modelName === serverConfig?.config?.model_name)

  const handleSave = async () => {
    if (!canOverride) return

    setSaving(true)
    try {
      // Save embedding config if selected
      if (selectedEF) {
        await onSave({
          provider: selectedEF.type as EmbeddingProviderType,
          modelName: selectedEF.modelName,
          vectorType: selectedEF.vectorType,
          ...(selectedEF.defaultDimension && { dimensions: selectedEF.defaultDimension }),
        })
      }
      // Save text field if changed
      const trimmedTextField = textFieldInput.trim()
      if (trimmedTextField && trimmedTextField !== '_text' && onTextFieldSave) {
        await onTextFieldSave(trimmedTextField)
      } else if (!trimmedTextField && clientTextFieldOverride && onTextFieldClear) {
        // Clear if empty and there was an override
        await onTextFieldClear()
      }
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    if (!canOverride) return
    setSaving(true)
    try {
      await onClear()
      if (onTextFieldClear) {
        await onTextFieldClear()
      }
      setTextFieldInput('')
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  // Check if there are any changes to save
  const hasEmbeddingChange = selectedEF !== undefined && selectedEF !== null
  const hasTextFieldChange = textFieldInput.trim() !== (clientTextFieldOverride || '') && textFieldInput.trim() !== ''
  const canSave = hasEmbeddingChange || hasTextFieldChange

  // For integrated inference, show a read-only display
  if (hasIntegratedInference) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            data-embedding-selector
            className="text-xs px-2 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1"
            title="Using index's integrated inference"
          >
            <Lock className="h-2.5 w-2.5" />
            {indexEmbedConfig.model}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start">
          {/* Header */}
          <div className="px-1 mb-3">
            <h4 className="font-medium text-[13px] text-foreground">Integrated Inference</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              This index uses Pinecone's integrated inference. Embedding configuration is managed by the index.
            </p>
          </div>

          <div className="space-y-3">
            {/* Index embed config info - read only */}
            <div className="mx-1 text-[11px] px-2.5 py-2 rounded-[5px] space-y-0.5 bg-emerald-500/8 dark:bg-emerald-500/10 ring-1 ring-emerald-500/20 dark:ring-emerald-500/25 shadow-[inset_0_0.5px_0_rgba(255,255,255,0.1)]">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Lock className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
                <span className="font-medium text-[10px] text-emerald-700 dark:text-emerald-400">
                  Index Configuration
                </span>
              </div>
              <p className="text-muted-foreground"><span className="text-foreground/60">Provider:</span> pinecone</p>
              <p className="text-muted-foreground"><span className="text-foreground/60">Model:</span> {indexEmbedConfig.model}</p>
              <p className="text-muted-foreground"><span className="text-foreground/60">Type:</span> {indexEmbedConfig.vectorType || 'dense'}</p>
              {indexEmbedConfig.dimension && (
                <p className="text-muted-foreground"><span className="text-foreground/60">Dimensions:</span> {indexEmbedConfig.dimension}</p>
              )}
              {indexEmbedConfig.metric && (
                <p className="text-muted-foreground"><span className="text-foreground/60">Metric:</span> {indexEmbedConfig.metric}</p>
              )}
              <p className="text-muted-foreground pt-1 border-t border-emerald-500/10 dark:border-emerald-500/15 mt-1">
                <span className="text-foreground/60">Text field:</span> {textField}
              </p>
            </div>
          </div>

          {/* Footer - just a close button */}
          <div className="flex justify-end gap-2 mt-3 pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[12px] px-2.5"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  // Standard editable selector for non-integrated inference indexes
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          data-embedding-selector
          className={`text-xs px-2 py-0.5 rounded cursor-pointer hover:opacity-80 transition-opacity ${
            currentOverride
              ? 'bg-primary/20 text-primary border border-primary/30'
              : 'text-muted-foreground bg-muted'
          }`}
          title={currentOverride ? 'Override active - Click to change' : 'Click to override embedding function'}
        >
          {currentOverride
            ? `${currentOverride.provider}: ${currentOverride.modelName}`
            : serverConfig?.name || 'Configure embedding'
          }
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        {/* Header */}
        <div className="px-1 mb-3">
          <h4 className="font-medium text-[13px] text-foreground">Embedding Configuration</h4>
        </div>

        <div className="space-y-3">
          {/* Current config info */}
          <div className="px-1">
            <Label className="text-muted-foreground text-[11px] font-normal">Current</Label>
            <p className="font-mono text-[11px] text-foreground/80 mt-0.5">
              {currentOverride ? `${currentOverride.provider}: ${currentOverride.modelName}` : 'Not configured'}
            </p>
          </div>

          {/* Selector */}
          <div className="px-1 space-y-1.5">
            <Label htmlFor="ef-select" className="text-[11px] font-normal">Embedding Provider</Label>
            <div className="relative">
              <select
                id="ef-select"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full h-[22px] appearance-none rounded-[5px] border-none bg-white/10 dark:bg-white/5 pl-2 pr-6 text-[13px] text-foreground shadow-[0_0.5px_1px_rgba(0,0,0,0.1),inset_0_0.5px_0.5px_rgba(255,255,255,0.1)] ring-1 ring-black/10 dark:ring-white/10 focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-default"
              >
                <option value="">Select...</option>
                {EMBEDDING_FUNCTION_GROUPS.map(group => (
                  <optgroup key={group} label={group}>
                    {EMBEDDING_FUNCTIONS.filter(ef => ef.group === group).map(ef => (
                      <option key={ef.id} value={ef.id}>
                        {ef.label} {ef.defaultDimension ? `(${ef.defaultDimension}d)` : '(sparse)'}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/70" />
            </div>
          </div>

          {/* Text Field Input */}
          <div className="px-1 space-y-1.5">
            <Label htmlFor="text-field" className="text-[11px] font-normal">Text Field</Label>
            <input
              id="text-field"
              type="text"
              value={textFieldInput}
              onChange={(e) => setTextFieldInput(e.target.value)}
              placeholder="_text"
              className="w-full h-[22px] rounded-[5px] border-none bg-white/10 dark:bg-white/5 px-2 text-[13px] text-foreground shadow-[0_0.5px_1px_rgba(0,0,0,0.1),inset_0_0.5px_0.5px_rgba(255,255,255,0.1)] ring-1 ring-black/10 dark:ring-white/10 focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50"
            />
            <p className="text-[10px] text-muted-foreground">
              Metadata field containing text for embeddings
            </p>
          </div>

          {/* Selected info */}
          {(() => {
            const defaultEF = getEmbeddingFunctionById(DEFAULT_EMBEDDING_FUNCTION_ID)!
            const displayEF = selectedEF || serverFunction || defaultEF
            // Dimension mismatch only applies to dense models with fixed dimensions
            const hasDimensionMismatch = selectedEF &&
              selectedEF.vectorType === 'dense' &&
              embeddingDimension &&
              selectedEF.defaultDimension &&
              selectedEF.defaultDimension !== embeddingDimension

            // Determine container styling based on state
            let containerClass = 'bg-black/[0.03] dark:bg-white/[0.04] ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[inset_0_0.5px_0_rgba(255,255,255,0.05)]'
            let accentColor = ''

            if (selectedEF) {
              if (hasDimensionMismatch) {
                // Red for dimension mismatch
                containerClass = 'bg-[#FF3B30]/8 dark:bg-[#FF453A]/10 ring-1 ring-[#FF3B30]/20 dark:ring-[#FF453A]/25 shadow-[inset_0_0.5px_0_rgba(255,255,255,0.1)]'
                accentColor = 'text-[#FF3B30] dark:text-[#FF453A]'
              } else {
                // Blue for valid override
                containerClass = 'bg-[#007AFF]/8 dark:bg-[#0A84FF]/10 ring-1 ring-[#007AFF]/20 dark:ring-[#0A84FF]/25 shadow-[inset_0_0.5px_0_rgba(255,255,255,0.1)]'
                accentColor = 'text-[#007AFF] dark:text-[#0A84FF]'
              }
            }

            return (
              <div className={`mx-1 text-[11px] px-2.5 py-2 rounded-[5px] space-y-0.5 ${containerClass}`}>
                {selectedEF && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${hasDimensionMismatch ? 'bg-[#FF3B30] dark:bg-[#FF453A]' : 'bg-[#007AFF] dark:bg-[#0A84FF]'}`} />
                    <span className={`font-medium text-[10px] ${accentColor}`}>
                      {hasDimensionMismatch ? 'Dimension Mismatch' : 'Selected'}
                    </span>
                  </div>
                )}
                <p className="text-muted-foreground"><span className="text-foreground/60">Provider:</span> {displayEF.type}</p>
                <p className="text-muted-foreground"><span className="text-foreground/60">Model:</span> {displayEF.modelName}</p>
                <p className="text-muted-foreground"><span className="text-foreground/60">Type:</span> {displayEF.vectorType}</p>
                {displayEF.vectorType === 'dense' && (
                  <p className="text-muted-foreground"><span className="text-foreground/60">Dimensions:</span> {displayEF.availableDimensions ? displayEF.availableDimensions.join(', ') : displayEF.defaultDimension}</p>
                )}
                {embeddingDimension && (
                  <p className="text-muted-foreground pt-1 border-t border-black/5 dark:border-white/5 mt-1">
                    <span className="text-foreground/60">Index:</span> {embeddingDimension}d
                  </p>
                )}
              </div>
            )
          })()}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-3 pt-3">
          {(currentOverride || clientTextFieldOverride) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[12px] px-2.5"
              onClick={handleClear}
              disabled={saving}
            >
              Clear All
            </Button>
          )}
          <Button
            size="sm"
            className="h-7 text-[12px] px-3"
            onClick={handleSave}
            disabled={!canSave || saving}
          >
            {saving ? 'Saving...' : 'Apply'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
