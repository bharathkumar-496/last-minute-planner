// Pomodoro timer state. Stored as absolute end times so it keeps counting while
// the tab is closed, and catches up correctly when the student comes back.

import { BREAK_MIN } from './planner'

export type TimerMode = 'focus' | 'break'

export interface Timer {
  mode: TimerMode
  /** The study block this focus session is for. */
  blockId: string
  topicId: string
  topicName: string
  totalMs: number
  /** Running: when it ends. Paused: null. */
  endsAt: number | null
  /** Paused: what was left. */
  remainingMs: number
}

export type TimerEvent = 'focus-done' | 'break-done' | null

export function startFocus(block: { id: string; topicId: string; topicName: string; minutes: number }, now: number): Timer {
  const totalMs = block.minutes * 60_000
  return { mode: 'focus', blockId: block.id, topicId: block.topicId, topicName: block.topicName, totalMs, endsAt: now + totalMs, remainingMs: totalMs }
}

export function startBreak(from: Timer, startsAt: number): Timer {
  const totalMs = BREAK_MIN * 60_000
  return { ...from, mode: 'break', totalMs, endsAt: startsAt + totalMs, remainingMs: totalMs }
}

export function remainingMs(t: Timer, now: number): number {
  return t.endsAt === null ? t.remainingMs : Math.max(0, t.endsAt - now)
}

export function pause(t: Timer, now: number): Timer {
  if (t.endsAt === null) return t
  return { ...t, endsAt: null, remainingMs: remainingMs(t, now) }
}

export function resume(t: Timer, now: number): Timer {
  if (t.endsAt !== null) return t
  return { ...t, endsAt: now + t.remainingMs }
}

/**
 * Advances the timer. A finished focus session rolls straight into its break,
 * counted from when the focus actually ended (so time away is honoured).
 */
export function tick(t: Timer | null, now: number): { timer: Timer | null; event: TimerEvent } {
  if (!t || t.endsAt === null || now < t.endsAt) return { timer: t, event: null }
  if (t.mode === 'focus') return { timer: startBreak(t, t.endsAt), event: 'focus-done' }
  return { timer: null, event: 'break-done' }
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
