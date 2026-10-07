import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Plus,
  Trash2,
  Pencil,
  BookOpen,
  HelpCircle,
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
  X,
  Check,
} from 'lucide-react'
import clsx from 'clsx'
import type { KnowledgeGap, KnowledgeItem } from '../../lib/knowledgeTypes'
import {
  createKnowledgeItem,
  deleteKnowledgeGap,
  deleteKnowledgeItem,
  listKnowledge,
  listKnowledgeGaps,
  resolveKnowledgeGap,
  setKnowledgeStatus,
  updateKnowledgeItem,
} from '../../lib/knowledgeStore'
import { getAgentInstance } from '../../lib/agentStore'
import { publishAgentConfig } from '../../lib/agentStore'
import { toPublishedKnowledge } from '../../lib/knowledgeStore'

type Props = {
  agentId: string
  onKnowledgeChange?: () => void
}

export function KnowledgePanel({ agentId, onKnowledgeChange }: Props) {
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [gaps, setGaps] = useState<KnowledgeGap[]>([])
  const [mode, setMode] = useState<'list' | 'faq' | 'text'>('list')
  const [editing, setEditing] = useState<KnowledgeItem | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [answer, setAnswer] = useState('')
  const [category, setCategory] = useState('General')

  const refresh = useCallback(() => {
    setItems(listKnowledge(agentId))
    setGaps(listKnowledgeGaps(agentId).filter((g) => !g.resolved))
  }, [agentId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const republish = async () => {
    const agent = getAgentInstance(agentId)
    if (!agent) return
    await publishAgentConfig(agent, toPublishedKnowledge(agentId))
    onKnowledgeChange?.()
  }

  const resetForm = () => {
    setTitle('')
    setContent('')
    setAnswer('')
    setCategory('General')
    setEditing(null)
    setMode('list')
    setError(null)
  }

  const startFaq = (item?: KnowledgeItem) => {
    if (item) {
      setEditing(item)
      setTitle(item.title)
      setAnswer(item.answer || item.content)
      setContent(item.content)
      setCategory(item.category || 'General')
    } else {
      setEditing(null)
      setTitle('')
      setAnswer('')
      setContent('')
      setCategory('General')
    }
    setMode('faq')
  }

  const startText = (item?: KnowledgeItem) => {
    if (item) {
      setEditing(item)
      setTitle(item.title)
      setContent(item.content)
    } else {
      setEditing(null)
      setTitle('')
      setContent('')
    }
    setMode('text')
  }

  const saveFaq = async () => {
    if (!title.trim() || !answer.trim()) {
      setError('Question and answer are required.')
      return
    }
    try {
      if (editing) {
        updateKnowledgeItem(editing.id, {
          title: title.trim(),
          content: title.trim(),
          answer: answer.trim(),
          category: category.trim() || 'General',
          type: 'faq',
        })
      } else {
        createKnowledgeItem({
          agentId,
          type: 'faq',
          title: title.trim(),
          content: title.trim(),
          answer: answer.trim(),
          category: category.trim() || 'General',
          status: 'active',
          metadata: {},
        })
      }
      await republish()
      resetForm()
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save FAQ.')
    }
  }

  const saveText = async () => {
    if (!title.trim() || !content.trim()) {
      setError('Title and content are required.')
      return
    }
    try {
      if (editing) {
        updateKnowledgeItem(editing.id, {
          title: title.trim(),
          content: content.trim(),
          type: 'text',
        })
      } else {
        createKnowledgeItem({
          agentId,
          type: 'text',
          title: title.trim(),
          content: content.trim(),
          status: 'active',
          metadata: {},
        })
      }
      await republish()
      resetForm()
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save information.')
    }
  }

  const toggleStatus = async (item: KnowledgeItem) => {
    try {
      setKnowledgeStatus(item.id, item.status === 'active' ? 'disabled' : 'active')
      await republish()
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status.')
    }
  }

  const remove = async (id: string) => {
    try {
      deleteKnowledgeItem(id)
      await republish()
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete.')
    }
  }

  const faqs = items.filter((i) => i.type === 'faq')
  const texts = items.filter((i) => i.type === 'text')

  if (mode === 'faq') {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-medium">
            {editing ? 'Edit FAQ' : 'Add FAQ'}
          </h2>
          <button
            type="button"
            onClick={resetForm}
            className="p-2 rounded-lg text-nyven-text-secondary hover:bg-white/[0.04]"
          >
            <X size={18} />
          </button>
        </div>
        {error && <Err text={error} />}
        <Field label="Question">
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What are your opening hours?"
          />
        </Field>
        <Field label="Answer">
          <textarea
            className={inputClass}
            rows={4}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="We are open Mon–Fri 9am–6pm."
          />
        </Field>
        <Field label="Category">
          <input
            className={inputClass}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="General"
          />
        </Field>
        <button
          type="button"
          onClick={saveFaq}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium"
        >
          <Check size={14} /> Save FAQ
        </button>
      </div>
    )
  }

  if (mode === 'text') {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-medium">
            {editing ? 'Edit information' : 'Add business information'}
          </h2>
          <button
            type="button"
            onClick={resetForm}
            className="p-2 rounded-lg text-nyven-text-secondary hover:bg-white/[0.04]"
          >
            <X size={18} />
          </button>
        </div>
        {error && <Err text={error} />}
        <Field label="Title">
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Shipping policy"
          />
        </Field>
        <Field label="Content">
          <textarea
            className={inputClass}
            rows={8}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste business information, policies, product details…"
          />
        </Field>
        <button
          type="button"
          onClick={saveText}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-nyven-cyan text-nyven-bg text-sm font-medium"
        >
          <Check size={14} /> Save information
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h2 className="font-display text-lg font-medium">Knowledge</h2>
        <p className="text-sm text-nyven-text-secondary mt-1">
          FAQs and business information the agent can use when answering. Retrieval is
          keyword-based (not vector search yet).
        </p>
      </div>

      {error && <Err text={error} />}

      {items.length === 0 && (
        <div className="flex flex-col items-center py-12 px-6 rounded-2xl border border-dashed border-white/[0.08] text-center">
          <BookOpen className="text-nyven-cyan mb-3 opacity-80" size={28} />
          <p className="text-sm text-nyven-text-secondary max-w-sm">
            Your agent doesn&apos;t know anything yet. Add FAQs or business information to
            help Nyven answer accurately.
          </p>
        </div>
      )}

      {/* FAQs */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <HelpCircle size={16} className="text-nyven-cyan" /> FAQs
          </h3>
          <button
            type="button"
            onClick={() => startFaq()}
            className="inline-flex items-center gap-1.5 text-xs text-nyven-cyan hover:underline"
          >
            <Plus size={14} /> Add FAQ
          </button>
        </div>
        {faqs.length === 0 ? (
          <p className="text-xs text-nyven-text-secondary/70">No FAQs yet.</p>
        ) : (
          <ul className="space-y-2">
            {faqs.map((f) => (
              <li
                key={f.id}
                className={clsx(
                  'p-4 rounded-xl border border-white/[0.06] bg-nyven-surface',
                  f.status === 'disabled' && 'opacity-50'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{f.title}</div>
                    <div className="text-xs text-nyven-text-secondary mt-1 line-clamp-2">
                      {f.answer}
                    </div>
                    {f.category && (
                      <span className="inline-block mt-2 text-[10px] uppercase tracking-wider text-nyven-text-secondary/70 bg-white/[0.04] px-1.5 py-0.5 rounded">
                        {f.category}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleStatus(f)}
                      className="p-1.5 rounded-lg text-nyven-text-secondary hover:bg-white/[0.04]"
                      title={f.status === 'active' ? 'Disable' : 'Enable'}
                    >
                      {f.status === 'active' ? (
                        <ToggleRight size={16} className="text-emerald-400" />
                      ) : (
                        <ToggleLeft size={16} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => startFaq(f)}
                      className="p-1.5 rounded-lg text-nyven-text-secondary hover:bg-white/[0.04]"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(f.id)}
                      className="p-1.5 rounded-lg text-red-400/80 hover:bg-red-500/10"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Business info */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <BookOpen size={16} className="text-nyven-violet" /> Business information
          </h3>
          <button
            type="button"
            onClick={() => startText()}
            className="inline-flex items-center gap-1.5 text-xs text-nyven-cyan hover:underline"
          >
            <Plus size={14} /> Add information
          </button>
        </div>
        {texts.length === 0 ? (
          <p className="text-xs text-nyven-text-secondary/70">
            No pasted business information yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {texts.map((t) => (
              <li
                key={t.id}
                className={clsx(
                  'p-4 rounded-xl border border-white/[0.06] bg-nyven-surface',
                  t.status === 'disabled' && 'opacity-50'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{t.title}</div>
                    <div className="text-xs text-nyven-text-secondary mt-1 line-clamp-3 whitespace-pre-wrap">
                      {t.content}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleStatus(t)}
                      className="p-1.5 rounded-lg text-nyven-text-secondary hover:bg-white/[0.04]"
                    >
                      {t.status === 'active' ? (
                        <ToggleRight size={16} className="text-emerald-400" />
                      ) : (
                        <ToggleLeft size={16} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => startText(t)}
                      className="p-1.5 rounded-lg text-nyven-text-secondary hover:bg-white/[0.04]"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(t.id)}
                      className="p-1.5 rounded-lg text-red-400/80 hover:bg-red-500/10"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Gaps */}
      <section>
        <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className="text-amber-400" /> Knowledge gaps
        </h3>
        {gaps.length === 0 ? (
          <p className="text-xs text-nyven-text-secondary/70">
            No recorded gaps yet. Questions the agent cannot answer from knowledge will appear
            here.
          </p>
        ) : (
          <ul className="space-y-2">
            {gaps.map((g) => (
              <li
                key={g.id}
                className="p-3 rounded-xl border border-amber-500/15 bg-amber-500/5 flex items-start justify-between gap-2"
              >
                <div>
                  <p className="text-sm text-nyven-text">{g.question}</p>
                  <p className="text-[11px] text-nyven-text-secondary mt-1">
                    {new Date(g.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      resolveKnowledgeGap(g.id)
                      refresh()
                    }}
                    className="text-[11px] text-nyven-cyan px-2 py-1 rounded-lg hover:bg-white/[0.04]"
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      deleteKnowledgeGap(g.id)
                      refresh()
                    }}
                    className="p-1.5 text-red-400/80 hover:bg-red-500/10 rounded-lg"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl bg-nyven-bg border border-white/[0.08] text-sm text-nyven-text placeholder:text-nyven-text-secondary/50 focus:border-nyven-cyan/40 outline-none transition-colors resize-y'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-nyven-text-secondary mb-1.5">
        {label}
      </span>
      {children}
    </label>
  )
}

function Err({ text }: { text: string }) {
  return (
    <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
      {text}
    </div>
  )
}
