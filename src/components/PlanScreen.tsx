import { useState, type ReactNode } from 'react'
import {
  BREAK_MIN,
  TIER_LABEL,
  countdownParts,
  formatHours,
  livingCountdown,
  type ExamSetup,
  type Plan,
  type StudyBlock,
  type Tier,
  type Topic,
} from '../lib/planner'
import { BADGES, type BadgeId } from '../lib/fun'
import { formatClock, remainingMs, type Timer } from '../lib/pomodoro'
import { Button, Card, HazardTape, Stamp } from './ui'
import { PanicMeter } from './PanicMeter'
import { CONFIDENCE } from './ConfidencePicker'

const TIER_STYLE: Record<Tier, { tone: 'stamp' | 'ink' | 'ok'; blurb: string }> = {
  'lock-in': { tone: 'stamp', blurb: 'Full time booked. These are your marks.' },
  'quick-revise': { tone: 'ink', blurb: 'Not enough time to go deep. Skim the key bits.' },
  vibes: { tone: 'ink', blurb: "No time booked, but you kinda know these. Trust past you." },
  'let-go': { tone: 'ok', blurb: 'Released with love. Protect what you know instead.' },
}
const TIER_ORDER: Tier[] = ['lock-in', 'quick-revise', 'vibes', 'let-go']

export interface PlanScreenProps {
  plan: Plan
  setup: ExamSetup
  topics: Topic[]
  now: number
  examMs: number
  badges: BadgeId[]
  todayWasted: number
  stampKey: number
  replanKey: number
  undo: { message: string } | null
  storageOk: boolean
  onDoneBlock: () => void
  timer: Timer | null
  onStartTimer: () => void
  onPauseTimer: () => void
  onResumeTimer: () => void
  onStopTimer: () => void
  onDoneTopic: (id: string) => void
  onRestoreTopic: (id: string) => void
  onUndo: () => void
  onDismissUndo: () => void
  onWasted: () => void
  onReport: () => void
  onEditTopics: () => void
  onBuddy: () => void
  onEditSetup: () => void
  onReset: () => void
  account: ReactNode
}

function dayLabel(dayIndex: number, now: number) {
  if (dayIndex === 0) return 'Today'
  if (dayIndex === 1) return 'Tomorrow'
  return new Date(now + dayIndex * 86400_000).toLocaleDateString(undefined, { weekday: 'long' })
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

type Tab = 'now' | 'schedule' | 'topics' | 'more'

export function PlanScreen(p: PlanScreenProps) {
  const { plan, setup, now } = p
  const [showAll, setShowAll] = useState(false)
  // Phones get one view at a time; from lg up everything is visible side by side.
  const [tab, setTab] = useState<Tab>('now')
  const on = (t: Tab) => (tab === t ? '' : 'max-lg:hidden')
  const pickTab = (t: Tab) => {
    setTab(t)
    if (window.scrollY > 160) window.scrollTo({ top: 0 })
  }
  const secondsLeft = Math.max(0, Math.floor((p.examMs - now) / 1000))
  const parts = countdownParts(Math.floor(secondsLeft / 60))
  const done = p.topics.filter((t) => t.done)
  const next = plan.next
  const nextTopic = next ? p.topics.find((t) => t.id === next.topicId) : undefined
  const nextTier = next ? plan.topics.find((t) => t.topic.id === next.topicId)?.tier : undefined

  if (plan.status === 'exam-started') {
    return (
      <Shell {...p} subject={setup.subject}>
        <Card tone="note" className="mt-6 p-6 text-center">
          <p className="text-5xl" aria-hidden>
            🍀
          </p>
          <h2 className="mt-2 font-display text-3xl">The exam has started.</h2>
          <p className="mt-2 text-lg">Close this tab. Go write. Good luck, legend.</p>
        </Card>
        <div className="mt-6 grid gap-3">
          <Button variant="primary" big onClick={p.onReport}>
            See my Survival Report
          </Button>
          <Button onClick={p.onReset}>Plan a new exam</Button>
        </div>
      </Shell>
    )
  }

  if (plan.status === 'no-topics' || plan.status === 'invalid-date') {
    return (
      <Shell {...p} subject={setup.subject}>
        <Card tone="pink" className="mt-6 p-6 text-center">
          <h2 className="font-display text-2xl">{plan.status === 'no-topics' ? 'No topics, no plan.' : "That exam date doesn't exist."}</h2>
          <p className="mt-2">{plan.status === 'no-topics' ? 'Add at least one topic and we will get to work.' : 'Fix the date and we are back in business.'}</p>
          <Button variant="primary" className="mt-4" onClick={plan.status === 'no-topics' ? p.onEditTopics : p.onEditSetup}>
            {plan.status === 'no-topics' ? 'Add topics' : 'Fix exam date'}
          </Button>
        </Card>
      </Shell>
    )
  }

  // Back-to-back blocks of the same topic read as one sitting: "Unit 4 · 3 blocks".
  type Sitting = { topicName: string; first: number; blocks: StudyBlock[] }
  const byDay = new Map<number, Sitting[]>()
  plan.blocks.forEach((block, index) => {
    const day = byDay.get(block.dayIndex) ?? []
    const last = day[day.length - 1]
    if (last && last.blocks[0].topicId === block.topicId) last.blocks.push(block)
    else day.push({ topicName: block.topicName, first: index, blocks: [block] })
    byDay.set(block.dayIndex, day)
  })
  const allSittings = [...byDay.entries()].flatMap(([day, list]) => list.map((sitting) => ({ day, sitting })))
  const shownSittings = showAll ? allSittings : allSittings.slice(0, 6)

  return (
    <Shell {...p} subject={setup.subject}>
      {plan.eve && (
        <div className="mt-3 rounded-xl border-[3px] border-note bg-note-ink p-2 text-center text-white sm:p-3" role="status">
          <p className="font-display text-note sm:text-lg">🌙 Exam eve mode</p>
          <p className="text-sm font-bold sm:text-base">No new topics. We protect what we know.</p>
        </div>
      )}

      {/* A box drawn on the exam paper: four ruled cells, the active one highlighted. */}
      <div className="sticky top-0 z-20 -mx-4 mt-3 bg-paper/95 px-4 pt-2 pb-2.5 backdrop-blur lg:hidden">
      <div role="tablist" aria-label="Plan views" className="grid grid-cols-4 overflow-hidden rounded-xl border-[3px] border-ink bg-card hard-shadow-sm">
        {(
          [
            ['now', 'Now', ''],
            ['schedule', 'Schedule', plan.blocks.length ? String(plan.blocks.length) : ''],
            ['topics', 'Topics', String(plan.topics.length + done.length)],
            ['more', 'More', p.badges.length ? `🏆${p.badges.length}` : ''],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => pickTab(id)}
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 border-l-[3px] border-ink px-1 first:border-l-0 ${
              tab === id ? 'bg-note text-note-ink' : 'text-ink'
            }`}
          >
            <span className="font-display text-[0.78rem] leading-none tracking-wide uppercase">{label}</span>
            {count && <span className={`text-[0.7rem] leading-none font-bold tabular-nums ${tab === id ? '' : 'text-muted'}`}>{count}</span>}
          </button>
        ))}
      </div>
      </div>

      <div className="mt-3 grid gap-4 lg:mt-4 lg:grid-cols-[1.3fr_1fr] lg:items-start lg:gap-5">
        <div className="flex flex-col gap-4 lg:gap-5">
          {/* The one main action */}
          <section aria-labelledby="next-heading" className={`relative ${on('now')}`}>
            <Card tone="note" className="tape relative overflow-hidden p-4 sm:p-5">
              <h2 id="next-heading" className="text-xs font-bold tracking-widest uppercase">
                Do this next
              </h2>
              {plan.status === 'all-done' ? (
                <>
                  <p className="mt-1 font-display text-3xl leading-tight">Everything's done. 🎉</p>
                  <p className="mt-2 font-bold">Now go sleep. That's an order, not a suggestion.</p>
                </>
              ) : next && nextTopic ? (
                <div key={`${next.id}-${p.replanKey}`} className="animate-rise">
                  <p className="mt-1 font-display text-[1.65rem] leading-tight break-words sm:text-4xl">
                    {next.topicName}, {next.minutes} minutes.
                  </p>
                  {nextTopic.focus && nextTopic.focus.length > 0 && (
                    <p className="mt-2 font-bold">
                      <span className="mr-1 rounded bg-note-ink px-1.5 py-0.5 text-xs tracking-wider text-note uppercase">Focus</span>
                      {nextTopic.focus.slice(0, 3).join(' · ')}
                    </p>
                  )}
                  <PomodoroPanel {...p} next={next} />
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-bold">
                    <span>
                      Block {next.part} of {next.parts}
                    </span>
                    <span aria-hidden>·</span>
                    <span>then a {BREAK_MIN}-min break</span>
                    {nextTier && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="rounded bg-note-ink px-2 py-0.5 text-note">{TIER_LABEL[nextTier]}</span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-1 font-display text-3xl leading-tight">No study time left.</p>
                  <p className="mt-2 font-bold">
                    {setup.hoursPerDay <= 0
                      ? "Zero hours a day means Vibes Only. Add some hours if you can."
                      : "It's Vibes Only from here. Rest, skim your notes, sleep well."}
                  </p>
                </>
              )}
              {p.stampKey > 0 && (
                <div
                  key={p.stampKey}
                  aria-hidden
                  className="animate-stamp-flash pointer-events-none absolute top-4 right-3 stamp-text border-[5px] bg-note/80 px-3 py-1 font-display text-3xl text-[#c8102e]"
                >
                  Done!
                </div>
              )}
            </Card>
          </section>

          {plan.realityChecks.length > 0 && (
            <ul className={`flex flex-col gap-2 ${on('now')}`} aria-label="Reality checks">
              {plan.realityChecks.map((c, i) => (
                <li
                  key={c}
                  className={`flex items-stretch overflow-hidden rounded-xl border-[3px] border-ink bg-card hard-shadow-sm ${i > 0 ? 'max-lg:hidden' : ''}`}
                >
                  <span className="hazard w-4 shrink-0" aria-hidden />
                  <p className="p-2.5 text-sm font-bold sm:p-3 sm:text-base">
                    <span className="sr-only">Reality check: </span>
                    {c}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {tab === 'now' && (
            <Card className="p-3 lg:hidden">
              <PanicMeter cookedPct={plan.cookedPct} level={plan.panic} compact />
              <ProgressBar pct={plan.progressPct} done={done.length} total={p.topics.length} id="progress-label-m" />
            </Card>
          )}

          {/* Upcoming blocks */}
          <section aria-labelledby="blocks-heading" className={on('schedule')}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 id="blocks-heading" className="font-display text-xl whitespace-nowrap">
                Upcoming blocks
              </h2>
              <p className="text-sm font-bold text-muted">
                {formatHours(plan.budgetMin)} available{p.todayWasted > 0 && ` (−${formatHours(p.todayWasted)} wasted today)`}
              </p>
            </div>
            {plan.blocks.length === 0 ? (
              <Card className="p-4">
                <p className="font-bold">{plan.status === 'all-done' ? 'Nothing left to schedule.' : 'No blocks fit before the exam. That is okay.'}</p>
              </Card>
            ) : (
              <div key={p.replanKey} className="flex flex-col gap-4">
                {[...new Set(shownSittings.map((s) => s.day))].map((day) => (
                  <div key={day}>
                    <h3 className="mb-2 text-xs font-bold tracking-widest text-muted uppercase">{dayLabel(day, now)}</h3>
                    <ol className="flex flex-col gap-2">
                      {shownSittings
                        .filter((s) => s.day === day)
                        .map(({ sitting }, i) => {
                          const { blocks, first } = sitting
                          const n = blocks.length
                          const studyMin = blocks.reduce((a, b) => a + b.minutes, 0)
                          const start = now + first * 30 * 60000
                          const end = now + ((first + n - 1) * 30 + blocks[n - 1].minutes) * 60000
                          const parts =
                            n === 1
                              ? `part ${blocks[0].part} of ${blocks[0].parts}`
                              : `parts ${blocks[0].part}–${blocks[n - 1].part} of ${blocks[0].parts}`
                          const isNext = first === 0
                          return (
                            <li
                              key={blocks[0].id}
                              className="animate-shuffle flex items-center gap-3 rounded-xl border-[3px] border-ink bg-card p-2 sm:p-3"
                              style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                            >
                              <span
                                className={`flex size-12 shrink-0 flex-col items-center justify-center rounded-lg border-2 border-ink leading-none ${
                                  isNext ? 'bg-stamp-btn text-white' : 'bg-note text-note-ink'
                                }`}
                              >
                                <span className="font-display text-base">{n > 1 ? `×${n}` : `${studyMin}m`}</span>
                                {n > 1 && <span className="mt-0.5 text-[0.65rem] font-bold">blocks</span>}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-bold">{sitting.topicName}</p>
                                <p className="truncate text-sm text-muted">
                                  {day === 0 ? `${clock(start)}–${clock(end)}` : `${formatHours(studyMin)} of study`} · {parts}
                                </p>
                              </div>
                              {isNext && <span className="shrink-0 rounded bg-note-ink px-1.5 py-0.5 text-[0.65rem] font-bold text-note uppercase">Next</span>}
                            </li>
                          )
                        })}
                    </ol>
                  </div>
                ))}
                <p className="text-xs text-muted">Each block is 25 minutes of study plus a {BREAK_MIN}-minute break.</p>
                {allSittings.length > 6 && (
                  <Button variant="ghost" onClick={() => setShowAll((s) => !s)} aria-expanded={showAll}>
                    {showAll ? 'Show less' : `Show the whole plan (${plan.blocks.length} blocks)`}
                  </Button>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="p-4 max-lg:hidden">
            <h2 className="sr-only">Status</h2>
            <PanicMeter cookedPct={plan.cookedPct} level={plan.panic} />
            <ProgressBar pct={plan.progressPct} done={done.length} total={p.topics.length} id="progress-label" />
          </Card>

          {/* Triage */}
          <section aria-labelledby="triage-heading" className={on('topics')}>
            <h2 id="triage-heading" className="mb-2 font-display text-xl">
              {plan.tight ? 'Triage' : 'The lineup'}
            </h2>
            <div className="flex flex-col gap-3">
              {TIER_ORDER.map((tier) => {
                const items = plan.topics.filter((t) => t.tier === tier)
                if (items.length === 0) return null
                // The ones you're dropping start folded away.
                return (
                  <details key={tier} open={tier === 'lock-in' || tier === 'quick-revise'} className="group">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                      <Stamp tone={TIER_STYLE[tier].tone} className="-rotate-2">
                        {TIER_LABEL[tier]}
                      </Stamp>
                      <span className="text-sm font-bold text-muted">{items.length}</span>
                      <span className="ml-auto text-sm font-bold text-muted transition-transform group-open:rotate-180" aria-hidden>
                        ▾
                      </span>
                    </summary>
                    <p className="mb-2 text-sm text-muted">{TIER_STYLE[tier].blurb}</p>
                    <ul className="flex flex-col gap-2">
                      {items.map((t) => (
                        <li key={t.topic.id} className="flex items-center gap-2 rounded-xl border-2 border-ink bg-card p-2 pl-3">
                          <span aria-label={`Confidence ${t.topic.confidence} of 5`} role="img" className="text-xl">
                            {CONFIDENCE[t.topic.confidence].emoji}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-bold">{t.topic.name}</p>
                            <p className="text-xs text-muted">
                              {t.topic.marks} marks · {t.allocatedMin}/{t.requiredMin} min booked
                              {t.note && ` · ${t.note}`}
                              {!t.note && t.topic.why && ` · ${t.topic.why}`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => p.onDoneTopic(t.topic.id)}
                            aria-label={`Mark ${t.topic.name} complete`}
                            className="press grid size-11 shrink-0 place-items-center rounded-lg border-[3px] border-ink bg-note-green text-lg font-bold text-note-ink"
                          >
                            ✓
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )
              })}
            </div>
          </section>

          {done.length > 0 && (
            <section aria-labelledby="done-heading" className={on('topics')}>
              <h2 id="done-heading" className="mb-2 font-display text-xl">
                Defeated
              </h2>
              <ul className="flex flex-col gap-2">
                {done.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 rounded-xl border-2 border-dashed border-ink p-2 pl-3">
                    <p className="min-w-0 flex-1 truncate font-bold line-through decoration-stamp decoration-[3px]">{t.name}</p>
                    <Button onClick={() => p.onRestoreTopic(t.id)} aria-label={`Undo completing ${t.name}`} className="text-sm">
                      Undo
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="badges-heading" className={on('more')}>
            <h2 id="badges-heading" className="mb-2 font-display text-xl">
              Badges
            </h2>
            <ul className="grid grid-cols-3 gap-2">
              {(Object.keys(BADGES) as BadgeId[]).map((id) => {
                const earned = p.badges.includes(id)
                return (
                  <li
                    key={id}
                    className={`rounded-xl border-[3px] p-2 text-center ${earned ? 'border-ink bg-note text-note-ink hard-shadow-sm' : 'border-dashed border-muted text-muted'}`}
                    title={BADGES[id].blurb}
                  >
                    <p className={`text-2xl ${earned ? '' : 'grayscale opacity-50'}`} aria-hidden>
                      {BADGES[id].emoji}
                    </p>
                    <p className="text-xs leading-tight font-bold">{BADGES[id].name}</p>
                    <p className="sr-only">
                      {earned ? 'Earned.' : 'Locked.'} {BADGES[id].blurb}
                    </p>
                  </li>
                )
              })}
            </ul>
          </section>

          <div className={`grid grid-cols-2 gap-2 ${on('more')}`}>
            <Button onClick={p.onReport} className="col-span-2">
              📄 Survival Report
            </Button>
            <Button onClick={p.onBuddy} className="col-span-2">
              💬 Tell Buddy something new
            </Button>
            <Button onClick={p.onEditTopics}>Edit topics</Button>
            <Button onClick={p.onEditSetup}>Edit exam</Button>
            <Button variant="ghost" onClick={p.onReset} className="col-span-2 text-sm">
              Plan a new exam
            </Button>
          </div>
        </div>
      </div>

      {/* Thumb-reach action bar */}
      <div className="h-36" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t-[3px] border-ink bg-paper/95 backdrop-blur">
        {p.undo && (
          <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 pt-3" role="status">
            <p className="min-w-0 flex-1 font-bold">{p.undo.message}</p>
            <Button onClick={p.onUndo}>Undo</Button>
            <button type="button" onClick={p.onDismissUndo} aria-label="Dismiss" className="grid size-11 place-items-center text-xl font-bold">
              ×
            </button>
          </div>
        )}
        <div className="mx-auto grid max-w-5xl grid-cols-[1fr_1.6fr] gap-3 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="primary" big onClick={p.onDoneBlock} disabled={!next && p.timer?.mode !== 'focus'}>
            Done ✓
          </Button>
          <Button variant="danger" big onClick={p.onWasted} disabled={plan.status === 'all-done'} className="whitespace-nowrap !px-3">
            I Wasted Time 💀
          </Button>
        </div>
      </div>
      <span className="sr-only">
        {parts.days} days {parts.hours} hours {parts.minutes} minutes left
      </span>
    </Shell>
  )
}

function ProgressBar({ pct, done, total, id }: { pct: number; done: number; total: number; id: string }) {
  return (
    <div className="mt-3 lg:mt-4">
      <div className="flex justify-between text-sm font-bold">
        <span id={id}>Marks secured</span>
        <span>
          {pct}% · {done}/{total} topics
        </span>
      </div>
      <div
        className="mt-1 h-4 overflow-hidden rounded-full border-[3px] border-ink bg-paper lg:h-5"
        role="progressbar"
        aria-labelledby={id}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-ok transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function PomodoroPanel({
  timer,
  now,
  next,
  onStartTimer,
  onPauseTimer,
  onResumeTimer,
  onStopTimer,
}: PlanScreenProps & { next: StudyBlock }) {
  if (!timer) {
    return (
      <Button onClick={onStartTimer} className="mt-4 w-full !border-note-ink !bg-note-ink !text-note">
        🍅 Start {next.minutes}-minute focus
      </Button>
    )
  }
  const left = remainingMs(timer, now)
  const pct = Math.min(100, Math.round(((timer.totalMs - left) / timer.totalMs) * 100))
  const paused = timer.endsAt === null
  const focus = timer.mode === 'focus'
  return (
    <div className="mt-4 rounded-xl border-[3px] border-note-ink bg-note-ink p-3 text-note" role="timer" aria-label={`${focus ? 'Focus' : 'Break'} timer`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold tracking-widest uppercase">
          {focus ? '🍅 Focus' : '☕ Break: stand up, drink water'}
          {paused && ' · paused'}
        </p>
        {focus && timer.topicId !== next.topicId && <p className="truncate text-xs">{timer.topicName}</p>}
      </div>
      <p className={`font-display text-5xl tabular-nums ${paused ? 'opacity-60' : ''}`} aria-live="off">
        {formatClock(left)}
      </p>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-white/20" aria-hidden>
        <div className={`h-full transition-[width] duration-1000 ease-linear ${focus ? 'bg-note' : 'bg-note-green'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button onClick={paused ? onResumeTimer : onPauseTimer} className="!border-note !bg-note-ink !text-note">
          {paused ? '▶ Resume' : '⏸ Pause'}
        </Button>
        <Button onClick={onStopTimer} className="!border-note !bg-note-ink !text-note">
          {focus ? '■ Stop' : 'Skip break'}
        </Button>
      </div>
    </div>
  )
}

function Shell({
  subject,
  examMs,
  now,
  storageOk,
  account,
  children,
}: PlanScreenProps & { subject: string; children: ReactNode }) {
  const secondsLeft = Math.max(0, Math.floor((examMs - now) / 1000))
  const minutesLeft = Math.floor(secondsLeft / 60)
  const { days, hours, minutes } = countdownParts(minutesLeft)
  const secs = secondsLeft % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <div className="min-h-dvh">
      <HazardTape />
      <main className="mx-auto w-full max-w-5xl px-4 pt-4">
        {!storageOk && (
          <p role="alert" className="mb-3 rounded-lg border-[3px] border-ink bg-note-pink p-3 text-sm font-bold text-note-ink">
            Heads up: this browser won't let us save (private mode?). Your plan works, but won't survive a refresh.
          </p>
        )}
        <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold tracking-widest text-muted uppercase">Last Minute Planner</p>
              <div className="sm:hidden">{account}</div>
            </div>
            <h1 className="truncate font-display text-2xl leading-tight sm:text-3xl">{subject || 'Your exam'}</h1>
          </div>
          <div className="sm:text-right">
            <div className="mb-1 hidden justify-end sm:flex">{account}</div>
            <p className="font-display text-xl tabular-nums sm:text-2xl" aria-hidden>
              {days > 0 && `${days}d `}
              {pad(hours)}h {pad(minutes)}m <span className="text-stamp">{pad(secs)}s</span>
            </p>
            <p className="text-xs font-bold text-muted sm:text-sm">{livingCountdown(minutesLeft, now)}</p>
          </div>
        </header>
        {children}
      </main>
    </div>
  )
}
