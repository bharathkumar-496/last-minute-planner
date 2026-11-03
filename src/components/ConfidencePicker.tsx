import type { KeyboardEvent } from 'react'
import type { Confidence } from '../lib/planner'
import { haptic } from '../lib/device'

export const CONFIDENCE: Record<Confidence, { emoji: string; label: string }> = {
  1: { emoji: '😱', label: 'Never seen it' },
  2: { emoji: '😬', label: 'Heard of it' },
  3: { emoji: '😐', label: 'Kinda know it' },
  4: { emoji: '🙂', label: 'Pretty solid' },
  5: { emoji: '😎', label: 'Could teach it' },
}

const LEVELS: Confidence[] = [1, 2, 3, 4, 5]

/** A radio group of tappable emojis, with arrow-key support. */
export function ConfidencePicker({
  value,
  onChange,
  topicName,
}: {
  value: Confidence
  onChange: (c: Confidence) => void
  topicName: string
}) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = Math.min(5, Math.max(1, value + delta)) as Confidence
    onChange(next)
    const group = e.currentTarget
    requestAnimationFrame(() => group.querySelector<HTMLButtonElement>(`[data-level="${next}"]`)?.focus())
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-2" role="radiogroup" aria-label={`Confidence in ${topicName}`} onKeyDown={onKey}>
        {LEVELS.map((level) => {
          const active = level === value
          return (
            <button
              key={level}
              type="button"
              role="radio"
              data-level={level}
              aria-checked={active}
              aria-label={`${level} of 5: ${CONFIDENCE[level].label}`}
              tabIndex={active ? 0 : -1}
              onClick={() => {
                haptic(8)
                onChange(level)
              }}
              className={`grid size-12 place-items-center rounded-full border-[3px] text-2xl transition-transform ${
                active ? 'scale-110 border-ink bg-card hard-shadow-sm' : 'border-transparent opacity-60 hover:opacity-100'
              }`}
            >
              <span aria-hidden>{CONFIDENCE[level].emoji}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-0.5 text-center text-xs font-bold sm:mt-1 sm:text-sm" aria-hidden>
        {CONFIDENCE[value].label}
      </p>
    </div>
  )
}
