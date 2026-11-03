import { useEffect, useRef, useState } from 'react'
import type { BuddyMessage } from '../lib/buddy'
import { STYLE_LABEL, searchLinks, type HuntProfile, type Paper, type PyqReport } from '../lib/pyq'
import { huntPapers, type HuntResult } from '../lib/hunt'
import { ACCEPT, ExtractError, extractText } from '../lib/extract'
import { Button } from './ui'

/** The live past-paper hunt. Runs once; afterwards it shows what it found. */
export function PyqHuntCard({
  message,
  profile,
  onDone,
  onUpload,
}: {
  message: BuddyMessage
  profile: HuntProfile
  onDone: (result: HuntResult) => void
  onUpload: (papers: Paper[]) => void
}) {
  const [progress, setProgress] = useState('Warming up…')
  const started = useRef(false)

  useEffect(() => {
    if (message.hunt || started.current) return
    started.current = true
    huntPapers(profile, setProgress).then(onDone, () => onDone({ papers: [], reachable: false, college: profile.college }))
    // A hunt belongs to one message; it never restarts.
  }, [])

  const hunt = message.hunt
  const links = searchLinks({ ...profile, college: hunt?.college ?? profile.college })

  return (
    <div className="w-full max-w-[92%] rounded-2xl rounded-bl-sm border-[3px] border-ink bg-card p-4 text-ink hard-shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-display text-lg">🕵️ Past-paper hunt</p>
        {(hunt?.college ?? profile.college) && (
          <span className="rounded-full border-2 border-ink bg-note px-2 py-0.5 text-xs font-bold text-note-ink">{hunt?.college ?? profile.college}</span>
        )}
        {profile.code && <span className="rounded-full border-2 border-ink px-2 py-0.5 text-xs font-bold">{profile.code}</span>}
      </div>

      {!hunt ? (
        <p className="mt-2 flex items-center gap-2 font-bold" role="status">
          <span className="animate-wobble inline-block" aria-hidden>
            🔎
          </span>
          {progress}
        </p>
      ) : hunt.status === 'found' ? (
        <>
          <p className="mt-2 font-bold">
            Found {hunt.papers.length} real question paper{hunt.papers.length === 1 ? '' : 's'} online:
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {hunt.papers.map((p) => (
              <li key={p.url ?? p.name}>
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-bold underline decoration-2 underline-offset-2">
                    {p.name}
                  </a>
                ) : (
                  p.name
                )}
                {p.year && <span className="text-muted"> · {p.year}</span>}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 font-bold">
          {hunt.status === 'offline'
            ? "Couldn't reach the paper archive right now (no internet?). The searches below open in your browser."
            : "The open archive doesn't have papers for this one yet. Seniors usually have them though. Try these:"}
        </p>
      )}

      {hunt && (
        <>
          <p className="mt-4 text-xs font-bold tracking-widest text-muted uppercase">Dig deeper (opens a new tab)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {links.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-full border-2 border-ink bg-paper px-3 text-sm font-bold"
              >
                {l.label}
              </a>
            ))}
          </div>
          <UploadPapers onUpload={onUpload} />
        </>
      )}
      <p className="mt-3 text-xs text-muted">Only your college, subject and code went to archive.org and Wikipedia. Your files stay on this device.</p>
    </div>
  )
}

function UploadPapers({ onUpload }: { onUpload: (papers: Paper[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const read = async (files: FileList | null) => {
    if (!files?.length) return
    const papers: Paper[] = []
    for (const file of Array.from(files)) {
      try {
        setStatus(`Reading ${file.name}…`)
        const text = await extractText(file, (m) => setStatus(`${file.name}: ${m}`))
        if (text.trim()) papers.push({ name: file.name.replace(/\.[a-z]+$/i, ''), text })
      } catch (e) {
        setStatus(e instanceof ExtractError ? `${file.name}: ${e.message}` : `Couldn't read ${file.name}.`)
      }
    }
    if (papers.length) {
      setStatus('')
      onUpload(papers)
    }
  }
  return (
    <div className="mt-3">
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        aria-label="Upload past papers"
        onChange={(e) => {
          void read(e.target.files)
          e.target.value = ''
        }}
      />
      <Button variant="primary" onClick={() => input.current?.click()} className="w-full">
        📎 Found papers? Drop them here and I'll X-ray them
      </Button>
      {status && (
        <p className="mt-1 text-sm font-bold" role="status">
          {status}
        </p>
      )}
    </div>
  )
}

/** What the examiner keeps asking, unit by unit. */
export function PyqReportCard({ report }: { report: PyqReport }) {
  const n = report.papers.length
  const years = [...new Set(report.papers.map((p) => p.year).filter((y): y is number => !!y))].sort((a, b) => a - b)
  // One paper: "1/1" says nothing, so compare question counts instead.
  const single = n === 1
  const units = [...report.units].sort((a, b) => (single ? 0 : b.papers - a.papers) || b.questions - a.questions)
  const maxQ = Math.max(1, ...units.map((u) => u.questions))
  return (
    <figure
      className="w-full max-w-[92%] overflow-hidden rounded-2xl rounded-bl-sm border-[3px] border-ink bg-card text-ink hard-shadow-sm"
      aria-label={`Past paper X-ray of ${n} papers`}
    >
      <div className="hazard h-3" aria-hidden />
      <div className="p-4">
        <p className="font-display text-lg">🩻 Past-paper X-ray</p>
        <p className="text-sm text-muted">
          {n} paper{n === 1 ? '' : 's'}
          {years.length ? ` · ${years[0]}${years.length > 1 ? `–${years[years.length - 1]}` : ''}` : ''} · {report.totalQuestions} questions
        </p>

        <p className="mt-3 text-xs font-bold tracking-widest text-muted uppercase">
          {single ? 'Questions per unit' : 'How often each unit shows up'}
        </p>
        <ul className="mt-2 flex flex-col gap-2">
          {units.map((u) => (
            <li key={u.unitId}>
              <div className="flex justify-between gap-2 text-sm font-bold">
                <span className="truncate">{u.name}</span>
                <span className="shrink-0">{single ? `${u.questions} Q` : `${u.papers}/${n}`}</span>
              </div>
              <div className="mt-0.5 h-2.5 overflow-hidden rounded-full border-2 border-ink bg-paper" aria-hidden>
                {(() => {
                  const share = single ? u.questions / maxQ : u.papers / n
                  return (
                    <div
                      className={`h-full ${share >= 0.8 ? 'bg-stamp' : share >= 0.5 ? 'bg-note' : 'bg-note-green'}`}
                      style={{ width: `${share * 100}%` }}
                    />
                  )
                })()}
              </div>
            </li>
          ))}
        </ul>

        {report.repeats.length > 0 && (
          <>
            <p className="mt-4 text-xs font-bold tracking-widest text-muted uppercase">Repeat offenders</p>
            <ol className="mt-1 flex flex-col gap-1 text-sm">
              {report.repeats.slice(0, 5).map((r) => (
                <li key={r.text} className="flex gap-2">
                  <span className="shrink-0 rounded bg-stamp-btn px-1.5 font-display text-xs leading-5 text-white">×{r.papers}</span>
                  <span>{r.text}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        {report.styles.length > 0 && (
          <>
            <p className="mt-4 text-xs font-bold tracking-widest text-muted uppercase">What they ask you to do</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {report.styles.slice(0, 5).map((s) => (
                <span key={s.style} className="rounded-full border-2 border-ink px-2 py-0.5 text-xs font-bold">
                  {STYLE_LABEL[s.style]} {s.share}%
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </figure>
  )
}
