import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  buildUnits,
  chipsFor,
  guessUnitsFromMaterial,
  introFor,
  parseUnits,
  profileFromSyllabus,
  replyFor,
  understand,
  wordCount,
  type BuddyMessage,
  type BuddySession,
} from '../lib/buddy'
import { analysePapers, applyReport, insightsFor, type Paper } from '../lib/pyq'
import type { HuntResult } from '../lib/hunt'
import { PyqHuntCard, PyqReportCard } from './PyqCards'
import { ACCEPT, ExtractError, extractText } from '../lib/extract'
import { haptic, prefersReducedMotion, uid } from '../lib/device'
import { addPapers, loadDraft, saveDraft } from '../lib/storage'
import { Button, Card } from './ui'
import { ScreenHeader } from './ScreenHeader'

type Slot = 'syllabus' | 'material' | 'pyq'

interface Upload {
  id: string
  name: string
  slot: Slot
  status: 'reading' | 'ok' | 'error'
  progress?: string
  text?: string
  error?: string
}

/** X-rays past papers against the session's units and posts the findings. */
function withXray(session: BuddySession, papers: Paper[]): BuddySession {
  const all = addPapers(papers)
  const report = analysePapers(all, session.units)
  if (report.totalQuestions === 0) {
    return {
      ...session,
      messages: [...session.messages, { id: uid(), from: 'buddy', text: "Hmm, I couldn't find actual questions in those. Are they question papers? Clear photos or PDFs work best." }],
    }
  }
  return {
    ...session,
    units: applyReport(session.units, report),
    pyqReport: report,
    messages: [
      ...session.messages,
      { id: uid(), from: 'buddy', text: '', card: 'pyq-report' },
      { id: uid(), from: 'buddy', text: insightsFor(report) },
    ],
  }
}

export function BuddyScreen({
  session,
  subject,
  onSession,
  onBack,
  onBuild,
  onSkip,
}: {
  session: BuddySession | null
  subject: string
  onSession: (s: BuddySession | null) => void
  onBack: () => void
  onBuild: () => void
  onSkip: () => void
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4">
      <ScreenHeader step={2} onBack={onBack} title="Tell me about it" />
      {session ? (
        <Chat session={session} subject={subject} onSession={onSession} onBuild={onBuild} linked={!!session.linked} />
      ) : (
        <Feed onSession={onSession} onSkip={onSkip} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Feed({ onSession, onSkip }: { onSession: (s: BuddySession) => void; onSkip: () => void }) {
  // Whatever was read last time comes back, even after closing the app.
  const [draft] = useState(loadDraft)
  const [uploads, setUploads] = useState<Upload[]>(() => draft?.uploads.map((u) => ({ ...u, status: 'ok' as const })) ?? [])
  const [paste, setPaste] = useState(draft?.paste ?? '')
  const [showPaste, setShowPaste] = useState(!!draft?.paste)
  const [error, setError] = useState('')
  const [draftSaved, setDraftSaved] = useState(true)

  useEffect(() => {
    const done = uploads.filter((u) => u.status === 'ok' && u.text).map((u) => ({ id: u.id, name: u.name, slot: u.slot, text: u.text! }))
    setDraftSaved(saveDraft({ paste, uploads: done }))
  }, [uploads, paste])

  const update = (id: string, patch: Partial<Upload>) => setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)))

  const add = (files: FileList | null, slot: Slot) => {
    if (!files) return
    setError('')
    for (const file of Array.from(files)) {
      const id = uid()
      setUploads((list) => [...list, { id, name: file.name, slot, status: 'reading' }])
      extractText(file, (progress) => update(id, { progress }))
        .then((text) => {
          if (!text.trim()) update(id, { status: 'error', error: "Couldn't find any text in this one." })
          else update(id, { status: 'ok', text, progress: undefined })
        })
        .catch((e: unknown) =>
          update(id, {
            status: 'error',
            error: e instanceof ExtractError ? e.message : "Couldn't read this file. Try a PDF or paste the text.",
          }),
        )
    }
  }

  const reading = uploads.some((u) => u.status === 'reading')
  const ready = uploads.filter((u) => u.status === 'ok')
  const syllabusText = [paste, ...ready.filter((u) => u.slot === 'syllabus').map((u) => u.text ?? '')].join('\n').trim()
  const materialText = ready.filter((u) => u.slot === 'material').map((u) => u.text ?? '').join('\n\n')
  const papers: Paper[] = ready.filter((u) => u.slot === 'pyq').map((u) => ({ name: u.name.replace(/\.[a-z]+$/i, ''), text: u.text ?? '' }))
  const canRead = !reading && (syllabusText.length > 0 || materialText.trim().length > 0)

  const analyse = () => {
    let parsed = syllabusText ? parseUnits(syllabusText) : []
    if (parsed.length === 0 && materialText) parsed = guessUnitsFromMaterial(materialText)
    if (parsed.length === 0) {
      setError("I couldn't spot any units in there. Paste the syllabus (one unit per line works great), or add topics yourself.")
      haptic([30, 40, 30])
      return
    }
    const units = buildUnits(parsed.slice(0, 30), materialText, () => uid())
    const sources = [
      ...(paste.trim() ? [{ name: 'Pasted syllabus', kind: 'syllabus' as const, words: wordCount(paste) }] : []),
      ...ready.map((u) => ({ name: u.name, kind: u.slot, words: wordCount(u.text ?? '') })),
    ]
    // The syllabus header usually names the college, code and subject; past papers too.
    const fromSyllabus = profileFromSyllabus(syllabusText)
    const fromPapers = papers.map((p) => profileFromSyllabus(p.text))
    const pick = <K extends keyof typeof fromSyllabus>(k: K) => fromSyllabus[k] ?? fromPapers.find((f) => f[k])?.[k]
    const found = { college: pick('college'), code: pick('code'), subjectName: pick('subjectName'), course: pick('course') }
    const profile = found.college || found.code ? { ...found, fromSyllabus: true } : undefined
    let session: BuddySession = { units, messages: [], step: 0, weakSkills: [], sources, profile }
    // Past papers first (the jaw-drop), then the usual intro and first question.
    if (papers.length) session = withXray(session, papers)
    session = { ...session, messages: [...session.messages, { id: uid(), from: 'buddy', text: introFor(session) }] }
    haptic(20)
    saveDraft({ paste: '', uploads: [] })
    onSession(session)
  }

  return (
    <div className="flex flex-1 flex-col gap-3 sm:gap-5">
      <Card tone="note" className="tape relative p-3 sm:p-4">
        <p className="font-hand text-xl sm:text-2xl">Hi, I'm your Study Buddy 👋</p>
        <p className="mt-1 font-bold leading-snug">Give me your syllabus and notes, then tell me where you're at. I'll build the plan around you.</p>
        <p className="mt-1 text-xs font-bold sm:mt-2 sm:text-sm">🔒 Free, and it all happens on this device. Your files never get uploaded anywhere.</p>
      </Card>

      <DropZone
        slot="syllabus"
        title="📋 Syllabus"
        hint="PDF, Word, text, or a photo of it"
        uploads={uploads.filter((u) => u.slot === 'syllabus')}
        onAdd={add}
        onRemove={(id) => setUploads((l) => l.filter((u) => u.id !== id))}
        extra={
          <div className="mt-1 sm:mt-3">
            {showPaste ? (
              <>
                <label htmlFor="buddy-paste" className="mb-1 block text-sm font-bold">
                  Or paste it here
                </label>
                <textarea
                  id="buddy-paste"
                  rows={5}
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder={'Unit 1: Kinematics (15 marks)\nUnit 2: Laws of Motion\nNewton\'s laws, Friction'}
                  className="w-full rounded-lg border-[3px] border-ink bg-card p-3 font-mono text-sm text-ink placeholder:text-muted"
                />
              </>
            ) : (
              <Button variant="ghost" onClick={() => setShowPaste(true)} className="!px-0 text-sm">
                Or paste the syllabus text instead
              </Button>
            )}
          </div>
        }
      />

      <DropZone
        slot="pyq"
        title="📝 Past papers"
        hint="Optional, but this is where the magic is. None? I'll hunt online later."
        uploads={uploads.filter((u) => u.slot === 'pyq')}
        onAdd={add}
        onRemove={(id) => setUploads((l) => l.filter((u) => u.id !== id))}
      />

      <DropZone
        slot="material"
        title="📚 Study material"
        hint="Notes, chapters, slides as PDF. Optional, makes me smarter."
        uploads={uploads.filter((u) => u.slot === 'material')}
        onAdd={add}
        onRemove={(id) => setUploads((l) => l.filter((u) => u.id !== id))}
      />

      {!draftSaved && (
        <p className="text-sm font-bold text-muted">
          These files are too big to keep if you close the app. Hit "Read it all" before you leave.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg border-[3px] border-ink bg-note-pink p-3 font-bold text-note-ink">
          {error}
        </p>
      )}

      <div className="flex-1" />
      <div className="sticky bottom-0 flex flex-col gap-2 bg-gradient-to-t from-paper from-70% to-transparent pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button variant="primary" big onClick={analyse} disabled={!canRead} className="w-full">
          {reading ? 'Reading your stuff…' : canRead ? 'Read it all 🔍' : 'Add your syllabus or notes'}
        </Button>
        <Button variant="ghost" onClick={onSkip} className="self-center text-sm">
          Skip, I'll type topics myself
        </Button>
      </div>
    </div>
  )
}

function DropZone({
  slot,
  title,
  hint,
  uploads,
  onAdd,
  onRemove,
  extra,
}: {
  slot: Slot
  title: string
  hint: string
  uploads: Upload[]
  onAdd: (files: FileList | null, slot: Slot) => void
  onRemove: (id: string) => void
  extra?: ReactNode
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <Card className="p-3 sm:p-4">
      {/* Phones: one compact row. Larger screens: a proper drop zone. */}
      <div className="flex items-center gap-3 sm:block">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg sm:text-xl">{title}</h2>
          <p className="text-xs text-muted sm:text-sm">{hint}</p>
        </div>
        <Button onClick={() => input.current?.click()} className="shrink-0 sm:hidden" aria-label={`Choose ${title.replace(/^\S+\s/, '')} files`}>
          📎 Add
        </Button>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          onAdd(e.dataTransfer.files, slot)
        }}
        className={`mt-3 rounded-xl border-[3px] border-dashed p-4 text-center transition-colors max-sm:contents ${over ? 'border-stamp bg-note/30' : 'border-ink/50'}`}
      >
        <input
          ref={input}
          id={`file-${slot}`}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => {
            onAdd(e.target.files, slot)
            e.target.value = ''
          }}
        />
        <Button onClick={() => input.current?.click()} aria-describedby={`file-${slot}-hint`} className="max-sm:hidden">
          📎 Choose files
        </Button>
        <p id={`file-${slot}-hint`} className="mt-2 hidden text-sm text-muted sm:block">
          or drop them here
        </p>
      </div>
      {uploads.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2 sm:mt-3" aria-live="polite">
          {uploads.map((u) => (
            <li key={u.id} className="flex items-center gap-2 rounded-lg border-2 border-ink bg-paper p-2 pl-3">
              <span aria-hidden className="text-lg">
                {u.status === 'reading' ? '⏳' : u.status === 'ok' ? '✅' : '⚠️'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{u.name}</p>
                <p className={`text-xs ${u.status === 'error' ? 'font-bold text-stamp' : 'text-muted'}`}>
                  {u.status === 'reading' && (u.progress ?? 'Reading…')}
                  {u.status === 'ok' && `${wordCount(u.text ?? '').toLocaleString()} words`}
                  {u.status === 'error' && u.error}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(u.id)}
                aria-label={`Remove ${u.name}`}
                className="grid size-11 shrink-0 place-items-center rounded-lg text-xl font-bold"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {extra}
    </Card>
  )
}

// ---------------------------------------------------------------------------

function Chat({
  session,
  subject,
  onSession,
  onBuild,
  linked,
}: {
  session: BuddySession
  subject: string
  onSession: (s: BuddySession | null) => void
  onBuild: () => void
  linked: boolean
}) {
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Hunts finish asynchronously; they must build on the latest chat, not the one they started from.
  const latest = useRef(session)
  latest.current = session

  const huntDone = (messageId: string, result: HuntResult) => {
    const s = latest.current
    const status = result.papers.length ? 'found' : result.reachable ? 'none' : 'offline'
    const hunt: BuddyMessage['hunt'] = {
      status,
      college: result.college,
      papers: result.papers.map((p) => ({ name: p.name, year: p.year ?? null, url: p.url })),
    }
    const updated: BuddySession = {
      ...s,
      profile: { ...s.profile, college: result.college ?? s.profile?.college },
      messages: s.messages.map((m) => (m.id === messageId ? { ...m, hunt } : m)),
    }
    if (result.papers.length) haptic([30, 40, 30, 40, 80])
    onSession(result.papers.length ? withXray(updated, result.papers) : updated)
  }

  const uploaded = (papers: Paper[]) => {
    haptic(20)
    onSession(withXray(latest.current, papers))
  }

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'end' })
  }, [session.messages.length, typing])

  const send = (text: string) => {
    const message = text.trim()
    if (!message || typing) return
    setDraft('')
    const withYou: BuddySession = { ...session, messages: [...session.messages, { id: uid(), from: 'you', text: message }] }
    onSession(withYou)
    setTyping(true)
    const turn = understand(withYou, message)
    const reply = replyFor(withYou, turn, message)
    window.setTimeout(
      () => {
        setTyping(false)
        if (turn.understood.length) haptic(15)
        const replies: BuddyMessage[] = [{ id: uid(), from: 'buddy', text: reply }]
        if (turn.hunt) replies.push({ id: uid(), from: 'buddy', text: '', card: 'pyq-hunt' })
        onSession({ ...turn.session, messages: [...withYou.messages, ...replies] })
        inputRef.current?.focus()
      },
      prefersReducedMotion() ? 150 : 650,
    )
  }

  const live = session.units.filter((u) => !u.skipped)

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm font-bold">
        <span className="rounded-full border-2 border-ink bg-note px-3 py-1 text-note-ink">{live.length} units</span>
        <span className="rounded-full border-2 border-ink bg-card px-3 py-1">
          {session.sources.length} source{session.sources.length === 1 ? '' : 's'}
        </span>
        <Button
          variant="ghost"
          className="ml-auto text-sm"
          onClick={() => {
            if (window.confirm('Start over with different files? This clears the chat. Your plan stays until you build a new one.')) onSession(null)
          }}
        >
          Change files
        </Button>
      </div>

      <div role="log" aria-label="Chat with Study Buddy" aria-live="polite" className="flex flex-1 flex-col gap-3 pb-4">
        {session.messages.map((m) => (
          <div key={m.id} className={`animate-rise flex ${m.from === 'you' ? 'justify-end' : 'justify-start'}`}>
            {m.card === 'pyq-hunt' ? (
              <PyqHuntCard
                message={m}
                profile={{ subject: session.profile?.subjectName ?? subject, college: session.profile?.college, code: session.profile?.code }}
                onDone={(result) => huntDone(m.id, result)}
                onUpload={uploaded}
              />
            ) : m.card === 'pyq-report' ? (
              session.pyqReport && <PyqReportCard report={session.pyqReport} />
            ) : (
            <div
              className={`max-w-[88%] rounded-2xl border-[3px] border-ink p-3 whitespace-pre-line hard-shadow-sm ${
                m.from === 'you' ? 'rounded-br-sm bg-ink text-paper' : 'rounded-bl-sm bg-note text-note-ink'
              }`}
            >
              <span className="sr-only">{m.from === 'you' ? 'You said: ' : 'Buddy said: '}</span>
              {m.text}
            </div>
            )}
          </div>
        ))}
        {typing && (
          <div className="flex justify-start" aria-label="Buddy is typing">
            <div className="animate-wobble rounded-2xl rounded-bl-sm border-[3px] border-ink bg-note px-4 py-2 font-bold text-note-ink">…</div>
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="sticky bottom-0 -mx-4 border-t-[3px] border-ink bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1" aria-label="Quick replies">
          {chipsFor(session).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => send(c)}
              disabled={typing}
              className="min-h-11 shrink-0 rounded-full border-2 border-ink bg-card px-3 text-sm font-bold whitespace-nowrap disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            send(draft)
          }}
        >
          <label htmlFor="buddy-input" className="sr-only">
            Message Study Buddy
          </label>
          <input
            ref={inputRef}
            id="buddy-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder='e.g. "Unit 3 is my weak spot"'
            autoComplete="off"
            className="min-h-12 min-w-0 flex-1 rounded-lg border-[3px] border-ink bg-card px-3 text-base text-ink placeholder:text-muted"
          />
          <Button type="submit" disabled={!draft.trim() || typing} aria-label="Send">
            ➤
          </Button>
        </form>
        <Button variant="primary" onClick={onBuild} className="mt-2 min-h-12 w-full sm:mt-3 sm:min-h-14 sm:text-lg">
          {linked ? 'Back to my plan →' : 'Build my plan from this →'}
        </Button>
        <p className="mt-2 text-center text-xs font-bold text-muted max-sm:hidden">
          {linked ? '✓ Chat saved. Changes go straight into your plan.' : '✓ Chat saved. Pick up where you left off any time.'}
        </p>
      </div>
    </div>
  )
}
