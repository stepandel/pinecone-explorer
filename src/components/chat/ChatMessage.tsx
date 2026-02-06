import { memo, Fragment, ComponentPropsWithoutRef } from 'react'
import Markdown from 'react-markdown'
import { cn } from '@/lib/utils'
import { useFileSelection } from '@/context/FileSelectionContext'
import { CitationPopover } from './CitationPopover'

// Shared Markdown component styling
const sharedMarkdownComponents = {
  pre: ({ children, ...props }: ComponentPropsWithoutRef<'pre'>) => (
    <pre
      className="bg-muted/50 rounded-md p-3 overflow-x-auto text-xs"
      {...props}
    >
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }: ComponentPropsWithoutRef<'code'> & { className?: string }) => {
    const isInline = !className
    if (isInline) {
      return (
        <code
          className="bg-muted/50 rounded px-1 py-0.5 text-xs font-mono"
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <code className={cn('text-xs font-mono', className)} {...props}>
        {children}
      </code>
    )
  },
  a: ({ children, ...props }: ComponentPropsWithoutRef<'a'>) => (
    <a
      className="text-primary hover:underline"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
}

interface CitationReference {
  file: { name: string; id: string }
  pages?: number[]
}

interface Citation {
  position: number
  references: CitationReference[]
}

export interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  isStreaming?: boolean
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      <span
        className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
        style={{ animationDelay: '150ms' }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
        style={{ animationDelay: '300ms' }}
      />
    </div>
  )
}

function CitationSuperscript({ 
  citation, 
  index,
  onViewFile,
}: { 
  citation: Citation
  index: number
  onViewFile?: (fileId: string) => void
}) {
  return (
    <CitationPopover citation={citation} onViewFile={onViewFile}>
      <button
        type="button"
        aria-label={`View citation ${index + 1}`}
        className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 ml-0.5 text-[10px] font-medium rounded bg-primary/10 text-primary cursor-pointer hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors align-super"
        data-testid="citation-superscript"
        data-citation-index={index}
      >
        {index + 1}
      </button>
    </CitationPopover>
  )
}

/**
 * Insert citation superscripts into content based on citation positions.
 * Citations have positions indicating where in the text they should appear.
 */
function renderContentWithCitations(content: string, citations?: Citation[]) {
  if (!citations || citations.length === 0) {
    return content
  }

  // Sort citations by position (descending) with original indices preserved
  const sortedCitations = citations
    .map((c, i) => ({ citation: c, originalIndex: i }))
    .sort((a, b) => b.citation.position - a.citation.position)
  
  // Create segments with citation markers
  const segments: Array<{ text: string; citationIndex?: number }> = []
  let remainingContent = content
  let currentOffset = content.length

  for (const { citation, originalIndex } of sortedCitations) {
    const pos = citation.position
    if (pos >= 0 && pos <= currentOffset) {
      // Text after this citation position
      if (pos < currentOffset) {
        segments.unshift({ text: remainingContent.slice(pos, currentOffset) })
      }
      // Add citation marker
      segments.unshift({ 
        text: '', 
        citationIndex: originalIndex
      })
      currentOffset = pos
      remainingContent = remainingContent.slice(0, pos)
    }
  }

  // Add any remaining text at the beginning
  if (currentOffset > 0) {
    segments.unshift({ text: remainingContent.slice(0, currentOffset) })
  }

  return segments
}

function UserMessage({ content }: { content: string }) {
  return (
    <div className="text-sm text-primary-foreground whitespace-pre-wrap break-words">
      {content}
    </div>
  )
}

function AssistantMessage({ 
  content, 
  citations,
  isStreaming,
  onViewFile,
}: { 
  content: string
  citations?: Citation[]
  isStreaming?: boolean
  onViewFile?: (fileId: string) => void
}) {
  // Show typing indicator if streaming with no content
  if (isStreaming && !content) {
    return <TypingIndicator />
  }

  const segments = renderContentWithCitations(content, citations)

  // If no citations, render markdown directly
  if (typeof segments === 'string') {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <Markdown components={sharedMarkdownComponents}>
          {content}
        </Markdown>
        {isStreaming && (
          <span className="inline-block w-2 h-4 ml-1 bg-foreground/50 animate-pulse" />
        )}
      </div>
    )
  }

  // Render with inline citations
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      {segments.map((segment, idx) => (
        <Fragment key={idx}>
          {segment.text && (
            <Markdown
              components={{
                ...sharedMarkdownComponents,
                // Render inline to avoid extra paragraphs
                p: ({ children }) => <span>{children}</span>,
              }}
            >
              {segment.text}
            </Markdown>
          )}
          {segment.citationIndex !== undefined && citations && (
            <CitationSuperscript 
              citation={citations[segment.citationIndex]} 
              index={segment.citationIndex}
              onViewFile={onViewFile}
            />
          )}
        </Fragment>
      ))}
      {isStreaming && (
        <span className="inline-block w-2 h-4 ml-1 bg-foreground/50 animate-pulse" />
      )}
    </div>
  )
}

export const ChatMessage = memo(function ChatMessage({
  role,
  content,
  citations,
  isStreaming,
}: ChatMessageProps) {
  const { setActiveFile } = useFileSelection()
  const isUser = role === 'user'

  return (
    <div
      className={cn(
        'px-3 py-1.5',
        isUser ? 'flex justify-end' : 'flex justify-start'
      )}
      aria-label={isUser ? 'Your message' : 'Assistant message'}
      data-testid={`chat-message-${role}`}
    >
      <div className={cn('min-w-0 max-w-[80%]', isUser ? 'ml-auto' : 'mr-auto')}>
        <div
          className={cn(
            'rounded-2xl px-2.5 py-1.5',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/50'
          )}
        >
          {isUser ? (
            <UserMessage content={content} />
          ) : (
            <AssistantMessage
              content={content}
              citations={citations}
              isStreaming={isStreaming}
              onViewFile={setActiveFile}
            />
          )}
        </div>
      </div>
    </div>
  )
})

export default ChatMessage
