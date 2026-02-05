import { ReactNode } from 'react'
import { FileText } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import type { Citation, CitationReference } from '../../../electron/types'

interface CitationPopoverProps {
  citation: Citation
  onViewFile?: (fileId: string) => void
  children: ReactNode
}

function formatPages(pages?: number[]): string | null {
  if (!pages || pages.length === 0) return null
  return `Pages: ${pages.join(', ')}`
}

export function CitationPopover({
  citation,
  onViewFile,
  children,
}: CitationPopoverProps) {
  const { references } = citation

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-64 p-0"
        align="start"
        sideOffset={4}
        showArrow={false}
      >
        <div className="p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Sources
          </div>
          <ul className="space-y-2">
            {references.map((ref, idx) => (
              <li
                key={`${ref.file.id}-${idx}`}
                className="flex flex-col gap-1.5"
              >
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" title={ref.file.name}>
                      {ref.file.name}
                    </div>
                    {ref.pages && ref.pages.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {formatPages(ref.pages)}
                      </div>
                    )}
                  </div>
                </div>
                {onViewFile && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs justify-start ml-6"
                    onClick={() => onViewFile(ref.file.id)}
                  >
                    View File
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default CitationPopover
