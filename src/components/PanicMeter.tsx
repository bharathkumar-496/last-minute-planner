import { PANIC_LEVELS, type PanicLevel } from '../lib/planner'

const SEGMENTS = ['#3fb950', '#ffd23f', '#ff9f1c', '#e63946', '#7a0a1c']

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const pt = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  const [x1, y1] = pt(from)
  const [x2, y2] = pt(to)
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`
}

export function PanicMeter({ cookedPct, level, compact = false }: { cookedPct: number; level: PanicLevel; compact?: boolean }) {
  const angle = -90 + (Math.min(100, Math.max(0, cookedPct)) / 100) * 180
  const index = PANIC_LEVELS.indexOf(level)
  return (
    <div
      role="meter"
      aria-label="Panic Meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={cookedPct}
      aria-valuetext={`${cookedPct}% cooked: ${level}`}
      className={compact ? 'flex items-center gap-3' : 'flex flex-col items-center'}
    >
      <svg viewBox="0 0 220 128" className={compact ? 'w-28 shrink-0' : 'w-full max-w-64'} aria-hidden>
        {SEGMENTS.map((color, i) => {
          const start = Math.PI + (i * Math.PI) / 5
          const end = Math.PI + ((i + 1) * Math.PI) / 5
          return <path key={color} d={arc(110, 112, 86, start + 0.02, end - 0.02)} stroke={color} strokeWidth={26} fill="none" />
        })}
        <path d={arc(110, 112, 100, Math.PI, 2 * Math.PI)} stroke="var(--ink)" strokeWidth={3} fill="none" />
        <g className="needle" style={{ transform: `rotate(${angle}deg)`, transformOrigin: '110px 112px' }}>
          <polygon points="106,112 114,112 110,30" fill="var(--ink)" />
        </g>
        <circle cx={110} cy={112} r={11} fill="var(--stamp)" stroke="var(--ink)" strokeWidth={3} />
      </svg>
      <div className={compact ? 'min-w-0' : 'flex flex-col items-center'}>
        <p className={`font-display leading-none ${compact ? 'text-2xl' : '-mt-1 text-3xl'}`}>
          {cookedPct}%<span className={compact ? 'ml-1 font-body text-xs font-bold tracking-widest text-muted uppercase' : 'hidden'}>cooked</span>
        </p>
        {!compact && <p className="text-xs font-bold tracking-widest text-muted uppercase">cooked</p>}
        <p
          key={level}
          className={`animate-stamp stamp-text px-2 py-0.5 font-display ${compact ? 'mt-1 text-xs' : 'mt-2 px-3 py-1 text-center text-sm'} ${index >= 3 ? 'text-stamp' : 'text-ink'}`}
        >
          {level}
        </p>
      </div>
    </div>
  )
}
