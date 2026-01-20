import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'

interface CloneNamespaceProgressDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceNamespace: string
  targetNamespace: string
  progress: {
    phase: 'preparing' | 'copying' | 'complete' | 'error' | 'cancelled'
    totalVectors: number
    processedVectors: number
    message: string
  }
  onCancel: () => void
}

export function CloneNamespaceProgressDialog({
  open,
  onOpenChange,
  sourceNamespace,
  targetNamespace,
  progress,
  onCancel,
}: CloneNamespaceProgressDialogProps) {
  const percentage = progress.totalVectors > 0
    ? Math.round((progress.processedVectors / progress.totalVectors) * 100)
    : 0

  const sourceDisplay = sourceNamespace || '(default)'
  const targetDisplay = targetNamespace || '(default)'

  const isComplete = progress.phase === 'complete'
  const isError = progress.phase === 'error'
  const isCancelled = progress.phase === 'cancelled'
  const isWorking = progress.phase === 'preparing' || progress.phase === 'copying'

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/20 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]",
            "w-[320px] rounded-xl",
            "bg-background/80 backdrop-blur-2xl backdrop-saturate-150",
            "shadow-[0_24px_48px_-12px_rgba(0,0,0,0.3)]",
            "ring-1 ring-black/10 dark:ring-white/10",
            "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          )}
        >
          <div className="px-5 pt-5 pb-4 text-center">
            <DialogPrimitive.Title className="text-[13px] font-semibold text-foreground">
              {isComplete ? 'Clone Complete' : isError ? 'Clone Failed' : isCancelled ? 'Clone Cancelled' : 'Cloning Namespace'}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-[11px] text-muted-foreground leading-[1.4]">
              {isComplete ? (
                <>Copied <span className="font-medium text-foreground">{progress.processedVectors.toLocaleString()}</span> vectors to <span className="font-medium text-foreground">{targetDisplay}</span></>
              ) : isError ? (
                <span className="text-destructive">{progress.message}</span>
              ) : isCancelled ? (
                <>Clone was cancelled. <span className="font-medium text-foreground">{progress.processedVectors.toLocaleString()}</span> of <span className="font-medium text-foreground">{progress.totalVectors.toLocaleString()}</span> vectors were copied.</>
              ) : (
                <>Cloning <span className="font-medium text-foreground">{sourceDisplay}</span> to <span className="font-medium text-foreground">{targetDisplay}</span></>
              )}
            </DialogPrimitive.Description>

            {/* Progress bar */}
            {isWorking && (
              <div className="mt-4">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>{progress.message}</span>
                  <span>{percentage}%</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="px-4 pb-4 flex gap-2">
            {isWorking && (
              <button
                onClick={onCancel}
                className={cn(
                  "flex-1 h-[22px] px-3 text-[12px] font-normal",
                  "rounded-md",
                  "bg-white/10 dark:bg-white/10",
                  "text-foreground/90",
                  "ring-1 ring-black/10 dark:ring-white/15",
                  "shadow-sm",
                  "transition-all duration-100",
                  "hover:bg-white/20 dark:hover:bg-white/15",
                  "active:bg-white/25 dark:active:bg-white/20",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                )}
              >
                Cancel
              </button>
            )}
            {(isComplete || isError || isCancelled) && (
              <button
                onClick={() => onOpenChange(false)}
                className={cn(
                  "flex-1 h-[22px] px-3 text-[12px] font-medium",
                  "rounded-md",
                  "bg-primary hover:bg-primary/90 active:bg-primary/80",
                  "text-primary-foreground",
                  "shadow-sm",
                  "transition-all duration-100",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1"
                )}
              >
                Done
              </button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
