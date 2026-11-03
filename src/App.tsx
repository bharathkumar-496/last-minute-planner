import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildPlan, formatHours, parseExamDate, remainingMin, type Topic } from './lib/planner'
import { BADGES, LOADING_LINES, doneLine, earnedBadges } from './lib/fun'
import { checkIn, mergeTopics, sessionFromTopics, syncFromTopics, type BuddySession } from './lib/buddy'
import { formatClock, pause, remainingMs, resume, startBreak, startFocus, tick, type Timer } from './lib/pomodoro'
import { clearState, freshState, loadState, localUpdatedAt, saveState, storageAvailable, type AppState, type Screen } from './lib/storage'
import { SignInError, cloudConfigured, loadFromCloud, saveToCloud, signInWithGoogle, signOutOfGoogle, watchUser, type CloudUser } from './lib/cloud'
import { mergeStates } from './lib/merge'
import { sampleExam } from './lib/sample'
import { askNotificationPermission, chime, haptic, notify, prefersReducedMotion, uid } from './lib/device'
import { Landing } from './components/Landing'
import { SetupScreen } from './components/SetupScreen'
import { TopicsScreen } from './components/TopicsScreen'
import { PlanScreen } from './components/PlanScreen'
import { WastedSheet } from './components/WastedSheet'
import { ReportSheet, reportFrom } from './components/ReportSheet'
import { Loading } from './components/Loading'
import { BuddyScreen } from './components/BuddyScreen'
import { AccountChip, AccountSheet, type SyncStatus } from './components/Account'

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

// Topics and the Study Buddy chat are two views of the same plan: whichever
// changes, the other follows, and both are saved.
const withTopics = (s: AppState, topics: Topic[]): AppState => ({
  ...s,
  topics,
  buddy: s.buddy?.linked ? syncFromTopics(s.buddy, topics) : s.buddy,
})
const withBuddy = (s: AppState, buddy: BuddySession | null): AppState =>
  buddy?.linked ? { ...s, buddy, topics: mergeTopics(s.topics, buddy, Date.now()) } : { ...s, buddy }

const APP_TITLE = 'Last Minute Planner'

export default function App() {
  const [state, setState] = useState<AppState>(loadState)
  const [loading, setLoading] = useState(false)
  const [sheet, setSheet] = useState<'wasted' | 'report' | 'account' | null>(null)
  const [undo, setUndo] = useState<{ topics: Topic[]; message: string } | null>(null)
  const [stampKey, setStampKey] = useState(0)
  const [replanKey, setReplanKey] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const [storageOk] = useState(storageAvailable)
  const [user, setUser] = useState<CloudUser | null>(null)
  const [sync, setSync] = useState<SyncStatus>('off')
  const [signingIn, setSigningIn] = useState(false)
  const [signInError, setSignInError] = useState('')
  const [toast, setToast] = useState('')
  const stateRef = useRef(state)
  stateRef.current = state
  /** The account whose data has been merged in; saving only starts after that. */
  const syncedFor = useRef<string | null>(null)
  const undoTimer = useRef<number | undefined>(undefined)

  const now = useNow(1000)
  const minuteNow = Math.floor(now / 60000) * 60000

  useEffect(() => {
    saveState(state)
  }, [state])

  const showToast = useCallback((text: string) => {
    setToast(text)
    window.setTimeout(() => setToast((t) => (t === text ? '' : t)), 4500)
  }, [])

  // --- Google account: merge on sign-in, then keep the cloud copy up to date.
  useEffect(
    () =>
      watchUser(async (u) => {
        setUser(u)
        if (!u) {
          syncedFor.current = null
          setSync('off')
          return
        }
        if (syncedFor.current === u.uid) return
        setSync('syncing')
        try {
          const cloud = await loadFromCloud(u.uid)
          const merged = mergeStates({ state: stateRef.current, updatedAt: localUpdatedAt() }, cloud)
          if (merged.source !== 'same') {
            saveState(merged.state, merged.updatedAt)
            setState(merged.state)
          }
          await saveToCloud(u.uid, merged.state, merged.updatedAt)
          syncedFor.current = u.uid
          setSync('saved')
          const first = u.name.split(' ')[0]
          showToast(
            merged.source === 'cloud'
              ? `Welcome back, ${first}! Loaded your saved plan and badges. ☁️`
              : cloud
                ? `Hey ${first}, everything's synced. ☁️`
                : `Signed in, ${first}. Your progress is now saved to your Google account. ☁️`,
          )
        } catch {
          setSync(navigator.onLine ? 'error' : 'offline')
        }
      }),
    [showToast],
  )

  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const again = () => setRetry((n) => n + 1)
    window.addEventListener('online', again)
    return () => window.removeEventListener('online', again)
  }, [])

  useEffect(() => {
    if (!user || syncedFor.current !== user.uid) return
    setSync('syncing')
    const id = window.setTimeout(() => {
      saveToCloud(user.uid, stateRef.current, localUpdatedAt()).then(
        () => setSync('saved'),
        () => setSync(navigator.onLine ? 'error' : 'offline'),
      )
    }, 1500)
    return () => window.clearTimeout(id)
  }, [state, user, retry])

  const signIn = async () => {
    if (!cloudConfigured) {
      setSheet('account')
      return
    }
    setSignInError('')
    setSigningIn(true)
    try {
      await signInWithGoogle()
    } catch (e) {
      const message = e instanceof SignInError ? e.message : "Sign-in didn't work. Try again?"
      setSignInError(message)
      showToast(message)
    } finally {
      setSigningIn(false)
    }
  }

  const signOut = async (removeFromDevice: boolean) => {
    await signOutOfGoogle().catch(() => {})
    setSheet(null)
    if (removeFromDevice) {
      clearState()
      setState(freshState())
      setUndo(null)
      showToast('Signed out and wiped from this device. Your account still has everything.')
    } else showToast('Signed out. This device keeps a copy; your account has the rest.')
  }

  // Wasted time comes out of today's study time.
  const todayWasted = state.wasteLogs.filter((w) => sameDay(w.at, minuteNow)).reduce((a, w) => a + w.minutes, 0)

  const plan = useMemo(
    () => buildPlan({ setup: state.setup, topics: state.topics, wastedMin: todayWasted, now: minuteNow }),
    [state.setup, state.topics, todayWasted, minuteNow],
  )
  const examMs = parseExamDate(state.setup.examAt)?.getTime() ?? 0

  // Exam-eve theme for the final 12 hours.
  const eve = plan.eve && (state.screen === 'plan' || state.screen === 'topics')
  useEffect(() => {
    document.documentElement.dataset.eve = String(eve)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', eve ? '#121318' : '#f4efe3')
  }, [eve])

  // Badges and the peak Panic Meter reading.
  useEffect(() => {
    if (state.screen !== 'plan' || !['ok', 'all-done', 'no-time'].includes(plan.status)) return
    const peakCooked = Math.max(state.peakCooked, plan.cookedPct)
    const earned = earnedBadges({
      peakCooked,
      cookedPct: plan.cookedPct,
      examAt: examMs,
      completions: state.topics.filter((t) => t.doneAt).map((t) => t.doneAt!),
      wasteLogs: state.wasteLogs.map((w) => w.at),
    })
    const fresh = earned.filter((b) => !state.badges.includes(b))
    if (peakCooked === state.peakCooked && fresh.length === 0) return
    setState((s) => ({ ...s, peakCooked, badges: [...s.badges, ...fresh] }))
    if (fresh.length) {
      haptic([30, 50, 30, 50, 60])
      setAnnouncement(`Badge unlocked: ${fresh.map((b) => BADGES[b].name).join(', ')}`)
    }
  }, [plan, state.screen, state.peakCooked, state.badges, state.topics, state.wasteLogs, examMs])

  const go = useCallback((screen: Screen) => {
    setState((s) => ({ ...s, screen }))
    window.scrollTo({ top: 0 })
  }, [])

  const showPlan = useCallback(() => {
    setLoading(true)
    window.setTimeout(
      () => {
        setLoading(false)
        go('plan')
      },
      prefersReducedMotion() ? 500 : 1600,
    )
  }, [go])

  const loadSample = () => {
    const sample = sampleExam()
    setState((s) => ({ ...freshState(), setup: sample.setup, topics: sample.topics, screen: s.screen }))
    showPlan()
  }

  const setTopicsWithUndo = (topics: Topic[], message: string) => {
    setUndo({ topics: state.topics, message })
    setState((s) => withTopics(s, topics))
    setAnnouncement(message)
    window.clearTimeout(undoTimer.current)
    undoTimer.current = window.setTimeout(() => setUndo(null), 8000)
  }

  /** Completes the next block, or the block a Pomodoro was timing. */
  const completeBlock = (block: { topicId: string; minutes: number } | null = plan.next) => {
    if (!block) return
    const topic = state.topics.find((t) => t.id === block.topicId)
    if (!topic || topic.done) return
    const studiedMin = (topic.studiedMin ?? 0) + block.minutes
    const finished = remainingMin({ ...topic, studiedMin }) <= 0
    const updated: Topic = finished ? { ...topic, studiedMin, done: true, doneAt: Date.now() } : { ...topic, studiedMin }
    haptic(finished ? [40, 30, 80] : 25)
    setStampKey((k) => k + 1)
    setTopicsWithUndo(
      state.topics.map((t) => (t.id === topic.id ? updated : t)),
      finished ? doneLine(topic.name, Date.now() / 1000) : `Block down. ${topic.name} is sweating. Take your 5.`,
    )
  }

  const completeTopic = (id: string) => {
    const topic = state.topics.find((t) => t.id === id)
    if (!topic) return
    haptic([40, 30, 80])
    setStampKey((k) => k + 1)
    setTopicsWithUndo(
      state.topics.map((t) => (t.id === id ? { ...t, done: true, doneAt: Date.now() } : t)),
      doneLine(topic.name, Date.now() / 1000),
    )
  }

  const restoreTopic = (id: string) => {
    const topic = state.topics.find((t) => t.id === id)
    if (!topic) return
    setTopicsWithUndo(
      state.topics.map((t) => (t.id === id ? { ...t, done: false, doneAt: undefined } : t)),
      `${topic.name} is back on the list.`,
    )
  }

  const doUndo = () => {
    if (!undo) return
    setState((s) => withTopics(s, undo.topics))
    setUndo(null)
    setAnnouncement('Undone.')
    haptic(10)
  }

  const logWaste = (reason: string, minutes: number): string => {
    const after = buildPlan({
      setup: state.setup,
      topics: state.topics,
      wastedMin: todayWasted + minutes,
      now: minuteNow,
    })
    setState((s) => ({ ...s, wasteLogs: [...s.wasteLogs, { id: uid(), reason, minutes, at: Date.now() }] }))
    setReplanKey((k) => k + 1)
    const lostBlocks = plan.blocks.length - after.blocks.length
    const released = (p: typeof plan) => p.topics.filter((t) => t.tier === 'vibes' || t.tier === 'let-go').length
    const newlyReleased = released(after) - released(plan)
    const bits = [`−${formatHours(minutes)} from your plan.`]
    if (lostBlocks > 0) bits.push(`${lostBlocks} block${lostBlocks === 1 ? '' : 's'} cut.`)
    if (newlyReleased > 0) bits.push(`${newlyReleased} topic${newlyReleased === 1 ? '' : 's'} moved to Vibes Only / Let It Go.`)
    if (lostBlocks <= 0) bits.push('Good news: you had slack. Nothing important moved.')
    const summary = bits.join(' ')
    setAnnouncement(`Plan rebuilt. ${summary}`)
    return summary
  }

  /** A new exam. The finished one goes on the trophy shelf; badges stay forever. */
  const reset = () => {
    if (!window.confirm('Plan a new exam? This one gets filed on your trophy shelf. Your badges stay.')) return
    setState((s) => {
      const record = s.topics.length
        ? [
            {
              id: uid(),
              subject: s.setup.subject || 'Untitled exam',
              examAt: s.setup.examAt,
              endedAt: Date.now(),
              done: s.topics.filter((t) => t.done).length,
              total: s.topics.length,
              cookedPct: plan.cookedPct,
              badges: s.badges,
            },
          ]
        : []
      return { ...freshState(), badges: s.badges, peakCooked: 0, history: [...record, ...s.history] }
    })
    setUndo(null)
  }

  const account = (
    <AccountChip user={user} sync={sync} busy={signingIn} onSignIn={signIn} onOpen={() => setSheet('account')} />
  )

  const buildFromBuddy = () => {
    setState((s) => {
      if (!s.buddy) return s
      // First build: carry progress over by name, then link chat and plan for good.
      const topics = mergeTopics(s.topics, { ...s.buddy, linked: false }, Date.now())
      return { ...s, topics, buddy: syncFromTopics({ ...s.buddy, linked: true }, topics) }
    })
    haptic(20)
    go('topics')
  }

  const openBuddy = () => {
    setState((s) => {
      const buddy = s.buddy?.linked ? checkIn(s.buddy, uid) : s.topics.length ? sessionFromTopics(s.topics, uid) : s.buddy
      return { ...s, buddy, screen: 'brief' }
    })
    window.scrollTo({ top: 0 })
  }

  // --- Pomodoro -------------------------------------------------------------

  const setTimer = (timer: Timer | null) => setState((s) => ({ ...s, timer }))

  const startTimer = () => {
    if (!plan.next) return
    askNotificationPermission()
    haptic(20)
    setTimer(startFocus(plan.next, Date.now()))
    setAnnouncement(`Focus timer started: ${plan.next.minutes} minutes on ${plan.next.topicName}.`)
  }

  useEffect(() => {
    const { timer, event } = tick(state.timer, now)
    if (!event) return
    chime()
    if (event === 'focus-done' && state.timer) {
      haptic([60, 40, 60, 40, 120])
      completeBlock({ topicId: state.timer.topicId, minutes: Math.round(state.timer.totalMs / 60000) })
      notify('Block done! ☕', `${state.timer.topicName}: take your 5-minute break.`)
      setAnnouncement('Focus block done. Break time: 5 minutes.')
    } else {
      haptic([30, 30, 30])
      const next = plan.next ? `Next up: ${plan.next.topicName}.` : ''
      notify("Break's over 🍅", next)
      setAnnouncement(`Break's over. ${next}`)
    }
    setTimer(timer)
    // Runs once per tick; completeBlock and plan are read fresh from this render.
  }, [now])

  // The countdown in the tab title, so it's visible from other tabs.
  useEffect(() => {
    const t = state.timer
    document.title = t ? `${formatClock(remainingMs(t, now))} ${t.mode === 'focus' ? '🍅' : '☕'}${t.endsAt === null ? ' ⏸' : ''} · ${APP_TITLE}` : APP_TITLE
  }, [state.timer, now])

  const doneBlock = () => {
    const t = state.timer
    if (t?.mode === 'focus') {
      // Finished early: bank the block and go straight to the break.
      completeBlock({ topicId: t.topicId, minutes: Math.round(t.totalMs / 60000) })
      setTimer(startBreak(t, Date.now()))
    } else completeBlock()
  }

  const closeSheet = useCallback(() => setSheet(null), [])
  const hasPlan = state.topics.length > 0 && !!state.setup.subject

  let content
  if (loading) content = <Loading lines={LOADING_LINES} />
  else if (state.screen === 'landing')
    content = (
      <Landing
        onStart={() => go('setup')}
        onSample={loadSample}
        resumeSubject={hasPlan ? state.setup.subject : undefined}
        onResume={() => go('plan')}
        account={account}
        signedIn={!!user}
        onTrophies={() => setSheet('account')}
        trophies={state.badges.length + state.history.length}
      />
    )
  else if (state.screen === 'setup')
    content = (
      <SetupScreen
        setup={state.setup}
        onChange={(setup) => setState((s) => ({ ...s, setup }))}
        onBack={() => go('landing')}
        onNext={() => go(state.topics.length ? 'plan' : 'brief')}
      />
    )
  else if (state.screen === 'brief')
    content = (
      <BuddyScreen
        session={state.buddy}
        subject={state.setup.subject}
        onSession={(buddy) => setState((s) => withBuddy(s, buddy))}
        onBack={() => go(state.buddy?.linked ? 'plan' : 'setup')}
        onSkip={() => go('topics')}
        onBuild={state.buddy?.linked ? () => go('plan') : buildFromBuddy}
      />
    )
  else if (state.screen === 'topics')
    content = (
      <TopicsScreen
        topics={state.topics}
        eve={plan.eve}
        onChange={(topics) => setState((s) => withTopics(s, topics))}
        onBack={() => go('brief')}
        onBuild={showPlan}
        onSample={loadSample}
      />
    )
  else
    content = (
      <PlanScreen
        plan={plan}
        setup={state.setup}
        topics={state.topics}
        now={now}
        examMs={examMs}
        badges={state.badges}
        todayWasted={todayWasted}
        stampKey={stampKey}
        replanKey={replanKey}
        undo={undo}
        storageOk={storageOk}
        onDoneBlock={doneBlock}
        timer={state.timer}
        onStartTimer={startTimer}
        onPauseTimer={() => state.timer && setTimer(pause(state.timer, Date.now()))}
        onResumeTimer={() => state.timer && setTimer(resume(state.timer, Date.now()))}
        onStopTimer={() => setTimer(null)}
        onDoneTopic={completeTopic}
        onRestoreTopic={restoreTopic}
        onUndo={doUndo}
        onDismissUndo={() => setUndo(null)}
        onWasted={() => setSheet('wasted')}
        onReport={() => setSheet('report')}
        onEditTopics={() => go('topics')}
        onBuddy={openBuddy}
        onEditSetup={() => go('setup')}
        onReset={reset}
        account={account}
      />
    )

  return (
    <>
      {content}
      {sheet === 'wasted' && <WastedSheet onClose={closeSheet} onLog={logWaste} />}
      {sheet === 'report' && (
        <ReportSheet
          data={reportFrom(state.setup.subject || 'My exam', plan, state.topics.filter((t) => t.done).length, state.badges)}
          onClose={closeSheet}
        />
      )}
      {sheet === 'account' && (
        <AccountSheet
          user={user}
          sync={sync}
          badges={state.badges}
          history={state.history}
          current={state.topics.length ? { subject: state.setup.subject, done: state.topics.filter((t) => t.done).length, total: state.topics.length } : null}
          busy={signingIn}
          error={signInError}
          onSignIn={signIn}
          onSignOut={signOut}
          onClose={closeSheet}
        />
      )}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4" role="status">
          <p className="animate-rise max-w-md rounded-xl border-[3px] border-ink bg-note px-4 py-2 text-center font-bold text-note-ink hard-shadow">{toast}</p>
        </div>
      )}
      <div className="sr-only" aria-live="polite" role="status">
        {announcement}
      </div>
    </>
  )
}
