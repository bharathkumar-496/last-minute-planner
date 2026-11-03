import { describe, expect, it } from 'vitest'
import { formatClock, pause, remainingMs, resume, startFocus, tick } from './pomodoro'

const block = { id: 'b1', topicId: 't1', topicName: 'Unit 3', minutes: 25 }
const MIN = 60_000

describe('pomodoro', () => {
  it('counts down, pauses and resumes', () => {
    let t = startFocus(block, 0)
    expect(remainingMs(t, 10 * MIN)).toBe(15 * MIN)
    t = pause(t, 10 * MIN)
    expect(remainingMs(t, 99 * MIN)).toBe(15 * MIN)
    t = resume(t, 100 * MIN)
    expect(remainingMs(t, 105 * MIN)).toBe(10 * MIN)
  })

  it('rolls focus into a 5-minute break, then ends', () => {
    const t = startFocus(block, 0)
    expect(tick(t, 24 * MIN).event).toBeNull()
    const done = tick(t, 25 * MIN)
    expect(done.event).toBe('focus-done')
    expect(done.timer?.mode).toBe('break')
    expect(remainingMs(done.timer!, 27 * MIN)).toBe(3 * MIN)
    const over = tick(done.timer, 30 * MIN)
    expect(over).toEqual({ timer: null, event: 'break-done' })
  })

  it('catches up after the tab was closed', () => {
    // Came back 40 minutes later: focus finished, and the break is over too.
    const first = tick(startFocus(block, 0), 40 * MIN)
    expect(first.event).toBe('focus-done')
    expect(tick(first.timer, 40 * MIN).event).toBe('break-done')
  })

  it('uses the block length for short final blocks', () => {
    expect(remainingMs(startFocus({ ...block, minutes: 10 }, 0), 0)).toBe(10 * MIN)
  })

  it('formats a clock', () => {
    expect(formatClock(25 * MIN)).toBe('25:00')
    expect(formatClock(61_000)).toBe('01:01')
    expect(formatClock(500)).toBe('00:01')
  })
})
