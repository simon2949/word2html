import { useEffect, useRef, useState, type ReactNode } from 'react'

interface ReadableReviewDialogProps {
  open: boolean
  eyebrow: string
  title: string
  onClose: () => void
  children: ReactNode
}

export function ReadableReviewDialog({
  open,
  eyebrow,
  title,
  onClose,
  children,
}: ReadableReviewDialogProps) {
  const [fontPercent, setFontPercent] = useState(110)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    window.setTimeout(() => closeRef.current?.focus(), 0)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, open])

  if (!open) return null

  return (
    <div
      className="readable-review-overlay"
      role="presentation"
      onMouseDown={(event) => {
        event.stopPropagation()
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="readable-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="readable-review-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="readable-review-header">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2 id="readable-review-title">{title}</h2>
          </div>
          <div className="readable-review-tools" aria-label="阅读字号">
            <button type="button" onClick={() => setFontPercent((value) => Math.max(90, value - 10))} disabled={fontPercent <= 90} aria-label="缩小文字">A−</button>
            <span>{fontPercent}%</span>
            <button type="button" onClick={() => setFontPercent((value) => Math.min(160, value + 10))} disabled={fontPercent >= 160} aria-label="放大文字">A+</button>
            <button ref={closeRef} className="readable-review-close" type="button" onClick={onClose} aria-label="关闭放大阅读">×</button>
          </div>
        </header>
        <div className="readable-review-body" style={{ fontSize: `${fontPercent}%` }}>
          {children}
        </div>
      </section>
    </div>
  )
}
