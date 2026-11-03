// Pure planning logic. No DOM, no storage, no Date.now(): every function takes
// `now` explicitly so it can be tested deterministically.

export const BLOCK_MIN = 25
export const BREAK_MIN = 5
export const SLOT_MIN = BLOCK_MIN + BREAK_MIN
export const MIN_SLEEP = 6
export const DEFAULT_SLEEP = 7
export const MAX_SLEEP = 12
/** Hours per day you need for meals, showers and existing. */
export const LIFE_HOURS = 3
export const EVE_HOURS = 12
export const NICE_TRY = 'Nice try. Your brain needs that.'

export type Confidence = 1 | 2 | 3 | 4 | 5

export interface Topic {
  id: string
  name: string
  marks: number
  hours: number
  confidence: Confidence
  done: boolean
  doneAt?: number
  /** Minutes already studied via completed blocks. */
  studiedMin?: number
  /** What to concentrate on, from the Study Buddy. */
  focus?: string[]
  /** Why the buddy rated it this way. */
  why?: string
}

export interface ExamSetup {
  subject: string
  /** Local date-time string, as produced by <input type="datetime-local">. */
  examAt: string
  hoursPerDay: number
  sleepHours: number
}

export type Tier = 'lock-in' | 'quick-revise' | 'vibes' | 'let-go'

export const TIER_LABEL: Record<Tier, string> = {
  'lock-in': 'Must Lock In',
  'quick-revise': 'Quick Revise',
  vibes: 'Vibes Only',
  'let-go': 'Let It Go 🕊️',
}

export const PANIC_LEVELS = [
  'Chill',
  'Slightly Cooked',
  'Cooked',
  'Well Done',
  'Ask Your Backbench Friend',
] as const
export type PanicLevel = (typeof PANIC_LEVELS)[number]

export interface StudyBlock {
  id: string
  topicId: string
  topicName: string
  minutes: number
  /** 0 = today, 1 = tomorrow, ... */
  dayIndex: number
  part: number
  parts: number
}

export interface TopicPlan {
  topic: Topic
  priority: number
  requiredMin: number
  allocatedMin: number
  slots: number
  tier: Tier
  note?: string
}

export type PlanStatus =
  | 'ok'
  | 'no-topics'
  | 'invalid-date'
  | 'exam-started'
  | 'no-time'
  | 'all-done'

export interface Plan {
  status: PlanStatus
  /** Not enough time to cover every remaining topic fully. */
  tight: boolean
  /** Final 12 hours before the exam. */
  eve: boolean
  minutesLeft: number
  budgetMin: number
  requiredMin: number
  topics: TopicPlan[]
  blocks: StudyBlock[]
  next: StudyBlock | null
  cookedPct: number
  progressPct: number
  panic: PanicLevel
  realityChecks: string[]
}

// ---------------------------------------------------------------------------
// Basics

export function priorityOf(t: Pick<Topic, 'marks' | 'confidence' | 'hours'>): number {
  const hours = Math.max(t.hours, 0.25)
  return (Math.max(t.marks, 0) * (6 - t.confidence)) / hours
}

export function parseExamDate(value: string): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function clampSleep(hours: number): number {
  if (!Number.isFinite(hours)) return DEFAULT_SLEEP
  return Math.min(MAX_SLEEP, Math.max(MIN_SLEEP, hours))
}

export function maxStudyHours(sleepHours: number): number {
  return 24 - clampSleep(sleepHours) - LIFE_HOURS
}

export interface SetupErrors {
  subject?: string
  examAt?: string
  hoursPerDay?: string
  sleepHours?: string
}

export function validateSetup(s: ExamSetup, now: number): SetupErrors {
  const errors: SetupErrors = {}
  if (!s.subject.trim()) errors.subject = 'Give the enemy a name.'
  const exam = parseExamDate(s.examAt)
  if (!exam) errors.examAt = "That's not a date. That's a cry for help."
  else if (exam.getTime() <= now)
    errors.examAt = "That exam already started. Unless you've invented time travel, pick a future date."
  if (!Number.isFinite(s.sleepHours) || s.sleepHours < MIN_SLEEP) errors.sleepHours = NICE_TRY
  if (!Number.isFinite(s.hoursPerDay) || s.hoursPerDay <= 0)
    errors.hoursPerDay = '0 hours a day? Even the backbench friend does 30 minutes.'
  else if (s.hoursPerDay > maxStudyHours(s.sleepHours)) errors.hoursPerDay = NICE_TRY
  return errors
}

/**
 * Study minutes available per day, today first. Sleep is protected: each day
 * only offers its awake hours, and today's partial day is scaled by how much
 * of the day remains. Wasted minutes are eaten from today onward.
 */
export function dailyBudgets(
  minutesLeft: number,
  hoursPerDay: number,
  sleepHours: number,
  wastedMin = 0,
): number[] {
  if (minutesLeft <= 0 || hoursPerDay <= 0) return []
  const awakeHours = 24 - clampSleep(sleepHours)
  const dailyCap = Math.min(hoursPerDay, awakeHours) * 60
  const fullDays = Math.floor(minutesLeft / 1440)
  const rem = minutesLeft - fullDays * 1440
  const days: number[] = []
  if (rem > 0) days.push(Math.min(dailyCap, (rem * awakeHours) / 24))
  for (let i = 0; i < fullDays; i++) days.push(dailyCap)

  let waste = Math.max(0, wastedMin)
  for (let i = 0; i < days.length && waste > 0; i++) {
    const eaten = Math.min(days[i], waste)
    days[i] -= eaten
    waste -= eaten
  }
  return days.map((m) => Math.floor(m))
}

export function remainingMin(t: Pick<Topic, 'hours' | 'studiedMin'>): number {
  return Math.max(0, Math.round(Math.max(t.hours, 0) * 60 - (t.studiedMin ?? 0)))
}

export function slotsNeeded(minutes: number): number {
  return Math.max(1, Math.ceil(Math.max(minutes, 0) / BLOCK_MIN))
}

export function panicFor(cookedPct: number): PanicLevel {
  if (cookedPct < 15) return PANIC_LEVELS[0]
  if (cookedPct < 35) return PANIC_LEVELS[1]
  if (cookedPct < 55) return PANIC_LEVELS[2]
  if (cookedPct < 75) return PANIC_LEVELS[3]
  return PANIC_LEVELS[4]
}

// ---------------------------------------------------------------------------
// The planner

export interface PlanInput {
  setup: ExamSetup
  topics: Topic[]
  wastedMin?: number
  now: number
}

export function buildPlan({ setup, topics, wastedMin = 0, now }: PlanInput): Plan {
  const exam = parseExamDate(setup.examAt)
  const minutesLeft = exam ? Math.floor((exam.getTime() - now) / 60000) : 0
  const eve = exam !== null && minutesLeft > 0 && minutesLeft <= EVE_HOURS * 60

  const empty: Plan = {
    status: 'ok',
    tight: false,
    eve,
    minutesLeft,
    budgetMin: 0,
    requiredMin: 0,
    topics: [],
    blocks: [],
    next: null,
    cookedPct: 0,
    progressPct: 0,
    panic: PANIC_LEVELS[0],
    realityChecks: [],
  }
  if (!exam) return { ...empty, status: 'invalid-date' }
  if (minutesLeft <= 0) return { ...empty, status: 'exam-started', minutesLeft: 0 }
  if (topics.length === 0) return { ...empty, status: 'no-topics' }

  const days = dailyBudgets(minutesLeft, setup.hoursPerDay, setup.sleepHours, wastedMin)
  const daySlots = days.map((m) => Math.floor(m / SLOT_MIN))
  const budgetSlots = daySlots.reduce((a, b) => a + b, 0)

  const pending = topics
    .filter((t) => !t.done)
    .map((topic) => ({
      topic,
      priority: priorityOf(topic),
      requiredMin: remainingMin(topic),
      need: slotsNeeded(remainingMin(topic)),
      slots: 0,
      note: undefined as string | undefined,
    }))
    .sort((a, b) => b.priority - a.priority || b.topic.marks - a.topic.marks)

  // Exam eve: no new topics. Confidence 1 means "never seen it", so it goes,
  // unless that would leave literally nothing to do.
  const eligible = eve && pending.some((p) => p.topic.confidence > 1)
    ? pending.filter((p) => p.topic.confidence > 1)
    : pending
  if (eligible !== pending) {
    for (const p of pending) if (p.topic.confidence === 1) p.note = 'No new topics tonight.'
  }

  const requiredSlots = eligible.reduce((a, p) => a + p.need, 0)
  const tight = requiredSlots > budgetSlots || eligible.length < pending.length

  // Pass 1: in priority order, lock in every topic that fits whole.
  let left = budgetSlots
  for (const p of eligible) {
    if (p.need <= left) {
      p.slots = p.need
      left -= p.need
    }
  }
  // Pass 2: leftover slots become quick revisions of what didn't fit.
  for (const p of eligible) {
    if (left <= 0) break
    if (p.slots === 0) {
      p.slots = Math.min(p.need, left)
      left -= p.slots
    }
  }

  const topicPlans: TopicPlan[] = pending.map((p) => {
    const allocatedMin = Math.min(p.requiredMin, p.slots * BLOCK_MIN)
    let tier: Tier
    if (p.slots >= p.need) tier = 'lock-in'
    else if (p.slots > 0) tier = 'quick-revise'
    else if (p.topic.confidence >= 3 && !p.note) tier = 'vibes'
    else tier = 'let-go'
    return {
      topic: p.topic,
      priority: p.priority,
      requiredMin: p.requiredMin,
      allocatedMin,
      slots: p.slots,
      tier,
      note: p.note,
    }
  })

  // Lay blocks out across days in priority order.
  const blocks: StudyBlock[] = []
  let day = 0
  let dayLeft = daySlots[0] ?? 0
  for (const tp of topicPlans) {
    let remaining = tp.allocatedMin
    for (let part = 1; part <= tp.slots; part++) {
      while (dayLeft <= 0 && day < daySlots.length - 1) dayLeft = daySlots[++day]
      const minutes = Math.min(BLOCK_MIN, Math.max(remaining, 5))
      remaining -= minutes
      blocks.push({
        id: `${tp.topic.id}-${part}`,
        topicId: tp.topic.id,
        topicName: tp.topic.name,
        minutes,
        dayIndex: day,
        part,
        parts: tp.slots,
      })
      dayLeft--
    }
  }

  const doneTopics = topics.filter((t) => t.done)
  const totalMarks = topics.reduce((a, t) => a + Math.max(t.marks, 0), 0)
  let secured = doneTopics.reduce((a, t) => a + Math.max(t.marks, 0), 0)
  for (const tp of topicPlans) {
    const known = (tp.topic.confidence - 1) / 4
    const totalMin = Math.max(tp.topic.hours, 0) * 60
    const coverage = totalMin > 0
      ? Math.min(1, ((tp.topic.studiedMin ?? 0) + tp.allocatedMin) / totalMin)
      : 1
    secured += Math.max(tp.topic.marks, 0) * (known + (1 - known) * coverage)
  }
  const projectedLoss = totalMarks > 0 ? 1 - secured / totalMarks : 0
  // Even a plan that fits gets a little spicy when it eats all your time.
  const utilisation = budgetSlots > 0 ? requiredSlots / budgetSlots : 1
  const pressure = Math.min(1, Math.max(0, (utilisation - 0.5) / 0.5)) * 34
  // Short on time: start at "Cooked" and climb with the shortfall.
  const shortfall = requiredSlots > 0 ? Math.max(0, 1 - budgetSlots / requiredSlots) : 0
  const tightFloor = 35 + 40 * shortfall
  const allDone = pending.length === 0
  const cookedPct = allDone
    ? 0
    : Math.round(Math.min(100, Math.max(projectedLoss * 100, tight ? tightFloor : pressure)))
  const progressPct = totalMarks > 0
    ? Math.round((doneTopics.reduce((a, t) => a + Math.max(t.marks, 0), 0) / totalMarks) * 100)
    : 0

  const status: PlanStatus = allDone ? 'all-done' : budgetSlots === 0 ? 'no-time' : 'ok'

  return {
    status,
    tight,
    eve,
    minutesLeft,
    budgetMin: budgetSlots * SLOT_MIN,
    requiredMin: requiredSlots * SLOT_MIN,
    topics: topicPlans,
    blocks,
    next: blocks[0] ?? null,
    cookedPct,
    progressPct,
    panic: panicFor(cookedPct),
    realityChecks: realityChecks(eligible.map((p) => p.topic), budgetSlots * SLOT_MIN, tight),
  }
}

// ---------------------------------------------------------------------------
// Personality helpers (pure, so they are tested too)

export function formatHours(minutes: number): string {
  const h = minutes / 60
  if (h < 1) return `${Math.max(0, Math.round(minutes))} minutes`
  const rounded = Math.round(h * 2) / 2
  return `${rounded} ${rounded === 1 ? 'hour' : 'hours'}`
}

export function realityChecks(pending: Topic[], budgetMin: number, tight: boolean): string[] {
  const checks: string[] = []
  const optimistic = pending
    .filter((t) => t.confidence <= 2 && t.hours <= 2 && t.marks >= 10)
    .sort((a, b) => b.marks - a.marks)[0]
  if (optimistic) {
    checks.push(`${formatHours(optimistic.hours * 60)} for ${optimistic.name}? We love the confidence.`)
  }
  if (tight && pending.length > 1) {
    const unit = pending.length === 1 ? 'unit' : 'units'
    checks.push(`You have ${formatHours(budgetMin)} and ${pending.length} ${unit}. Bold strategy.`)
  }
  return checks
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const word = (n: number) => NUMBER_WORDS[n] ?? String(n)

/** Nights before the exam: how many 3 AMs fall between now and then. */
export function nightsUntil(now: number, minutesLeft: number): number {
  const end = now + minutesLeft * 60000
  const d = new Date(now)
  d.setHours(3, 0, 0, 0)
  if (d.getTime() <= now) d.setDate(d.getDate() + 1)
  let nights = 0
  while (d.getTime() < end) {
    nights++
    d.setDate(d.getDate() + 1)
  }
  return nights
}

/** "That's 3 sleeps, 2 meals, and one bad decision." */
export function livingCountdown(minutesLeft: number, now?: number): string {
  if (minutesLeft <= 0) return "It's go time. Breathe. You know more than you think."
  if (minutesLeft < 60) return "That's less than one episode of anything. Make it count."
  const hours = minutesLeft / 60
  const sleeps = now === undefined ? Math.floor(hours / 24) : nightsUntil(now, minutesLeft)
  const meals = Math.max(1, Math.round((hours / 24) * 3))
  const decisions = Math.max(1, Math.ceil(sleeps / 2))
  const sleepText = sleeps === 0 ? 'zero sleeps (protect the nap)' : plural(sleeps, 'sleep', 'sleeps')
  const decisionText = `${word(decisions)} bad ${decisions === 1 ? 'decision' : 'decisions'}`
  return `That's ${sleepText}, ${plural(meals, 'meal', 'meals')}, and ${decisionText}.`
}

export function countdownParts(minutesLeft: number) {
  const m = Math.max(0, minutesLeft)
  return { days: Math.floor(m / 1440), hours: Math.floor((m % 1440) / 60), minutes: m % 60 }
}

// ---------------------------------------------------------------------------
// Syllabus parsing

const UNIT_HEADING = /\b(?:unit|chapter|module|lesson|part|section)\s*[-–:]?\s*(?:\d+|[ivxlc]+)\b/i
const UNIT_SPLIT = /(?=\b(?:unit|chapter|module|lesson)\s*[-–:]?\s*(?:\d+|[ivxlc]+)\b)/gi
const MARKS = /\(?\s*(\d{1,3})\s*(?:marks?|m|pts?|points?)\s*\)?/i

export interface ParsedTopic {
  name: string
  marks?: number
}

/**
 * Splits pasted syllabus text into topics by line, by comma/semicolon, and by
 * inline unit headings ("Unit 1 ... Unit 2 ..."). A chunk that starts with a
 * unit heading is kept whole, so "Unit 3: Waves, Optics" stays one unit.
 */
export function parseSyllabus(text: string): ParsedTopic[] {
  const seen = new Set<string>()
  const out: ParsedTopic[] = []
  for (const line of text.split(/\r?\n/)) {
    for (const chunk of line.split(UNIT_SPLIT)) {
      const trimmed = chunk.trim()
      if (!trimmed) continue
      const pieces = UNIT_HEADING.test(trimmed.slice(0, 20)) ? [trimmed] : trimmed.split(/[,;]|\s+[•·|]\s+/)
      for (const piece of pieces) {
        let name = piece
          .replace(/^\s*(?:[-*•·>]+|\d+[.)]|[a-z][.)])\s+/i, '')
          .trim()
        let marks: number | undefined
        const m = name.match(MARKS)
        if (m && /\d\s*(marks?|m|pts?|points?)\b/i.test(m[0])) {
          marks = Number(m[1])
          name = name.replace(m[0], '').trim()
        }
        name = name.replace(/[\s:,.;–-]+$/, '').replace(/\s+/g, ' ').slice(0, 80).trim()
        if (name.length < 2) continue
        const key = name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(marks !== undefined ? { name, marks } : { name })
      }
    }
  }
  return out
}
