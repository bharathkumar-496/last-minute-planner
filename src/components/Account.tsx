import { useState } from 'react'
import { BADGES, type BadgeId } from '../lib/fun'
import { cloudConfigured, type CloudUser } from '../lib/cloud'
import type { ExamRecord } from '../lib/storage'
import { Button } from './ui'
import { Sheet } from './Sheet'

export type SyncStatus = 'off' | 'syncing' | 'saved' | 'offline' | 'error'

const SYNC_TEXT: Record<SyncStatus, string> = {
  off: 'Not signed in',
  syncing: 'Saving…',
  saved: 'Saved to your Google account',
  offline: "Offline. It'll save when you're back online.",
  error: "Couldn't save just now. Retrying on your next change.",
}
const SYNC_ICON: Record<SyncStatus, string> = { off: '', syncing: '⏳', saved: '☁️', offline: '📴', error: '⚠️' }

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z" />
      <path fill="#FBBC05" d="M10.6 28.5c-.5-1.4-.8-2.9-.8-4.5s.3-3.1.8-4.5l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.2 0-11.5-4.2-13.4-9.9l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
    </svg>
  )
}

export function SignInButton({ onSignIn, busy, wide = false }: { onSignIn: () => void; busy: boolean; wide?: boolean }) {
  return (
    <Button onClick={onSignIn} disabled={busy} className={`!bg-white !text-[#1f1f1f] ${wide ? 'w-full' : ''}`}>
      <GoogleG />
      {busy ? 'Signing in…' : 'Sign in with Google'}
    </Button>
  )
}

function Avatar({ user, size = 'size-9' }: { user: CloudUser; size?: string }) {
  const [broken, setBroken] = useState(false)
  if (user.photo && !broken) {
    return <img src={user.photo} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={`${size} rounded-full border-2 border-ink object-cover`} />
  }
  return (
    <span className={`${size} grid place-items-center rounded-full border-2 border-ink bg-note font-display text-sm text-note-ink`} aria-hidden>
      {user.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

/** Top-right account control. Renders nothing when cloud saving isn't set up. */
export function AccountChip({
  user,
  sync,
  busy,
  onSignIn,
  onOpen,
}: {
  user: CloudUser | null
  sync: SyncStatus
  busy: boolean
  onSignIn: () => void
  onOpen: () => void
}) {
  // Live builds without Firebase keys hide sign-in; while developing it stays
  // visible and explains what's missing.
  if (!cloudConfigured && !import.meta.env.DEV) return null
  if (!user) {
    return (
      <button
        type="button"
        onClick={onSignIn}
        disabled={busy}
        className="press inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border-[3px] border-ink bg-white px-3 text-sm font-bold whitespace-nowrap text-[#1f1f1f] hard-shadow-sm disabled:opacity-60"
      >
        <GoogleG />
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Account: ${user.name}. ${SYNC_TEXT[sync]}. Open trophy shelf.`}
      className="press relative inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border-[3px] border-ink bg-card py-0.5 pr-3 pl-0.5 text-sm font-bold whitespace-nowrap hard-shadow-sm"
    >
      <Avatar user={user} />
      <span className="max-w-24 truncate">{user.name.split(' ')[0]}</span>
      <span aria-hidden>{SYNC_ICON[sync]}</span>
    </button>
  )
}

export function AccountSheet({
  user,
  sync,
  badges,
  history,
  current,
  busy,
  error,
  onSignIn,
  onSignOut,
  onClose,
}: {
  user: CloudUser | null
  sync: SyncStatus
  badges: BadgeId[]
  history: ExamRecord[]
  current: { subject: string; done: number; total: number } | null
  busy: boolean
  error: string
  onSignIn: () => void
  onSignOut: (removeFromDevice: boolean) => void
  onClose: () => void
}) {
  const survived = history.length
  return (
    <Sheet title={user ? `Hey ${user.name.split(' ')[0]} 👋` : 'Save your progress'} onClose={onClose}>
      {user ? (
        <div className="flex items-center gap-3">
          <Avatar user={user} size="size-12" />
          <div className="min-w-0">
            <p className="truncate font-bold">{user.email}</p>
            <p className={`text-sm ${sync === 'error' || sync === 'offline' ? 'font-bold text-stamp' : 'text-muted'}`} role="status">
              {SYNC_ICON[sync]} {SYNC_TEXT[sync]}
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="mb-3">Sign in to keep your badges, plans and Study Buddy chats safe, and pick up on any phone or laptop.</p>
          {cloudConfigured ? (
            <SignInButton onSignIn={onSignIn} busy={busy} wide />
          ) : (
            <div className="rounded-xl border-[3px] border-dashed border-ink p-3 text-sm" role="note">
              <p className="font-display text-base">Almost there: Google sign-in isn't switched on yet</p>
              <p className="mt-1">
                It needs a free Firebase project (about 10 minutes, no card). Follow <strong>SETUP-GOOGLE-LOGIN.md</strong> in the
                project folder, paste the 4 keys into <code className="rounded bg-paper px-1">.env.local</code>, and restart{' '}
                <code className="rounded bg-paper px-1">npm run dev</code>.
              </p>
              <p className="mt-2 text-muted">You're seeing this because you're running the app locally. Students never see this note.</p>
            </div>
          )}
          {error && (
            <p role="alert" className="mt-2 font-bold text-stamp">
              {error}
            </p>
          )}
        </>
      )}

      <section aria-labelledby="trophy-heading" className="mt-6">
        <h3 id="trophy-heading" className="font-display text-xl">
          🏆 Trophy shelf
        </h3>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Stat label="Badges" value={badges.length} />
          <Stat label="Exams survived" value={survived} />
          <Stat label="Topics now" value={current ? `${current.done}/${current.total}` : '–'} />
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {(Object.keys(BADGES) as BadgeId[]).map((id) => {
            const earned = badges.includes(id)
            return (
              <li
                key={id}
                className={`rounded-xl border-[3px] p-2 text-center ${earned ? 'border-ink bg-note text-note-ink hard-shadow-sm' : 'border-dashed border-muted text-muted'}`}
              >
                <p className={`text-2xl ${earned ? '' : 'opacity-40 grayscale'}`} aria-hidden>
                  {BADGES[id].emoji}
                </p>
                <p className="text-xs leading-tight font-bold">{BADGES[id].name}</p>
                <p className="sr-only">{earned ? 'Earned.' : 'Locked.'}</p>
              </li>
            )
          })}
        </ul>

        <h4 className="mt-4 text-xs font-bold tracking-widest text-muted uppercase">Past exams</h4>
        {history.length === 0 ? (
          <p className="mt-1 text-sm text-muted">None yet. When you start a new exam, this one gets filed here with its stats.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-2">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 rounded-lg border-2 border-ink p-2 pl-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-bold">{h.subject}</p>
                  <p className="text-muted">
                    {new Date(h.endedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · {h.done}/{h.total} topics
                  </p>
                </div>
                <span className="shrink-0 font-display">{h.cookedPct}% 🔥</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {user && (
        <div className="mt-6 grid gap-2">
          <Button onClick={() => onSignOut(false)}>Sign out</Button>
          <Button variant="ghost" className="text-sm" onClick={() => onSignOut(true)}>
            Sign out and remove my data from this device
          </Button>
        </div>
      )}
    </Sheet>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border-2 border-ink bg-paper p-2">
      <p className="font-display text-2xl">{value}</p>
      <p className="text-xs font-bold">{label}</p>
    </div>
  )
}
