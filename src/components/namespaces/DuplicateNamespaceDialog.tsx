import { useState, useEffect } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'

const inputStyle = { boxShadow: 'inset 0 1px 2px 0 rgb(0 0 0 / 0.05)' }

interface DuplicateNamespaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceNamespace: string
  onConfirm: (targetNamespace: string) => void
}

export function DuplicateNamespaceDialog({
  open,
  onOpenChange,
  sourceNamespace,
  onConfirm,
}: DuplicateNamespaceDialogProps) {
  const displayName = sourceNamespace || '(default)'
  const defaultTargetName = sourceNamespace ? `${sourceNamespace}-copy` : 'default-copy'
  const [targetNamespace, setTargetNamespace] = useState(defaultTargetName)

  // Reset input when dialog opens
  useEffect(() => {
    if (open) {
      setTargetNamespace(defaultTargetName)
    }
  }, [open, defaultTargetName])

  // Validation: non-empty and different from source
  const isValid = targetNamespace.trim().length > 0 && targetNamespace.trim() !== sourceNamespace

  const handleConfirm = () => {
    if (isValid) {
      onConfirm(targetNamespace.trim())
    }
  }

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
            "w-[320px] rounded-xl",
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
              Duplicate Namespace
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-2 text-[11px] text-muted-foreground leading-[1.4]">
              Create a copy of <span className="font-medium text-foreground">{displayName}</span> with all its vectors.
            </DialogPrimitive.Description>

            {/* Target namespace input */}
            <div className="mt-3">
              <label className="text-[10px] text-muted-foreground">
                New namespace name
              </label>
              <input
                type="text"
                value={targetNamespace}
                onChange={(e) => setTargetNamespace(e.target.value)}
                placeholder="Enter namespace name"
                className={cn(
                  "mt-1.5 w-full h-7 px-2 text-[11px] text-center",
                  "rounded-md border border-input bg-background/50",
                  "placeholder:text-muted-foreground/40",
                  "focus:outline-none focus:ring-1 focus:ring-ring"
                )}
                style={inputStyle}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isValid) {
                    handleConfirm()
                  }
                }}
              />
              {targetNamespace.trim() === sourceNamespace && (
                <p className="mt-1 text-[10px] text-destructive">
                  Name must be different from source
                </p>
              )}
            </div>
          </div>

          {/* Buttons - horizontal layout like macOS desktop alerts */}
          <div className="px-4 pb-4 flex gap-2">
            {/* Secondary button - subtle rounded rect */}
            <button
              onClick={() => onOpenChange(false)}
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
            {/* Primary button */}
            <button
              onClick={handleConfirm}
              disabled={!isValid}
              className={cn(
                "flex-1 h-[22px] px-3 text-[12px] font-medium",
                "rounded-md",
                "bg-primary hover:bg-primary/90 active:bg-primary/80",
                "text-primary-foreground",
                "shadow-sm",
                "transition-all duration-100",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1"
              )}
            >
              Duplicate
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
