import { useRef, useState } from 'react'
import { parseSyllabus, type Topic } from '../lib/planner'
import { haptic, uid } from '../lib/device'
import { Button, Card } from './ui'
import { CONFIDENCE, ConfidencePicker } from './ConfidencePicker'
import { ScreenHeader } from './ScreenHeader'

const TONES = ['note', 'pink', 'blue', 'green'] as const
const TILTS = ['-rotate-1', 'rotate-1', 'rotate-0', '-rotate-[0.5deg]']

const newTopic = (name: string, marks = 10): Topic => ({
  id: uid(),
  name,
  marks,
  hours: 1,
  confidence: 3,
  done: false,
})

export function TopicsScreen({
  topics,
  onChange,
  onBack,
  onBuild,
  onSample,
  eve,
}: {
  topics: Topic[]
  onChange: (t: Topic[]) => void
  onBack: () => void
  onBuild: () => void
  onSample: () => void
  eve: boolean
}) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'manual' | 'paste'>('manual')
  const [paste, setPaste] = useState('')
  const [notice, setNotice] = useState('')
  const listEnd = useRef<HTMLDivElement>(null)
  // On phones only one topic's editor is open at a time; the rest are slim rows.
  const [openId, setOpenId] = useState<string | null>(null)

  const add = (items: Topic[]) => {
    onChange([...topics, ...items])
    if (items.length === 1) setOpenId(items[0].id)
    haptic(10)
    requestAnimationFrame(() => listEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }

  const addManual = () => {
    const trimmed = name.trim()
    if (!trimmed) return setNotice('Type a topic first. Even "Unit 1" counts.')
    add([newTopic(trimmed)])
    setName('')
    setNotice(`Added ${trimmed}.`)
  }

  const split = () => {
    const parsed = parseSyllabus(paste)
    if (parsed.length === 0) return setNotice("Couldn't find any topics in there. Try one per line.")
    const existing = new Set(topics.map((t) => t.name.toLowerCase()))
    const fresh = parsed.filter((p) => !existing.has(p.name.toLowerCase()))
    add(fresh.map((p) => newTopic(p.name, p.marks)))
    setPaste('')
    setMode('manual')
    setNotice(`Split into ${fresh.length} topic${fresh.length === 1 ? '' : 's'}. Edit away.`)
  }

  const patch = (id: string, p: Partial<Topic>) => onChange(topics.map((t) => (t.id === id ? { ...t, ...p } : t)))
  const remove = (id: string) => onChange(topics.filter((t) => t.id !== id))

  const totalHours = topics.filter((t) => !t.done).reduce((a, t) => a + t.hours, 0)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4">
      <ScreenHeader step={3} onBack={onBack} title="What's on the paper?" />

      {topics.some((t) => t.why !== undefined) && (
        <Card tone="blue" className="mb-3 p-3 sm:mb-4">
          <p className="text-sm font-bold sm:text-base">💬 Study Buddy drafted these. Tap one to tweak it.</p>
        </Card>
      )}

      {eve && (
        <Card tone="note" className="mb-4 p-3">
          <p className="font-bold">🌙 Exam eve. Adding topics is fine. Starting brand-new ones tonight is not. The plan will skip 😱 topics.</p>
        </Card>
      )}

      <Card className="p-3 sm:p-4">
        <div role="tablist" aria-label="How to add topics" className="mb-3 grid grid-cols-2 gap-2 sm:mb-4">
          {(['manual', 'paste'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={mode === m}
              aria-controls={`panel-${m}`}
              id={`tab-${m}`}
              onClick={() => setMode(m)}
              className={`min-h-11 rounded-lg border-[3px] border-ink font-bold ${mode === m ? 'bg-ink text-paper' : 'bg-card'}`}
            >
              {m === 'manual' ? 'Type a topic' : 'Paste syllabus'}
            </button>
          ))}
        </div>

        {mode === 'manual' ? (
          <form
            id="panel-manual"
            role="tabpanel"
            aria-labelledby="tab-manual"
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              addManual()
            }}
          >
            <label htmlFor="topic-name" className="sr-only">
              Topic name
            </label>
            <input
              id="topic-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Unit 3: Thermodynamics"
              autoComplete="off"
              className="min-h-12 min-w-0 flex-1 rounded-lg border-[3px] border-ink bg-card px-3 text-lg text-ink placeholder:text-muted"
            />
            <Button type="submit" variant="primary">
              Add
            </Button>
          </form>
        ) : (
          <div id="panel-paste" role="tabpanel" aria-labelledby="tab-paste">
            <label htmlFor="syllabus" className="mb-1 block font-bold">
              Paste your syllabus
            </label>
            <textarea
              id="syllabus"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={6}
              placeholder={'Unit 1: Kinematics\nUnit 2: Laws of Motion (20 marks)\nWork, Energy, Power'}
              className="w-full rounded-lg border-[3px] border-ink bg-card p-3 font-mono text-sm text-ink placeholder:text-muted"
            />
            <p className="mt-1 text-sm text-muted">We split by line, comma, or "Unit/Chapter N". Marks like "(20 marks)" get picked up.</p>
            <Button variant="primary" onClick={split} className="mt-3 w-full" disabled={!paste.trim()}>
              Split into topics ✂️
            </Button>
          </div>
        )}
        <p aria-live="polite" className={`text-sm font-bold ${notice ? 'mt-2' : ''}`}>
          {notice}
        </p>
      </Card>

      <section aria-labelledby="topic-list" className="mt-4 flex-1 sm:mt-6">
        <div className="mb-3 flex items-end justify-between gap-2">
          <h2 id="topic-list" className="font-display text-xl">
            Topics <span className="text-muted">({topics.length})</span>
          </h2>
          {topics.length > 0 && <p className="text-sm font-bold text-muted">{totalHours}h of work estimated</p>}
        </div>

        {topics.length === 0 ? (
          <Card tone="note" className="tape relative mt-6 rotate-1 p-6 text-center">
            <p className="font-hand text-2xl">No topics yet.</p>
            <p className="mt-1">The syllabus is waiting. Menacingly.</p>
            <Button onClick={onSample} className="mt-4">
              Try sample exam 🧪
            </Button>
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-5">
            {topics.map((t, i) => {
              const open = openId === t.id
              return (
              <li key={t.id} className={`animate-rise ${open ? '' : 'max-sm:rotate-0'} ${TILTS[i % TILTS.length]}`}>
                <Card tone={TONES[i % TONES.length]} className={open ? 'p-3 sm:p-4' : 'max-sm:p-0 sm:p-4'}>
                  {/* Phone summary row: tap to edit. */}
                  <button
                    type="button"
                    onClick={() => setOpenId(t.id)}
                    aria-expanded={false}
                    className={`flex min-h-14 w-full items-center gap-3 px-3 text-left text-note-ink sm:hidden ${open ? 'hidden' : ''}`}
                  >
                    <span className="text-2xl" aria-hidden>
                      {CONFIDENCE[t.confidence].emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display">{t.name}</span>
                      <span className="block text-xs font-bold">
                        {t.marks} marks · {t.hours}h · {CONFIDENCE[t.confidence].label}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold underline">Edit</span>
                  </button>
                  <div className={open ? '' : 'max-sm:hidden'}>
                  <div className="flex items-start gap-2">
                    <label className="sr-only" htmlFor={`name-${t.id}`}>
                      Topic name
                    </label>
                    <input
                      id={`name-${t.id}`}
                      value={t.name}
                      onChange={(e) => patch(t.id, { name: e.target.value })}
                      className="min-h-11 min-w-0 flex-1 rounded-md border-2 border-transparent bg-transparent px-1 font-display text-lg text-note-ink hover:border-note-ink/30 focus:border-note-ink"
                    />
                    <button
                      type="button"
                      onClick={() => remove(t.id)}
                      aria-label={`Remove ${t.name}`}
                      className="grid size-11 shrink-0 place-items-center rounded-lg border-2 border-note-ink/40 text-xl font-bold hover:bg-white/50"
                    >
                      ×
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenId(null)}
                      aria-label={`Done editing ${t.name}`}
                      className="grid min-h-11 shrink-0 place-items-center rounded-lg border-2 border-note-ink bg-white/60 px-3 text-sm font-bold sm:hidden"
                    >
                      Done
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3 sm:gap-3">
                    <NumberField
                      id={`marks-${t.id}`}
                      label="Marks"
                      value={t.marks}
                      min={1}
                      max={500}
                      step={1}
                      onChange={(v) => patch(t.id, { marks: v })}
                    />
                    <NumberField
                      id={`hours-${t.id}`}
                      label="Hours"
                      value={t.hours}
                      min={0.5}
                      max={40}
                      step={0.5}
                      onChange={(v) => patch(t.id, { hours: v })}
                    />
                  </div>
                  {(t.why || (t.focus && t.focus.length > 0)) && (
                    <div className="mt-2 line-clamp-2 text-sm sm:line-clamp-none">
                      {t.why && <p className="font-bold">Why: {t.why}</p>}
                      {t.focus && t.focus.length > 0 && <p>Focus: {t.focus.join(' · ')}</p>}
                    </div>
                  )}
                  <div className="mt-2 sm:mt-3">
                    <ConfidencePicker value={t.confidence} topicName={t.name} onChange={(c) => patch(t.id, { confidence: c })} />
                  </div>
                  </div>
                </Card>
              </li>
              )
            })}
          </ul>
        )}
        <div ref={listEnd} />
      </section>

      <div className="sticky bottom-0 mt-6 flex flex-col gap-2 bg-gradient-to-t from-paper from-70% to-transparent pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {topics.length > 0 && (
          <Button variant="ghost" onClick={onSample} className="self-center text-sm max-sm:hidden">
            Replace with sample exam
          </Button>
        )}
        <Button variant="primary" big onClick={onBuild} disabled={topics.length === 0} className="w-full">
          {topics.length === 0 ? 'Add a topic to build a plan' : 'Build my survival plan →'}
        </Button>
      </div>
    </div>
  )
}

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  id: string
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
}) {
  const [draft, setDraft] = useState(String(value))
  const [synced, setSynced] = useState(value)
  if (synced !== value) {
    setSynced(value)
    setDraft(String(value))
  }
  return (
    <div className="flex items-center gap-2 sm:block">
      <label htmlFor={id} className="shrink-0 text-sm font-bold sm:block">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n)
        }}
        onBlur={() => setDraft(String(value))}
        className="min-h-11 w-full min-w-0 rounded-lg border-[3px] border-note-ink bg-white/70 px-2 text-lg font-bold text-note-ink"
      />
    </div>
  )
}
