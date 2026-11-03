import type { ReactNode } from 'react'
import { cloudConfigured } from '../lib/cloud'
import { Button, Card, HazardTape, Stamp } from './ui'

export function Landing({
  onStart,
  onSample,
  resumeSubject,
  onResume,
  account,
  signedIn,
  onTrophies,
  trophies,
}: {
  onStart: () => void
  onSample: () => void
  resumeSubject?: string
  onResume: () => void
  account: ReactNode
  signedIn: boolean
  onTrophies: () => void
  trophies: number
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <HazardTape>⚠ EXAM WARNING ⚠</HazardTape>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-8 pb-6 sm:pt-14">
        <div className="flex items-center justify-between gap-3">
          <div className="tape relative w-fit shrink-0 -rotate-2 rounded-md border-[3px] border-ink bg-note px-3 py-1.5 text-note-ink hard-shadow sm:px-4 sm:py-2">
            <span className="font-hand text-lg whitespace-nowrap sm:text-xl">Last Minute Planner</span>
          </div>
          {account}
        </div>

        <h1 className="mt-8 font-display text-[2.6rem] leading-[1.02] tracking-tight sm:text-6xl">
          What exam are we <span className="relative inline-block text-stamp">surviving?</span>
        </h1>
        <p className="mt-4 max-w-md text-lg text-muted">
          Tell me what's on the paper. I'll tell you exactly what to study <strong className="text-ink">right now</strong> to
          save the most marks. No signup. No lecture.
        </p>

        <div className="mt-6 flex flex-wrap gap-2" aria-label="Promises">
          <Stamp className="-rotate-3">60 sec setup</Stamp>
          <Stamp className="rotate-2" tone="ink">
            Sleep protected
          </Stamp>
          <Stamp className="-rotate-1" tone="ok">
            Free study buddy
          </Stamp>
        </div>

        <Card tone="blue" className="mt-8 rotate-1 p-4">
          <p className="font-hand text-lg leading-snug">
            "You have 6 hours and 14 units. Bold strategy." <br />
            <span className="font-body text-sm font-bold">— this app, lovingly</span>
          </p>
        </Card>

        <div className="flex-1" />

        {/* Primary actions sit at the bottom, in thumb reach. */}
        <div className="sticky bottom-0 mt-8 flex flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
          {resumeSubject && (
            <Button onClick={onResume} className="w-full">
              Continue: {resumeSubject} plan →
            </Button>
          )}
          <Button variant="primary" big onClick={onStart} className="w-full text-xl">
            Save My GPA
          </Button>
          <Button variant="ghost" onClick={onSample} className="w-full">
            Just looking? Try sample exam
          </Button>
          {(trophies > 0 || ((cloudConfigured || import.meta.env.DEV) && !signedIn)) && (
            <Button variant="ghost" onClick={onTrophies} className="w-full text-sm">
              {trophies > 0 ? `🏆 Trophy shelf (${trophies})` : '☁️ Sign in to save badges across devices'}
            </Button>
          )}
        </div>
      </main>
    </div>
  )
}
