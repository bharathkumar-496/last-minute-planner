import { DEFAULT_SLEEP, type ExamSetup, type Topic } from './planner'
import type { BadgeId } from './fun'
import type { BuddySession } from './buddy'
import type { Timer } from './pomodoro'
import type { Paper } from './pyq'

export type Screen = 'landing' | 'setup' | 'brief' | 'topics' | 'plan'

export interface WasteLog {
  id: string
  reason: string
  minutes: number
  at: number
}

/** A finished (or abandoned) exam, kept forever as an achievement. */
export interface ExamRecord {
  id: string
  subject: string
  examAt: string
  endedAt: number
  done: number
  total: number
  cookedPct: number
  badges: BadgeId[]
}

export interface AppState {
  version: 2
  screen: Screen
  setup: ExamSetup
  topics: Topic[]
  wasteLogs: WasteLog[]
  badges: BadgeId[]
  peakCooked: number
  buddy: BuddySession | null
  timer: Timer | null
  history: ExamRecord[]
}

const KEY = 'last-minute-planner:v1'

export function defaultExamAt(now = Date.now()): string {
  const d = new Date(now + 24 * 3600_000)
  d.setHours(9, 0, 0, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function freshState(): AppState {
  return {
    version: 2,
    screen: 'landing',
    setup: { subject: '', examAt: defaultExamAt(), hoursPerDay: 5, sleepHours: DEFAULT_SLEEP },
    topics: [],
    wasteLogs: [],
    badges: [],
    peakCooked: 0,
    buddy: null,
    timer: null,
    history: [],
  }
}

let available: boolean | null = null

/** localStorage can throw (private mode, blocked cookies, quota). */
export function storageAvailable(): boolean {
  if (available !== null) return available
  try {
    const probe = '__lmp_probe__'
    window.localStorage.setItem(probe, probe)
    window.localStorage.removeItem(probe)
    available = true
  } catch {
    available = false
  }
  return available
}

function isState(v: unknown): v is AppState {
  if (!v || typeof v !== 'object') return false
  const s = v as { version?: number; setup?: unknown; topics?: unknown; wasteLogs?: unknown }
  return (s.version === 1 || s.version === 2) && !!s.setup && Array.isArray(s.topics) && Array.isArray(s.wasteLogs)
}

export function loadState(): AppState {
  if (!storageAvailable()) return freshState()
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return freshState()
    const parsed: unknown = JSON.parse(raw)
    if (!isState(parsed)) return freshState()
    // v1 had no Study Buddy; the spread fills it in.
    return { ...freshState(), ...parsed, version: 2, badges: parsed.badges ?? [], buddy: parsed.buddy ?? null, timer: parsed.timer ?? null, history: parsed.history ?? [] }
  } catch {
    return freshState()
  }
}

const UPDATED_KEY = 'last-minute-planner:updatedAt'
let lastSaved = ''

/** When this device's data last really changed; the cloud merge uses it. */
export function localUpdatedAt(): number {
  try {
    return Number(window.localStorage.getItem(UPDATED_KEY)) || 0
  } catch {
    return 0
  }
}

/**
 * Saves only when something changed, and stamps the time. Pass `stampedAt`
 * when the data came from the cloud, so it keeps the cloud's timestamp.
 */
export function saveState(state: AppState, stampedAt?: number): boolean {
  if (!storageAvailable()) return false
  try {
    const json = JSON.stringify(state)
    if (json === lastSaved && stampedAt === undefined) return true
    window.localStorage.setItem(KEY, json)
    window.localStorage.setItem(UPDATED_KEY, String(stampedAt ?? (lastSaved ? Date.now() : localUpdatedAt() || Date.now())))
    lastSaved = json
    return true
  } catch {
    return false
  }
}

export function clearState(): void {
  if (!storageAvailable()) return
  try {
    window.localStorage.removeItem(KEY)
    window.localStorage.removeItem(UPDATED_KEY)
    window.localStorage.removeItem(DRAFT_KEY)
    window.localStorage.removeItem(PAPERS_KEY)
  } catch {
    // nothing to do
  }
}

// Files read on the "Tell me about it" screen but not analysed yet. Kept apart
// from the main state because extracted text can be large.

export interface UploadDraft {
  paste: string
  uploads: Array<{ id: string; name: string; slot: 'syllabus' | 'material' | 'pyq'; text: string }>
}

const DRAFT_KEY = 'last-minute-planner:draft'

export function loadDraft(): UploadDraft | null {
  if (!storageAvailable()) return null
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as UploadDraft
    return typeof d.paste === 'string' && Array.isArray(d.uploads) ? d : null
  } catch {
    return null
  }
}

/** Returns false when the draft could not be kept (usually: too big). */
export function saveDraft(draft: UploadDraft): boolean {
  if (!storageAvailable()) return false
  try {
    if (!draft.paste && draft.uploads.length === 0) window.localStorage.removeItem(DRAFT_KEY)
    else window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

// Past papers (found online or uploaded), kept so re-analysis works after a reload.
const PAPERS_KEY = 'last-minute-planner:papers'

export function loadPapers(): Paper[] {
  if (!storageAvailable()) return []
  try {
    const raw = window.localStorage.getItem(PAPERS_KEY)
    const list = raw ? (JSON.parse(raw) as Paper[]) : []
    return Array.isArray(list) ? list.filter((p) => typeof p.text === 'string') : []
  } catch {
    return []
  }
}

/** Adds papers, skipping ones already kept. Returns the full list. */
export function addPapers(papers: Paper[]): Paper[] {
  const all = loadPapers()
  const seen = new Set(all.map((p) => p.url ?? p.name))
  for (const p of papers) {
    const key = p.url ?? p.name
    if (!seen.has(key)) {
      seen.add(key)
      all.push(p)
    }
  }
  try {
    if (storageAvailable()) window.localStorage.setItem(PAPERS_KEY, JSON.stringify(all.slice(-12)))
  } catch {
    // too big to keep; this session still uses them
  }
  return all.slice(-12)
}
