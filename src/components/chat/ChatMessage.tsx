import { memo, Fragment } from 'react'
import Markdown from 'react-markdown'
import { Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFileSelection } from '@/context/FileSelectionContext'
import { CitationPopover } from './CitationPopover'

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
    <div className="flex items-center gap-1 py-1">
      <span
        className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce"
        style={{ animationDelay: '150ms' }}
      />
      <span
        className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce"
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
      <sup
        className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 ml-0.5 text-[10px] font-medium rounded bg-primary/10 text-primary cursor-pointer hover:bg-primary/20 transition-colors"
      >
        {index + 1}
      </sup>
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

  // Sort citations by position (descending) to insert from end to avoid offset issues
  const sortedCitations = [...citations].sort((a, b) => b.position - a.position)
  
  // Create segments with citation markers
  const segments: Array<{ text: string; citationIndex?: number }> = []
  let remainingContent = content
  let currentOffset = content.length

  for (const citation of sortedCitations) {
    const pos = citation.position
    if (pos >= 0 && pos <= currentOffset) {
      // Text after this citation position
      if (pos < currentOffset) {
        segments.unshift({ text: remainingContent.slice(pos, currentOffset) })
      }
      // Add citation marker
      segments.unshift({ 
        text: '', 
        citationIndex: citations.indexOf(citation)
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
        <Markdown
          components={{
            // Style code blocks
            pre: ({ children, ...props }) => (
              <pre
                className="bg-muted/50 rounded-md p-3 overflow-x-auto text-xs"
                {...props}
              >
                {children}
              </pre>
            ),
            code: ({ className, children, ...props }) => {
              // Check if it's inline code (no className usually means inline)
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
            // Style links
            a: ({ children, ...props }) => (
              <a
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
                {...props}
              >
                {children}
              </a>
            ),
          }}
        >
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
                // Render inline to avoid extra paragraphs
                p: ({ children }) => <span>{children}</span>,
                pre: ({ children, ...props }) => (
                  <pre
                    className="bg-muted/50 rounded-md p-3 overflow-x-auto text-xs"
                    {...props}
                  >
                    {children}
                  </pre>
                ),
                code: ({ className, children, ...props }) => {
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
                a: ({ children, ...props }) => (
                  <a
                    className="text-primary hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                    {...props}
                  >
                    {children}
                  </a>
                ),
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
        'flex gap-3 px-4 py-3',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
      data-testid={`chat-message-${role}`}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-secondary-foreground'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4" />
        ) : (
          <Bot className="w-4 h-4" />
        )}
      </div>

      {/* Message bubble */}
      <div
        className={cn(
          'flex-1 min-w-0 max-w-[80%]',
          isUser ? 'flex flex-col items-end' : ''
        )}
      >
        <div className="text-xs font-medium text-muted-foreground mb-1">
          {isUser ? 'You' : 'Assistant'}
        </div>
        <div
          className={cn(
            'rounded-lg px-3 py-2',
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
