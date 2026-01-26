import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'

interface EmbeddingFieldRequiredDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EmbeddingFieldRequiredDialog({
  open,
  onOpenChange,
}: EmbeddingFieldRequiredDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Subtle overlay */}
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/20 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]",
            "w-[280px] rounded-xl",
            "bg-background/80 backdrop-blur-2xl backdrop-saturate-150",
            "shadow-[0_24px_48px_-12px_rgba(0,0,0,0.3)]",
            "ring-1 ring-black/10 dark:ring-white/10",
            "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          )}
        >
          {/* Content */}
          <div className="px-5 pt-5 pb-4 text-center">
            <DialogPrimitive.Title className="text-[13px] font-semibold text-foreground">
              Embedding Field Required
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-[11px] text-muted-foreground leading-[1.4]">
              Please configure which metadata field contains the text for embeddings before saving changes.
            </DialogPrimitive.Description>
          </div>

          {/* Button */}
          <div className="px-4 pb-4 flex gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className={cn(
                "flex-1 h-[22px] px-3 text-[12px] font-medium",
                "rounded-md",
                "bg-[#007AFF] hover:bg-[#0071E3] active:bg-[#006DD9]",
                "text-white",
                "shadow-sm",
                "transition-all duration-100",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]/50 focus-visible:ring-offset-1"
              )}
            >
              OK
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
