import type { ReactNode } from 'react'
import { ChatMessage } from '../ChatMessage'
import type { Message } from '../../lib/types'
import { AttachmentCard } from '../attachments/AttachmentCard'
import { DownloadFileCard } from './DownloadFileCard'

type Props = {
  messages: Message[]
  isGenerating?: boolean
  conversationId?: string
  scrollRef?: React.RefObject<HTMLDivElement>
  bottomRef?: React.RefObject<HTMLDivElement>
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void
  paddingBottom?: number | string
  emptyState?: ReactNode
  onFeedback?: (
    messageId: string,
    rating: 'positive' | 'negative',
    note?: string
  ) => void
  onReadAloud?: (messageId: string, content: string) => void
  onStopReadAloud?: () => void
  readingMessageId?: string | null
  readAloudLoading?: boolean
  onRegenerate?: () => void
  onAttachmentClick?: (att: NonNullable<Message['attachments']>[number]) => void
  listOnly?: boolean
  className?: string
}

export function ChatThread({
  messages,
  isGenerating,
  conversationId,
  scrollRef,
  bottomRef,
  onScroll,
  paddingBottom,
  emptyState,
  onFeedback,
  onReadAloud,
  onStopReadAloud,
  readingMessageId,
  readAloudLoading,
  onRegenerate,
  onAttachmentClick,
  listOnly,
  className,
}: Props) {
  const body = (
    <>
      {messages.length === 0 && emptyState}
      {messages.map((msg, idx) => {
        const isLast = idx === messages.length - 1
        return (
          <div key={msg.id} className="space-y-2">
            {msg.role === 'nyven' && msg.files && msg.files.length > 0 && (
              <div className="space-y-1 mb-2">
                {msg.files.map((f) => (
                  <DownloadFileCard key={f.id} file={f} />
                ))}
              </div>
            )}
            {msg.role === 'user' && msg.attachments && msg.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-end">
                {msg.attachments.map((a) => (
                  <AttachmentCard
                    key={a.id || a.name}
                    align="right"
                    item={{
                      id: a.id,
                      name: a.name || 'File',
                      mimeType: a.mimeType,
                      size: a.size,
                      kind: a.kind,
                      previewUrl: a.previewDataUrl,
                    }}
                    onClick={() => onAttachmentClick?.(a)}
                  />
                ))}
              </div>
            )}
            <ChatMessage
              message={msg}
              isLast={isLast}
              conversationId={conversationId}
              onRegenerate={
                isLast && msg.role === 'nyven' && !msg.isStreaming && onRegenerate
                  ? onRegenerate
                  : undefined
              }
              onFeedback={
                msg.role === 'nyven' && !msg.isStreaming && !msg.isThinking && onFeedback
                  ? onFeedback
                  : undefined
              }
              onReadAloud={
                msg.role === 'nyven' && !msg.isStreaming && !msg.isThinking && onReadAloud
                  ? onReadAloud
                  : undefined
              }
              onStopReadAloud={onStopReadAloud}
              isReadingAloud={readingMessageId === msg.id && !readAloudLoading}
              isReadAloudLoading={readingMessageId === msg.id && !!readAloudLoading}
            />
          </div>
        )
      })}
      {messages.length > 0 &&
        messages[messages.length - 1]?.role === 'nyven' &&
        messages[messages.length - 1]?.activityState === 'error' &&
        !isGenerating &&
        onRegenerate && (
          <div className="flex flex-col items-center gap-2 py-2">
            <p className="text-sm text-nyven-text-secondary text-center">
              Something went wrong while generating the response.
            </p>
            <button
              type="button"
              onClick={() => void onRegenerate()}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-nyven-surface border border-white/10 text-sm font-medium"
            >
              Retry
            </button>
          </div>
        )}
      {bottomRef ? <div ref={bottomRef} /> : null}
    </>
  )

  if (listOnly || className === 'contents') {
    return <div className={className === 'contents' ? 'contents' : className}>{body}</div>
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={
        className ||
        'flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 py-6 min-h-0 min-w-0'
      }
      style={paddingBottom != null ? { paddingBottom } : undefined}
    >
      <div className="max-w-3xl mx-auto space-y-4">{body}</div>
    </div>
  )
}
