import { useCallback, useEffect, useState } from 'react'
import { MessageSquare, ChevronRight, Trash2, ArrowLeft } from 'lucide-react'
import clsx from 'clsx'
import type { Conversation, ConversationMessage } from '../../lib/conversationTypes'
import {
  deleteConversation,
  getConversation,
  listConversations,
  listMessages,
} from '../../lib/conversationStore'

type Props = { agentId: string }

export function ConversationsPanel({ agentId }: Props) {
  const [list, setList] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])

  const refresh = useCallback(() => {
    setList(listConversations(agentId))
  }, [agentId])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }
    setMessages(listMessages(selectedId))
  }, [selectedId])

  if (selectedId) {
    const conv = getConversation(selectedId)
    return (
      <div className="max-w-2xl">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="inline-flex items-center gap-1.5 text-sm text-nyven-text-secondary hover:text-nyven-text mb-4"
        >
          <ArrowLeft size={14} /> Back to conversations
        </button>
        <h2 className="font-display text-lg font-medium mb-1">
          {conv?.title || 'Conversation'}
        </h2>
        <p className="text-xs text-nyven-text-secondary mb-4">
          {conv?.source} · {conv?.messageCount ?? 0} messages ·{' '}
          {conv ? new Date(conv.updatedAt).toLocaleString() : ''}
        </p>
        <div className="space-y-3 bg-nyven-surface border border-white/[0.06] rounded-2xl p-4 max-h-[60vh] overflow-y-auto">
          {messages.length === 0 && (
            <p className="text-sm text-nyven-text-secondary text-center py-8">
              No messages in this conversation.
            </p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={clsx(
                'max-w-[90%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
                m.role === 'user' &&
                  'ml-auto bg-nyven-cyan/10 border border-nyven-cyan/20 rounded-br-md',
                m.role === 'assistant' &&
                  'bg-white/[0.04] border border-white/[0.08] rounded-bl-md',
                m.role === 'system' && 'mx-auto text-xs text-nyven-text-secondary'
              )}
            >
              {m.content}
              {m.metadata?.knowledgeUsed && (
                <div className="mt-1.5 text-[10px] text-nyven-cyan/80">
                  Answered from agent knowledge
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="font-display text-lg font-medium">Conversations</h2>
        <p className="text-sm text-nyven-text-secondary mt-1">
          Playground and widget sessions for this agent (owner view).
        </p>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center py-14 px-6 rounded-2xl border border-dashed border-white/[0.08] text-center">
          <MessageSquare className="text-nyven-text-secondary mb-3 opacity-50" size={28} />
          <p className="text-sm text-nyven-text-secondary">
            No conversations yet. Use the Playground or website widget to start one.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSelectedId(c.id)}
                className="w-full text-left p-4 rounded-xl border border-white/[0.06] bg-nyven-surface hover:border-white/[0.12] transition-colors flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{c.title}</span>
                    <span className="text-[10px] uppercase tracking-wider text-nyven-text-secondary/70 bg-white/[0.04] px-1.5 py-0.5 rounded">
                      {c.source}
                    </span>
                    <span
                      className={clsx(
                        'text-[10px] px-1.5 py-0.5 rounded',
                        c.status === 'open'
                          ? 'text-emerald-400/90 bg-emerald-400/10'
                          : 'text-nyven-text-secondary bg-white/[0.04]'
                      )}
                    >
                      {c.status}
                    </span>
                  </div>
                  <p className="text-xs text-nyven-text-secondary mt-1 truncate">
                    {c.lastMessagePreview || 'No messages'}
                  </p>
                  <p className="text-[11px] text-nyven-text-secondary/60 mt-1">
                    {c.messageCount} messages · {new Date(c.updatedAt).toLocaleString()}
                  </p>
                </div>
                <ChevronRight size={16} className="text-nyven-text-secondary shrink-0" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteConversation(c.id)
                    refresh()
                  }}
                  className="p-1.5 rounded-lg text-red-400/70 hover:bg-red-500/10 shrink-0"
                  aria-label="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
