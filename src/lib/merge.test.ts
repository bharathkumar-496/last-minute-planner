import { describe, expect, it } from 'vitest'
import { isEmpty, mergeStates } from './merge'
import { freshState, type AppState } from './storage'

const plan = (over: Partial<AppState> = {}): AppState => ({
  ...freshState(),
  setup: { subject: 'Physics', examAt: '2026-11-05T09:00', hoursPerDay: 5, sleepHours: 7 },
  topics: [{ id: 't1', name: 'Unit 1', marks: 10, hours: 1, confidence: 3, done: false }],
  screen: 'plan',
  ...over,
})
const record = (id: string, endedAt: number) => ({ id, subject: 'Old', examAt: '', endedAt, done: 1, total: 2, cookedPct: 30, badges: [] })

describe('mergeStates', () => {
  it('uploads local data when the account is empty', () => {
    const local = { state: plan(), updatedAt: 5 }
    expect(mergeStates(local, null).source).toBe('local')
    expect(mergeStates(local, { state: freshState(), updatedAt: 9 }).source).toBe('local')
  })

  it('takes the account on a fresh device and opens the plan', () => {
    const result = mergeStates({ state: freshState(), updatedAt: 0 }, { state: plan({ screen: 'brief' }), updatedAt: 9 })
    expect(result.source).toBe('cloud')
    expect(result.state.setup.subject).toBe('Physics')
    expect(result.state.screen).toBe('plan')
  })

  it('newest plan wins, but badges and past exams from both sides survive', () => {
    const local = { state: plan({ badges: ['touched-grass'], peakCooked: 40, history: [record('a', 1)] }), updatedAt: 10 }
    const cloud = {
      state: plan({ setup: { ...plan().setup, subject: 'Chemistry' }, badges: ['one-night-warrior'], peakCooked: 70, history: [record('b', 2)], screen: 'topics' }),
      updatedAt: 20,
    }
    const result = mergeStates(local, cloud)
    expect(result.source).toBe('cloud')
    expect(result.state.setup.subject).toBe('Chemistry')
    expect(result.state.screen).toBe('plan') // stays where this device was
    expect(result.state.badges.sort()).toEqual(['one-night-warrior', 'touched-grass'])
    expect(result.state.peakCooked).toBe(70)
    expect(result.state.history.map((h) => h.id)).toEqual(['b', 'a'])
    expect(result.updatedAt).toBe(20)

    const older = mergeStates({ ...local, updatedAt: 30 }, cloud)
    expect(older.source).toBe('local')
    expect(older.state.setup.subject).toBe('Physics')
    expect(older.state.badges).toHaveLength(2)
  })

  it('reports when nothing changed', () => {
    expect(mergeStates({ state: plan(), updatedAt: 5 }, { state: plan({ screen: 'topics' }), updatedAt: 5 }).source).toBe('same')
  })

  it('knows an empty state', () => {
    expect(isEmpty(freshState())).toBe(true)
    expect(isEmpty(plan())).toBe(false)
    expect(isEmpty({ ...freshState(), badges: ['touched-grass'] })).toBe(false)
  })
})
