import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NewButtonProps {
  onClick: () => void
  label: string
  disabled?: boolean
  title?: string
  className?: string
}

export function NewButton({
  onClick,
  disabled = false,
  title,
  label,
  className,
}: NewButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full h-6 flex items-center justify-center gap-1 text-[10px] rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
        className
      )}
      title={title}
    >
      <Plus className="h-3 w-3" />
      <span>{label}</span>
    </button>
  )
}
