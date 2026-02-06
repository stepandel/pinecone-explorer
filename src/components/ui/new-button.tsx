import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NewButtonProps {
  onClick: () => void
  label: string
  disabled?: boolean
  title?: string
  className?: string
  iconOnly?: boolean
  'data-testid'?: string
}

export function NewButton({
  onClick,
  disabled = false,
  title,
  label,
  className,
  iconOnly = false,
  'data-testid': testId,
}: NewButtonProps) {
  if (iconOnly) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "h-5 w-5 flex items-center justify-center rounded hover:bg-black/[0.06] dark:hover:bg-white/[0.08] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-muted-foreground hover:text-foreground",
          className
        )}
        title={title || `Add ${label}`}
        data-testid={testId}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full h-6 flex items-center justify-center gap-1 text-[10px] rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
        className
      )}
      title={title}
      data-testid={testId}
    >
      <Plus className="h-3 w-3" />
      <span>{label}</span>
    </button>
  )
}
