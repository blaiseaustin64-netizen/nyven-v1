/** Shared attachment card for chat bubbles and project Files. */
import clsx from 'clsx'
import { File, Image as ImageIcon } from 'lucide-react'

export type AttachmentCardData = {
  id?: string
  name: string
  mimeType?: string
  size?: number
  kind?: 'image' | 'document' | 'text' | string
  previewUrl?: string
}

function badgeFor(name: string, mime?: string): string {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toUpperCase() : ''
  if (ext) return ext.slice(0, 5)
  if (mime?.startsWith('image/')) return 'IMG'
  if (mime?.includes('pdf')) return 'PDF'
  if (mime?.includes('zip')) return 'ZIP'
  return 'FILE'
}

export function AttachmentCard({
  item,
  onClick,
  className,
  align = 'left',
}: {
  item: AttachmentCardData
  onClick?: () => void
  className?: string
  align?: 'left' | 'right'
}) {
  const isImage = item.kind === 'image' || (item.mimeType || '').startsWith('image/')
  const badge = badgeFor(item.name, item.mimeType)
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'relative w-[132px] h-[132px] rounded-2xl border border-white/[0.1] bg-white/[0.04] overflow-hidden text-left shrink-0',
        align === 'right' && 'ml-auto',
        className
      )}
    >
      {isImage && item.previewUrl ? (
        <img src={item.previewUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <>
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/50 text-[10px] font-medium tracking-wide">
            {badge}
          </span>
          <span className="absolute inset-0 grid place-items-center text-white/25">
            {isImage ? <ImageIcon size={28} /> : <File size={28} />}
          </span>
        </>
      )}
      <span className="absolute bottom-0 inset-x-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent">
        <span className="block text-[11px] leading-snug line-clamp-2 break-all">{item.name}</span>
      </span>
    </button>
  )
}
