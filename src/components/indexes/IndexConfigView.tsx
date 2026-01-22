import { useState, useEffect } from 'react'
import { ChevronDown, Info } from 'lucide-react'
import { useDraftIndex } from '../../context/DraftIndexContext'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcut'
import { SHORTCUTS } from '../../constants/keyboard-shortcuts'
import {
  EMBEDDING_FUNCTIONS,
  EMBEDDING_FUNCTION_GROUPS,
  getEmbeddingFunctionById,
  DEFAULT_EMBEDDING_FUNCTION_ID,
  type DistanceMetric,
} from '../../constants/embedding-functions'

const inputClassName = "w-full h-6 text-[11px] px-1.5 rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
const inputStyle = { boxShadow: 'inset 0 1px 2px 0 rgb(0 0 0 / 0.05)' }

// Cloud regions for serverless indexes
// Source: https://docs.pinecone.io/troubleshooting/available-cloud-regions
// Note: Starter plan is limited to AWS us-east-1 only
const CLOUD_REGIONS = {
  aws: ['us-east-1', 'us-west-2', 'eu-west-1'],
  gcp: ['us-central1', 'europe-west4'],
  azure: ['eastus2'],
} as const

type CloudProvider = keyof typeof CLOUD_REGIONS

export function IndexConfigView() {
  const { draftIndex, updateDraft, cancelCreation, saveDraft, isCreating, validationErrors } = useDraftIndex()

  // Embedding function selection - default to Pinecone's llama-text-embed-v2
  const [selectedEmbeddingId, setSelectedEmbeddingId] = useState<string>(DEFAULT_EMBEDDING_FUNCTION_ID)

  // Derived state from selected embedding
  const selectedEmbedding = getEmbeddingFunctionById(selectedEmbeddingId)
  const isSparseModel = selectedEmbedding?.vectorType === 'sparse'
  const supportedMetrics = selectedEmbedding?.supportedMetrics ?? ['cosine', 'euclidean', 'dotproduct'] as DistanceMetric[]
  const availableDimensions = isSparseModel || !selectedEmbedding
    ? []
    : selectedEmbedding.availableDimensions ?? (selectedEmbedding.defaultDimension ? [selectedEmbedding.defaultDimension] : [])

  // Derived cloud/region from draft (single source of truth)
  const cloud = (draftIndex?.serverlessSpec?.cloud as CloudProvider) || 'aws'
  const region = draftIndex?.serverlessSpec?.region || 'us-east-1'

  // Update draft when embedding changes (handles all defaults)
  useEffect(() => {
    if (!selectedEmbedding) return
    const isSparse = selectedEmbedding.vectorType === 'sparse'
    updateDraft({
      embeddingFunctionId: selectedEmbeddingId,
      dimensionOverride: selectedEmbedding.defaultDimension ? String(selectedEmbedding.defaultDimension) : '',
      metric: selectedEmbedding.supportedMetrics[0],
      ...(isSparse ? { serverlessSpec: { cloud: 'aws', region: 'us-east-1' } } : {}),
    })
  }, [selectedEmbeddingId])

  const handleSave = () => {
    if (draftIndex) saveDraft()
  }

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { shortcut: SHORTCUTS.SAVE, handler: handleSave, options: { skipInputs: false } },
    { shortcut: SHORTCUTS.SAVE_ENTER, handler: handleSave, options: { skipInputs: false } },
    { shortcut: SHORTCUTS.CANCEL, handler: cancelCreation },
  ])

  if (!draftIndex) return null

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
            value={draftIndex.name}
            onChange={(e) => updateDraft({ name: e.target.value })}
            placeholder="my-index"
            className={inputClassName}
            style={inputStyle}
            autoFocus
          />
          {validationErrors.name && <p className="text-[10px] text-destructive">{validationErrors.name}</p>}
        </div>

        {/* Embedding Function */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            Embedding Model
          </label>
          <div className="relative">
            <select
              value={selectedEmbeddingId}
              onChange={(e) => setSelectedEmbeddingId(e.target.value)}
              className="w-full h-6 appearance-none rounded-md border border-input bg-background pl-1.5 pr-6 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
              style={inputStyle}
            >
              <option value="">Select embedding model...</option>
              {EMBEDDING_FUNCTION_GROUPS.map(group => (
                <optgroup key={group} label={group}>
                  {EMBEDDING_FUNCTIONS.filter(ef => ef.group === group).map(ef => (
                    <option key={ef.id} value={ef.id}>
                      {ef.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>
          {/* Vector type info */}
          {selectedEmbedding && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Info className="h-3 w-3" />
              <span>
                Creates <span className="font-medium text-foreground">{selectedEmbedding.vectorType}</span> vectors
                {selectedEmbedding.type === 'pinecone' && ' (no additional API key needed)'}
                {selectedEmbedding.type === 'openai' && ' (requires OpenAI API key)'}
              </span>
            </div>
          )}
        </div>

        {/* Text Field - only shown when copying */}
        {draftIndex.sourceIndex && (
          <div className="space-y-1">
            <label htmlFor="text-field" className="text-[11px] font-medium text-muted-foreground">
              Embedding Text Field
            </label>
            <div className="relative">
              <select
                id="text-field"
                value={draftIndex.textField || '_text'}
                onChange={(e) => updateDraft({ textField: e.target.value })}
                className="w-full h-6 appearance-none rounded-md border border-input bg-background pl-1.5 pr-6 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                style={inputStyle}
              >
                {(draftIndex.availableTextFields || ['_text']).map(field => (
                  <option key={field} value={field}>{field}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Metadata field containing text for embedding regeneration
            </p>
          </div>
        )}

        {/* Dimension - hidden for sparse models */}
        {!isSparseModel && (
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              Dimension
            </label>
            <div className="relative">
              <select
                value={draftIndex.dimensionOverride || ''}
                onChange={(e) => updateDraft({ dimensionOverride: e.target.value })}
                className="w-full h-6 appearance-none rounded-md border border-input bg-background pl-1.5 pr-6 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                style={inputStyle}
                disabled={availableDimensions.length <= 1}
              >
                {availableDimensions.map(dim => (
                  <option key={dim} value={String(dim)}>{dim}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            </div>
            {availableDimensions.length <= 1 && (
              <p className="text-[10px] text-muted-foreground">
                Fixed dimension for this model
              </p>
            )}
            {availableDimensions.length > 1 && (
              <p className="text-[10px] text-muted-foreground">
                {selectedEmbedding?.label} supports multiple dimensions
              </p>
            )}
          </div>
        )}

        {/* Metric */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            Distance Metric
          </label>
          <div className="flex gap-3">
            {(['cosine', 'euclidean', 'dotproduct'] as const).map((metric) => {
              const isSupported = supportedMetrics.includes(metric)
              return (
                <label
                  key={metric}
                  className={`flex items-center gap-1 ${isSupported ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
                  title={isSupported ? undefined : `Not supported by ${selectedEmbedding?.label || 'this model'}`}
                >
                  <input
                    type="radio"
                    name="metric"
                    value={metric}
                    checked={(draftIndex.metric || 'cosine') === metric}
                    onChange={() => updateDraft({ metric })}
                    disabled={!isSupported}
                    className="h-3 w-3"
                  />
                  <span className="text-[10px] text-foreground capitalize">{metric}</span>
                </label>
              )
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            {selectedEmbedding?.label} supports: {supportedMetrics.join(', ')}
          </p>
        </div>

        {/* Cloud Provider */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            Cloud Provider
          </label>
          <div className="relative">
            <select
              value={cloud}
              onChange={(e) => {
                const newCloud = e.target.value as CloudProvider
                updateDraft({ serverlessSpec: { cloud: newCloud, region: CLOUD_REGIONS[newCloud][0] } })
              }}
              className="w-full h-6 appearance-none rounded-md border border-input bg-background pl-1.5 pr-6 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={inputStyle}
              disabled={isSparseModel}
            >
              <option value="aws">AWS</option>
              <option value="gcp">GCP</option>
              <option value="azure">Azure</option>
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>
          {isSparseModel && (
            <p className="text-[10px] text-muted-foreground">
              Sparse indexes only support AWS
            </p>
          )}
        </div>

        {/* Region */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">
            Region
          </label>
          <div className="relative">
            <select
              value={region}
              onChange={(e) => updateDraft({ serverlessSpec: { cloud, region: e.target.value } })}
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

      {/* Sparse model info */}
      {isSparseModel && (
        <div className="mx-4 mb-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded-md">
          <p className="text-[11px] text-blue-600 dark:text-blue-400">
            This will create a sparse index. Sparse indexes only support dotproduct metric and are limited to AWS regions.
          </p>
        </div>
      )}

      {/* Footer Actions */}
      <div className="px-4 py-2 border-t border-border flex items-center justify-between bg-background">
        <div className="text-[10px] text-muted-foreground">
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">{SHORTCUTS.SAVE_ENTER.keys}</kbd> create
          {' · '}
          <kbd className="px-1 py-0.5 bg-muted rounded text-[9px] font-mono">{SHORTCUTS.CANCEL.keys}</kbd> cancel
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
            disabled={isCreating || !draftIndex.name.trim()}
            className="h-6 px-2 text-[11px] rounded-md bg-[#007AFF] hover:bg-[#0071E3] active:bg-[#006DD9] text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Creating...' : 'Create Index'}
          </button>
        </div>
      </div>
    </div>
  )
}
