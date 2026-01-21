import { usePinecone } from '../../providers/PineconeProvider'
import { useCollection } from '../../context/CollectionContext'

export function IndexesPanel() {
  const { indexes, indexesLoading, indexesError } = usePinecone()
  const { activeIndex, setActiveIndex } = useCollection()

  const handleIndexClick = (indexName: string) => {
    setActiveIndex(indexName)
  }

  return (
    <aside
      className="h-full w-full flex flex-col flex-shrink-0"
      style={{
        background: 'var(--sidebar)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div className="px-2 py-2 border-b border-border">
        <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Indexes
        </h2>
      </div>

      {/* Indexes List */}
      <div className="flex-1 overflow-y-auto py-1">
        {indexesLoading && (
          <div className="px-2 py-2 text-[10px] text-muted-foreground">Loading...</div>
        )}

        {indexesError && (
          <div className="px-2 py-2 text-[10px] text-destructive">{indexesError}</div>
        )}

        {!indexesLoading && !indexesError && indexes.length === 0 && (
          <div className="px-2 py-2 text-[10px] text-muted-foreground text-center">
            No indexes
          </div>
        )}

        {!indexesLoading && !indexesError && indexes.length > 0 && (
          <div className="space-y-0.5">
            {indexes.map((index) => {
              const isActive = index.name === activeIndex

              return (
                <button
                  key={index.name}
                  onClick={() => handleIndexClick(index.name)}
                  className={`w-full px-2 py-1.5 text-left transition-colors duration-100 ${
                    isActive
                      ? 'bg-black/[0.08] dark:bg-white/[0.10]'
                      : 'hover:bg-black/[0.05] dark:hover:bg-white/[0.06]'
                  }`}
                  title={`${index.name}\n${index.dimension}d · ${index.metric}`}
                >
                  <div
                    className={`text-[11px] truncate ${
                      isActive
                        ? 'text-sidebar-foreground font-medium'
                        : 'text-sidebar-foreground'
                    }`}
                  >
                    {index.name}
                  </div>
                  <div className="text-[9px] text-muted-foreground truncate">
                    {index.dimension}d
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
