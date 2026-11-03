import { useEffect, useState } from 'react'
import { HazardTape } from './ui'

export function Loading({ lines }: { lines: string[] }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setI((n) => (n + 1) % lines.length), 800)
    return () => window.clearInterval(id)
  }, [lines.length])
  return (
    <div className="flex min-h-dvh flex-col" role="status" aria-live="polite" aria-busy="true">
      <HazardTape />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
        <div className="animate-wobble rounded-lg border-[3px] border-ink bg-note px-6 py-5 text-note-ink hard-shadow">
          <p className="font-display text-5xl" aria-hidden>
            📝
          </p>
        </div>
        <p key={i} className="animate-rise max-w-xs font-hand text-2xl">
          {lines[i]}
        </p>
      </div>
    </div>
  )
}
