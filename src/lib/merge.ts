// Combining this device's data with what's saved in the student's account.
// The newer plan wins, but achievements are never lost: badges and past exams
// from both sides are kept.

import type { AppState, ExamRecord } from './storage'

export interface Stamped {
  state: AppState
  updatedAt: number
}

export type MergeSource = 'local' | 'cloud' | 'same'

/** Nothing worth keeping: a fresh install or a cleared device. */
export function isEmpty(s: AppState): boolean {
  return s.topics.length === 0 && !s.buddy && s.history.length === 0 && s.badges.length === 0 && !s.setup.subject
}

function unionHistory(a: ExamRecord[], b: ExamRecord[]): ExamRecord[] {
  const byId = new Map<string, ExamRecord>()
  for (const r of [...a, ...b]) byId.set(r.id, r)
  return [...byId.values()].sort((x, y) => y.endedAt - x.endedAt)
}

export function mergeStates(local: Stamped, cloud: Stamped | null): { state: AppState; updatedAt: number; source: MergeSource } {
  if (!cloud || isEmpty(cloud.state)) return { ...local, source: 'local' }
  if (isEmpty(local.state)) {
    // A brand-new device: take the account's plan and drop straight into it.
    const screen = cloud.state.topics.length ? 'plan' : cloud.state.buddy ? 'brief' : local.state.screen
    return { state: { ...cloud.state, screen }, updatedAt: cloud.updatedAt, source: 'cloud' }
  }
  const cloudNewer = cloud.updatedAt > local.updatedAt
  const base = cloudNewer ? cloud : local
  const other = cloudNewer ? local : cloud
  const state: AppState = {
    ...base.state,
    // Keep whatever screen this device is on, so nothing jumps around.
    screen: local.state.screen,
    badges: [...new Set([...base.state.badges, ...other.state.badges])],
    peakCooked: Math.max(base.state.peakCooked, other.state.peakCooked),
    history: unionHistory(base.state.history, other.state.history),
  }
  const same = JSON.stringify({ ...local.state, screen: '' }) === JSON.stringify({ ...state, screen: '' })
  return { state, updatedAt: Math.max(local.updatedAt, cloud.updatedAt), source: same ? 'same' : cloudNewer ? 'cloud' : 'local' }
}
