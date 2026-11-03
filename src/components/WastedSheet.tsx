import { useState } from 'react'
import { WASTE_REASONS, wasteJoke, type WasteReasonId } from '../lib/fun'
import { formatHours } from '../lib/planner'
import { haptic } from '../lib/device'
import { Button } from './ui'
import { Sheet } from './Sheet'

const DURATIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
] as const

export function WastedSheet({
  onClose,
  onLog,
}: {
  onClose: () => void
  /** Returns a short summary of what changed in the plan. */
  onLog: (reason: string, minutes: number) => string
}) {
  const [reason, setReason] = useState<WasteReasonId | null>(null)
  const [customReason, setCustomReason] = useState('')
  const [minutes, setMinutes] = useState<number | null>(null)
  const [customMinutes, setCustomMinutes] = useState('')
  const [useCustomTime, setUseCustomTime] = useState(false)
  const [result, setResult] = useState<{ joke: string; summary: string } | null>(null)

  const chosenMinutes = useCustomTime ? Number(customMinutes) : minutes
  const validMinutes = chosenMinutes !== null && Number.isFinite(chosenMinutes) && chosenMinutes >= 5 && chosenMinutes <= 720
  const validReason = reason !== null && (reason !== 'custom' || customReason.trim().length > 0)

  const submit = () => {
    if (!validReason || !validMinutes || reason === null || chosenMinutes === null) return
    haptic([20, 60, 20])
    const label = reason === 'custom' ? customReason.trim() : WASTE_REASONS.find((r) => r.id === reason)!.label
    const summary = onLog(label, Math.round(chosenMinutes))
    setResult({ joke: wasteJoke(reason, Date.now() / 1000), summary })
  }

  if (result) {
    return (
      <Sheet title="Plan rebuilt 🔁" onClose={onClose}>
        <div className="animate-stamp mx-auto mb-4 w-fit stamp-text px-4 py-1 font-display text-lg text-stamp">Replanned</div>
        <p className="font-hand text-2xl leading-snug" role="status">
          {result.joke}
        </p>
        <p className="mt-3 rounded-lg bg-note p-3 font-bold text-note-ink">{result.summary}</p>
        <Button variant="primary" big className="mt-5 w-full" onClick={onClose}>
          Show me the new plan
        </Button>
      </Sheet>
    )
  }

  return (
    <Sheet title="I Wasted Time 💀" onClose={onClose}>
      <p className="mb-4 text-muted">No judgement. Honesty gets you a better plan than pretending.</p>

      <fieldset>
        <legend className="mb-2 font-bold">What got you?</legend>
        <div className="grid grid-cols-2 gap-2">
          {WASTE_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={reason === r.id}
              onClick={() => {
                haptic(8)
                setReason(r.id)
              }}
              className={`press flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border-[3px] border-ink p-2 text-center text-sm leading-tight font-bold hard-shadow-sm ${
                reason === r.id ? 'bg-note text-note-ink' : 'bg-card'
              }`}
            >
              <span className="text-2xl leading-none" aria-hidden>
                {r.emoji}
              </span>
              {r.label}
            </button>
          ))}
        </div>
        {reason === 'custom' && (
          <div className="mt-3">
            <label htmlFor="custom-reason" className="sr-only">
              What happened?
            </label>
            <input
              id="custom-reason"
              autoFocus
              maxLength={60}
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="e.g. Reorganised my pens by colour"
              className="min-h-12 w-full rounded-lg border-[3px] border-ink bg-card px-3 text-ink placeholder:text-muted"
            />
          </div>
        )}
      </fieldset>

      <fieldset className="mt-5">
        <legend className="mb-2 font-bold">How long?</legend>
        <div className="grid grid-cols-4 gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d.minutes}
              type="button"
              aria-pressed={!useCustomTime && minutes === d.minutes}
              onClick={() => {
                setUseCustomTime(false)
                setMinutes(d.minutes)
              }}
              className={`press min-h-12 rounded-xl border-[3px] border-ink px-1 text-sm font-bold hard-shadow-sm ${
                !useCustomTime && minutes === d.minutes ? 'bg-ink text-paper' : 'bg-card'
              }`}
            >
              {d.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={useCustomTime}
            onClick={() => setUseCustomTime(true)}
            className={`press min-h-12 rounded-xl border-[3px] border-ink px-1 text-sm font-bold hard-shadow-sm ${
              useCustomTime ? 'bg-ink text-paper' : 'bg-card'
            }`}
          >
            Custom
          </button>
        </div>
        {useCustomTime && (
          <div className="mt-3 flex items-center gap-2">
            <label htmlFor="custom-minutes" className="font-bold">
              Minutes
            </label>
            <input
              id="custom-minutes"
              type="number"
              inputMode="numeric"
              min={5}
              max={720}
              autoFocus
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              aria-describedby="custom-minutes-hint"
              className="min-h-12 w-28 rounded-lg border-[3px] border-ink bg-card px-3 text-lg font-bold text-ink"
            />
            <span id="custom-minutes-hint" className="text-sm text-muted">
              5 to 720
            </span>
          </div>
        )}
      </fieldset>

      <Button variant="danger" big className="mt-6 w-full" disabled={!validReason || !validMinutes} onClick={submit}>
        {validMinutes && chosenMinutes ? `Deduct ${formatHours(chosenMinutes)} & replan` : 'Pick a reason and a time'}
      </Button>
    </Sheet>
  )
}
