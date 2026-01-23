import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface EmbeddingCellProps {
  embedding: number[] | null
  sparseEmbedding?: { indices: number[]; values: number[] } | null
}

export default function EmbeddingCell({ embedding, sparseEmbedding }: EmbeddingCellProps) {
  const [expanded, setExpanded] = useState(false)

  const hasDenseEmbedding = embedding && embedding.length > 0
  const hasSparseEmbedding = sparseEmbedding && sparseEmbedding.indices.length > 0

  if (!hasDenseEmbedding && !hasSparseEmbedding) {
    return <span className="text-muted-foreground italic text-xs">No embedding</span>
  }

  // Display sparse embedding if no dense embedding
  if (!hasDenseEmbedding && hasSparseEmbedding) {
    const sparseCount = sparseEmbedding.indices.length
    const previewCount = 3

    if (expanded) {
      return (
        <div className="space-y-1">
          <div className="text-xs bg-secondary p-1.5 rounded font-mono max-h-32 overflow-y-auto">
            <span className="text-muted-foreground">sparse: </span>
            {sparseEmbedding.indices.map((idx, i) => (
              <span key={idx}>{i > 0 && ', '}{idx}:{sparseEmbedding.values[i].toFixed(2)}</span>
            ))}
          </div>
          <Button
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(false)
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
            <span key={idx}>{i > 0 && ', '}{idx}:{sparseEmbedding.values[i].toFixed(2)}</span>
          ))}
          {sparseCount > previewCount && '...'}
        </span>
        {sparseCount > previewCount && (
          <Button
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(true)
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

  // Display dense embedding
  const previewCount = 5
  const hasMore = embedding!.length > previewCount

  if (expanded) {
    return (
      <div className="space-y-1">
        <div className="text-xs bg-secondary p-1.5 rounded font-mono max-h-32 overflow-y-auto">
          [{embedding!.join(', ')}]
        </div>
        <Button
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(false)
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
            setExpanded(true)
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
