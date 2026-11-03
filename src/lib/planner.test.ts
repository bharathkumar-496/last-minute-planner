import { describe, expect, it } from 'vitest'
import {
  BLOCK_MIN,
  NICE_TRY,
  SLOT_MIN,
  buildPlan,
  dailyBudgets,
  livingCountdown,
  panicFor,
  parseSyllabus,
  priorityOf,
  validateSetup,
  type ExamSetup,
  type Topic,
} from './planner'
import { earnedBadges } from './fun'

const NOW = new Date('2026-11-03T10:00:00').getTime()
const local = (ms: number) => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const inHours = (h: number) => local(NOW + h * 3600_000)

const setup = (over: Partial<ExamSetup> = {}): ExamSetup => ({
  subject: 'Physics',
  examAt: inHours(72),
  hoursPerDay: 6,
  sleepHours: 7,
  ...over,
})

let n = 0
const topic = (over: Partial<Topic> = {}): Topic => ({
  id: `t${++n}`,
  name: `Unit ${n}`,
  marks: 10,
  hours: 1,
  confidence: 3,
  done: false,
  ...over,
})

describe('priorityOf', () => {
  it('follows marks × (6 − confidence) ÷ hours', () => {
    expect(priorityOf({ marks: 20, confidence: 1, hours: 2 })).toBe(50)
    expect(priorityOf({ marks: 20, confidence: 5, hours: 2 })).toBe(10)
  })
  it('does not divide by zero', () => {
    expect(Number.isFinite(priorityOf({ marks: 10, confidence: 3, hours: 0 }))).toBe(true)
  })
})

describe('dailyBudgets', () => {
  it('caps each full day at the study hours', () => {
    expect(dailyBudgets(3 * 1440, 6, 7)).toEqual([360, 360, 360])
  })
  it('protects sleep even if the user asks for 20 hours a day', () => {
    // Sleep is clamped to at least 6h, so at most 18 awake hours.
    expect(dailyBudgets(1440, 20, 2)).toEqual([18 * 60])
  })
  it('scales a partial day by awake hours', () => {
    // 6 hours left, 7h sleep: 6 × 17/24 = 4.25h
    expect(dailyBudgets(360, 8, 7)).toEqual([255])
  })
  it('eats wasted time from today first', () => {
    expect(dailyBudgets(2 * 1440 + 720, 6, 7, 400)).toEqual([0, 320, 360])
  })
  it('returns nothing for zero hours or no time', () => {
    expect(dailyBudgets(1000, 0, 7)).toEqual([])
    expect(dailyBudgets(0, 6, 7)).toEqual([])
  })
})

describe('validateSetup', () => {
  it('accepts a sensible setup', () => {
    expect(validateSetup(setup(), NOW)).toEqual({})
  })
  it('rejects removing sleep with the right line', () => {
    expect(validateSetup(setup({ sleepHours: 3 }), NOW).sleepHours).toBe(NICE_TRY)
    expect(validateSetup(setup({ hoursPerDay: 19 }), NOW).hoursPerDay).toBe(NICE_TRY)
  })
  it('rejects invalid and past dates, zero hours, empty subject', () => {
    expect(validateSetup(setup({ examAt: 'banana' }), NOW).examAt).toBeTruthy()
    expect(validateSetup(setup({ examAt: inHours(-1) }), NOW).examAt).toMatch(/already started/)
    expect(validateSetup(setup({ hoursPerDay: 0 }), NOW).hoursPerDay).toBeTruthy()
    expect(validateSetup(setup({ subject: '  ' }), NOW).subject).toBeTruthy()
  })
})

describe('buildPlan edge cases', () => {
  it('handles no topics', () => {
    expect(buildPlan({ setup: setup(), topics: [], now: NOW }).status).toBe('no-topics')
  })
  it('handles invalid dates', () => {
    expect(buildPlan({ setup: setup({ examAt: '' }), topics: [topic()], now: NOW }).status).toBe('invalid-date')
  })
  it('handles an exam that already started', () => {
    const plan = buildPlan({ setup: setup({ examAt: inHours(-0.5) }), topics: [topic()], now: NOW })
    expect(plan.status).toBe('exam-started')
    expect(plan.blocks).toEqual([])
  })
  it('handles zero available hours', () => {
    const plan = buildPlan({ setup: setup({ hoursPerDay: 0 }), topics: [topic({ confidence: 1 }), topic({ confidence: 4 })], now: NOW })
    expect(plan.status).toBe('no-time')
    expect(plan.blocks).toEqual([])
    expect(plan.topics.map((t) => t.tier).sort()).toEqual(['let-go', 'vibes'])
    expect(plan.next).toBeNull()
  })
  it('reports all-done when everything is complete', () => {
    const plan = buildPlan({ setup: setup(), topics: [topic({ done: true })], now: NOW })
    expect(plan.status).toBe('all-done')
    expect(plan.progressPct).toBe(100)
    expect(plan.cookedPct).toBe(0)
  })
})

describe('buildPlan scheduling', () => {
  it('sorts by priority and splits into 25-minute blocks', () => {
    const low = topic({ name: 'Easy', marks: 5, confidence: 5, hours: 1 })
    const high = topic({ name: 'Scary', marks: 20, confidence: 1, hours: 1 })
    const plan = buildPlan({ setup: setup(), topics: [low, high], now: NOW })
    expect(plan.status).toBe('ok')
    expect(plan.tight).toBe(false)
    expect(plan.next?.topicName).toBe('Scary')
    const scary = plan.blocks.filter((b) => b.topicId === high.id)
    expect(scary.map((b) => b.minutes)).toEqual([25, 25, 10])
    expect(plan.blocks.every((b) => b.minutes <= BLOCK_MIN)).toBe(true)
    expect(plan.topics.every((t) => t.tier === 'lock-in')).toBe(true)
  })

  it('labels tiers when there are more topics than time', () => {
    // 14h left, capped at 4h/day → 8 slots of 30 minutes
    const topics = [
      topic({ name: 'Big', marks: 30, confidence: 1, hours: 2 }), // 5 slots
      topic({ name: 'Mid', marks: 20, confidence: 2, hours: 2 }), // 5 slots
      topic({ name: 'Known', marks: 10, confidence: 4, hours: 2 }),
      topic({ name: 'Lost', marks: 5, confidence: 1, hours: 3 }),
    ]
    const plan = buildPlan({ setup: setup({ examAt: inHours(14), hoursPerDay: 4 }), topics, now: NOW })
    const tier = (name: string) => plan.topics.find((t) => t.topic.name === name)?.tier
    expect(plan.tight).toBe(true)
    expect(tier('Big')).toBe('lock-in')
    expect(tier('Mid')).toBe('quick-revise')
    expect(tier('Known')).toBe('vibes')
    expect(tier('Lost')).toBe('let-go')
    expect(plan.blocks.length * SLOT_MIN).toBeLessThanOrEqual(plan.budgetMin)
    expect(plan.realityChecks.some((c) => c.includes('Bold strategy'))).toBe(true)
  })

  it('replans after a topic is completed', () => {
    const a = topic({ marks: 20, confidence: 1 })
    const b = topic({ marks: 10, confidence: 3 })
    const before = buildPlan({ setup: setup(), topics: [a, b], now: NOW })
    expect(before.next?.topicId).toBe(a.id)
    const after = buildPlan({ setup: setup(), topics: [{ ...a, done: true }, b], now: NOW })
    expect(after.next?.topicId).toBe(b.id)
    expect(after.progressPct).toBeGreaterThan(before.progressPct)
  })

  it('counts studied minutes from completed blocks', () => {
    const a = topic({ hours: 1, studiedMin: 50 })
    const plan = buildPlan({ setup: setup(), topics: [a], now: NOW })
    expect(plan.blocks.map((b) => b.minutes)).toEqual([10])
  })

  it('replans after wasted time and gets more cooked', () => {
    const topics = Array.from({ length: 6 }, (_, i) => topic({ marks: 10 + i, confidence: 2, hours: 1.5 }))
    const s = setup({ examAt: inHours(20), hoursPerDay: 6 })
    const before = buildPlan({ setup: s, topics, now: NOW })
    const after = buildPlan({ setup: s, topics, now: NOW, wastedMin: 120 })
    expect(after.budgetMin).toBe(before.budgetMin - 120)
    expect(after.blocks.length).toBe(before.blocks.length - 4)
    expect(after.cookedPct).toBeGreaterThan(before.cookedPct)
  })

  it('never schedules more than the sleep-protected budget', () => {
    const topics = Array.from({ length: 30 }, () => topic({ hours: 3, confidence: 1 }))
    const plan = buildPlan({ setup: setup({ hoursPerDay: 14, sleepHours: 7 }), topics, now: NOW })
    const perDay = new Map<number, number>()
    for (const b of plan.blocks) perDay.set(b.dayIndex, (perDay.get(b.dayIndex) ?? 0) + SLOT_MIN)
    for (const m of perDay.values()) expect(m).toBeLessThanOrEqual(14 * 60)
  })

  it('switches to exam-eve mode in the final 12 hours and drops brand-new topics', () => {
    const topics = [topic({ name: 'New', confidence: 1, marks: 50 }), topic({ name: 'Known', confidence: 3 })]
    const plan = buildPlan({ setup: setup({ examAt: inHours(10) }), topics, now: NOW })
    expect(plan.eve).toBe(true)
    const fresh = plan.topics.find((t) => t.topic.name === 'New')
    expect(fresh?.tier).toBe('let-go')
    expect(fresh?.note).toMatch(/No new topics/)
    expect(plan.next?.topicName).toBe('Known')
  })

  it('panic level follows the cooked percentage', () => {
    expect(panicFor(0)).toBe('Chill')
    expect(panicFor(20)).toBe('Slightly Cooked')
    expect(panicFor(40)).toBe('Cooked')
    expect(panicFor(60)).toBe('Well Done')
    expect(panicFor(90)).toBe('Ask Your Backbench Friend')
  })
})

describe('parseSyllabus', () => {
  it('splits by line, comma, and inline unit headings', () => {
    const text = `1. Kinematics, Dynamics
- Thermodynamics (15 marks)
Unit 4: Waves, Optics Unit 5: Modern Physics`
    expect(parseSyllabus(text)).toEqual([
      { name: 'Kinematics' },
      { name: 'Dynamics' },
      { name: 'Thermodynamics', marks: 15 },
      { name: 'Unit 4: Waves, Optics' },
      { name: 'Unit 5: Modern Physics' },
    ])
  })
  it('ignores blanks and duplicates', () => {
    expect(parseSyllabus('\n\nAlgebra\nalgebra\n , ,')).toEqual([{ name: 'Algebra' }])
  })
})

describe('livingCountdown', () => {
  it('reads like a friend', () => {
    expect(livingCountdown(3 * 1440 + 30)).toBe("That's 3 sleeps, 9 meals, and two bad decisions.")
    expect(livingCountdown(600)).toMatch(/^That's zero sleeps/)
    expect(livingCountdown(30)).toMatch(/episode/)
  })
  it('counts real nights, not 24-hour chunks', () => {
    // 10 AM today → 9 AM tomorrow is under 24h but still one night.
    expect(livingCountdown(23 * 60, NOW)).toMatch(/^That's 1 sleep,/)
    expect(livingCountdown(600, NOW)).toMatch(/^That's zero sleeps/)
  })
})

describe('earnedBadges', () => {
  const examAt = NOW + 20 * 3600_000
  it('awards each badge on its condition', () => {
    expect(earnedBadges({ peakCooked: 70, cookedPct: 30, examAt, completions: [], wasteLogs: [] })).toEqual(['back-from-the-dead'])
    expect(earnedBadges({ peakCooked: 10, cookedPct: 10, examAt, completions: [NOW, NOW + 1, NOW + 2], wasteLogs: [] })).toEqual(['one-night-warrior'])
    expect(earnedBadges({ peakCooked: 10, cookedPct: 10, examAt, completions: [NOW + 5], wasteLogs: [NOW] })).toEqual(['touched-grass'])
    expect(earnedBadges({ peakCooked: 10, cookedPct: 10, examAt, completions: [NOW - 5], wasteLogs: [NOW] })).toEqual([])
  })
})
