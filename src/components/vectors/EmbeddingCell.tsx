import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface EmbeddingCellProps {
  embedding: number[] | null
  sparseEmbedding?: { indices: number[]; values: number[] } | null
}

export default function EmbeddingCell({ embedding, sparseEmbedding }: EmbeddingCellProps) {
  const [denseExpanded, setDenseExpanded] = useState(false)
  const [sparseExpanded, setSparseExpanded] = useState(false)

  const hasDenseEmbedding = embedding && embedding.length > 0
  const hasSparseEmbedding = sparseEmbedding && sparseEmbedding.indices.length > 0
  const isHybrid = hasDenseEmbedding && hasSparseEmbedding

  if (!hasDenseEmbedding && !hasSparseEmbedding) {
    return <span className="text-muted-foreground italic text-xs">No embedding</span>
  }

  // Hybrid: display both dense and sparse
  if (isHybrid) {
    const densePreviewCount = 3
    const sparsePreviewCount = 2
    const denseHasMore = embedding!.length > densePreviewCount
    const sparseHasMore = sparseEmbedding!.indices.length > sparsePreviewCount

    return (
      <div className="space-y-2">
        {/* Hybrid badge */}
        <span className="inline-block px-1.5 py-0.5 text-[9px] font-medium rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
          hybrid
        </span>

        {/* Dense embedding */}
        <div>
          <span className="text-[10px] text-muted-foreground font-medium">dense:</span>
          {denseExpanded ? (
            <div className="space-y-1 mt-0.5">
              <div className="text-xs bg-secondary p-1.5 rounded font-mono max-h-24 overflow-y-auto">
                [{embedding!.join(', ')}]
              </div>
              <Button
                onClick={(e) => { e.stopPropagation(); setDenseExpanded(false) }}
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
              >
                Show less
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-xs font-mono">
                [{embedding!.slice(0, densePreviewCount).join(', ')}{denseHasMore && '...'}]
              </span>
              {denseHasMore && (
                <Button
                  onClick={(e) => { e.stopPropagation(); setDenseExpanded(true) }}
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs whitespace-nowrap"
                >
                  +{embedding!.length - densePreviewCount}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Sparse embedding */}
        <div>
          <span className="text-[10px] text-muted-foreground font-medium">sparse:</span>
          {sparseExpanded ? (
            <div className="space-y-1 mt-0.5">
              <div className="text-xs bg-secondary p-1.5 rounded font-mono max-h-24 overflow-y-auto">
                {sparseEmbedding!.indices.map((idx, i) => (
                  <span key={idx}>{i > 0 && ', '}{idx}:{sparseEmbedding!.values[i].toFixed(3)}</span>
                ))}
              </div>
              <Button
                onClick={(e) => { e.stopPropagation(); setSparseExpanded(false) }}
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
              >
                Show less
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-xs font-mono">
                {sparseEmbedding!.indices.slice(0, sparsePreviewCount).map((idx, i) => (
                  <span key={idx}>{i > 0 && ', '}{idx}:{sparseEmbedding!.values[i].toFixed(3)}</span>
                ))}
                {sparseHasMore && '...'}
              </span>
              {sparseHasMore && (
                <Button
                  onClick={(e) => { e.stopPropagation(); setSparseExpanded(true) }}
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs whitespace-nowrap"
                >
                  +{sparseEmbedding!.indices.length - sparsePreviewCount}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Sparse only
  if (!hasDenseEmbedding && hasSparseEmbedding) {
    const sparseCount = sparseEmbedding.indices.length
    const previewCount = 3

    if (sparseExpanded) {
      return (
        <div className="space-y-1">
          <div className="text-xs bg-secondary p-1.5 rounded font-mono max-h-32 overflow-y-auto">
            <span className="text-muted-foreground">sparse: </span>
            {sparseEmbedding.indices.map((idx, i) => (
              <span key={idx}>{i > 0 && ', '}{idx}:{sparseEmbedding.values[i].toFixed(3)}</span>
            ))}
          </div>
          <Button
            onClick={(e) => {
              e.stopPropagation()
              setSparseExpanded(false)
            }}
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
          >
            Show less
          </Button>
        </div>
      )
    }

    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-mono">
          <span className="text-muted-foreground">sparse: </span>
          {sparseEmbedding.indices.slice(0, previewCount).map((idx, i) => (
            <span key={idx}>{i > 0 && ', '}{idx}:{sparseEmbedding.values[i].toFixed(3)}</span>
          ))}
          {sparseCount > previewCount && '...'}
        </span>
        {sparseCount > previewCount && (
          <Button
            onClick={(e) => {
              e.stopPropagation()
              setSparseExpanded(true)
            }}
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs whitespace-nowrap"
          >
            +{sparseCount - previewCount} more
          </Button>
        )}
      </div>
    )
  }

  // Dense only
  const previewCount = 5
  const hasMore = embedding!.length > previewCount

  if (denseExpanded) {
    return (
      <div className="space-y-1">
        <div className="text-xs bg-secondary p-1.5 rounded font-mono max-h-32 overflow-y-auto">
          [{embedding!.join(', ')}]
        </div>
        <Button
          onClick={(e) => {
            e.stopPropagation()
            setDenseExpanded(false)
          }}
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
        >
          Show less
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-mono">
        [{embedding!.slice(0, previewCount).join(', ')}
        {hasMore && '...'}]
      </span>
      {hasMore && (
        <Button
          onClick={(e) => {
            e.stopPropagation()
            setDenseExpanded(true)
          }}
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs whitespace-nowrap"
        >
          +{embedding!.length - previewCount} more
        </Button>
      )}
    </div>
  )
}
