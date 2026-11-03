import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'primary' | 'danger' | 'plain' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-note text-note-ink border-ink hard-shadow',
  danger: 'bg-stamp-btn text-white border-ink hard-shadow',
  plain: 'bg-card text-ink border-ink hard-shadow-sm',
  ghost: 'bg-transparent text-ink border-transparent underline underline-offset-4 decoration-2',
}

// Disabled main actions look intentionally "not yet", not faded and broken.
const DISABLED: Record<Variant, string> = {
  primary: 'disabled:border-dashed disabled:bg-card disabled:text-muted disabled:shadow-none',
  danger: 'disabled:border-dashed disabled:bg-card disabled:text-muted disabled:shadow-none',
  plain: 'disabled:opacity-50',
  ghost: 'disabled:opacity-50',
}

export function Button({
  variant = 'plain',
  big = false,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; big?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={`press inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border-[3px] px-4 font-bold disabled:cursor-not-allowed ${
        big ? 'min-h-14 px-5 text-lg' : 'text-base'
      } ${VARIANTS[variant]} ${DISABLED[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

export function Card({ className = '', children, tone = 'card' }: { className?: string; children: ReactNode; tone?: 'card' | 'note' | 'pink' | 'blue' | 'green' }) {
  const bg = {
    card: 'bg-card text-ink',
    note: 'bg-note text-note-ink',
    pink: 'bg-note-pink text-note-ink',
    blue: 'bg-note-blue text-note-ink',
    green: 'bg-note-green text-note-ink',
  }[tone]
  return <div className={`rounded-2xl border-[3px] border-ink hard-shadow ${bg} ${className}`}>{children}</div>
}

export function Stepper({
  label,
  value,
  onChange,
  step,
  min,
  max,
  unit,
  hint,
  error,
  onBlocked,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step: number
  min: number
  max: number
  unit: string
  hint?: ReactNode
  error?: string
  /** Called when the user tries to go past min/max. */
  onBlocked?: (dir: 'down' | 'up') => void
}) {
  const id = useId()
  const go = (dir: 'down' | 'up') => {
    const next = Math.round((value + (dir === 'up' ? step : -step)) * 100) / 100
    if (next < min || next > max) onBlocked?.(dir)
    else onChange(next)
  }
  return (
    <div>
      <div id={`${id}-label`} className="mb-1 font-bold">
        {label}
      </div>
      <div className="flex items-center gap-3" role="group" aria-labelledby={`${id}-label`}>
        <Button aria-label={`Decrease ${label}`} onClick={() => go('down')} className="size-12 !px-0">
          <span className="text-2xl leading-none" aria-hidden>
            −
          </span>
        </Button>
        <output aria-live="polite" className="flex-1 text-center font-display text-3xl tabular-nums" htmlFor={id}>
          {value}
          <span className="ml-1 font-body text-base font-bold">{unit}</span>
        </output>
        <Button aria-label={`Increase ${label}`} onClick={() => go('up')} className="size-12 !px-0">
          <span className="text-2xl leading-none" aria-hidden>
            +
          </span>
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 animate-shake font-bold text-stamp">
          {error}
        </p>
      ) : (
        hint && <p className="mt-2 text-sm text-muted">{hint}</p>
      )}
    </div>
  )
}

export function Stamp({ children, className = '', tone = 'stamp' }: { children: ReactNode; className?: string; tone?: 'stamp' | 'ink' | 'ok' }) {
  const color = { stamp: 'text-stamp', ink: 'text-ink', ok: 'text-ok' }[tone]
  return <span className={`stamp-text inline-block px-2 py-0.5 font-display text-xs ${color} ${className}`}>{children}</span>
}

export function HazardTape({ children }: { children?: ReactNode }) {
  return (
    <div className="hazard flex h-8 items-center justify-center border-y-[3px] border-ink" aria-hidden={!children}>
      {children && (
        <span className="rounded bg-note-ink px-3 py-0.5 font-display text-xs tracking-widest text-note">{children}</span>
      )}
    </div>
  )
}
