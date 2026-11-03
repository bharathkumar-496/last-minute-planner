import { useEffect, useRef, type ReactNode } from 'react'

/** Bottom sheet on phones, centred dialog on larger screens. Esc and backdrop close it. */
export function Sheet({
  title,
  onClose,
  children,
  labelledBy = 'sheet-title',
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  labelledBy?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('button, input, [tabindex="0"]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
      if (e.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, a[href]')]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div className="animate-fade absolute inset-0 bg-black/55" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="animate-sheet relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border-[3px] border-b-0 border-ink bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink sm:rounded-3xl sm:border-b-[3px] hard-shadow"
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted/40 sm:hidden" aria-hidden />
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={labelledBy} className="font-display text-2xl leading-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-11 shrink-0 place-items-center rounded-xl border-[3px] border-ink text-xl font-bold"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
