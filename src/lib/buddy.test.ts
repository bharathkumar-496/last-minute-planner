import { describe, expect, it } from 'vitest'
import {
  buildUnits,
  checkIn,
  mergeTopics,
  sessionFromTopics,
  syncFromTopics,
  clauses,
  guessUnitsFromMaterial,
  introFor,
  parseUnits,
  readIntent,
  replyFor,
  resolveUnits,
  toTopics,
  understand,
  type BuddySession,
} from './buddy'

const SYLLABUS = `Unit 1: Kinematics – Motion in a straight line, Projectile motion (15 marks)
Unit 2: Laws of Motion
Newton's laws, Friction, Circular motion
Unit 3: Thermodynamics – First law, Entropy, Carnot cycle
Unit 4: Waves and Optics`

const MATERIAL = `
Thermodynamics deals with heat and work. The first law of thermodynamics states energy is conserved.
Entropy is a measure of disorder. The Carnot cycle is the most efficient heat engine cycle. Derive the
efficiency of the Carnot cycle. Calculate the entropy change when 2 kg of ice melts. 5 x 3 = 15, 2 + 2 = 4, 9 - 1 = 8.

The Carnot cycle consists of two isothermal and two adiabatic processes. Carnot cycle efficiency depends on
reservoir temperatures. Entropy change in a reversible process. The first law applies to every thermodynamic process.

Newton's laws of motion describe force and acceleration. Friction opposes motion. Circular motion needs a
centripetal force. Newton's second law gives force equals mass times acceleration.
`

const session = (): BuddySession => {
  const units = buildUnits(parseUnits(SYLLABUS), MATERIAL, (i) => `u${i}`)
  return { units, messages: [], step: 0, weakSkills: [], sources: [{ name: 'notes.pdf', kind: 'material', words: 120 }] }
}

describe('parseUnits', () => {
  it('reads headings, inline subtopics, following lines and marks', () => {
    const units = parseUnits(SYLLABUS)
    expect(units.map((u) => u.name)).toEqual([
      'Unit 1: Kinematics',
      'Unit 2: Laws of Motion',
      'Unit 3: Thermodynamics',
      'Unit 4: Waves and Optics',
    ])
    expect(units[0]).toMatchObject({ marks: 15, subtopics: ['Motion in a straight line', 'Projectile motion'] })
    expect(units[1].subtopics).toEqual(["Newton's laws", 'Friction', 'Circular motion'])
  })
  it('falls back to one topic per line without headings', () => {
    expect(parseUnits('Algebra\nGeometry, Trigonometry').map((u) => u.name)).toEqual(['Algebra', 'Geometry', 'Trigonometry'])
  })
  it('guesses units from material headings', () => {
    const text = 'Chapter 1 Cells\nsome text here\n2. Genetics And Heredity\nmore text'
    expect(guessUnitsFromMaterial(text).map((u) => u.name)).toEqual(['Chapter 1 Cells', '2. Genetics And Heredity'])
  })
})

describe('buildUnits', () => {
  it('matches material to units and estimates hours, skills and focus', () => {
    const units = session().units
    const thermo = units[2]
    expect(thermo.materialWords).toBeGreaterThan(50)
    expect(thermo.skills).toEqual(expect.arrayContaining(['derivations', 'numericals']))
    expect(thermo.focus).toEqual(['First law', 'Entropy', 'Carnot cycle'])
    expect(units[3].materialWords).toBe(0)
    expect(units[0].marks).toBe(15)
    expect(units[0].marksKnown).toBe(true)
  })
})

describe('resolveUnits', () => {
  const units = parseUnits(SYLLABUS)
  it('understands numbers, lists, ranges, ordinals and names', () => {
    expect(resolveUnits('unit 3', units)).toEqual([2])
    expect(resolveUnits('units 1, 2 and 4', units)).toEqual([0, 1, 3])
    expect(resolveUnits('chapters 2-4', units)).toEqual([1, 2, 3])
    expect(resolveUnits('the first one', units)).toEqual([0])
    expect(resolveUnits('the last one', units)).toEqual([3])
    expect(resolveUnits('thermodynamics is scary', units)).toEqual([2])
    expect(resolveUnits('entropy', units)).toEqual([2])
    expect(resolveUnits('u2', units)).toEqual([1])
    const maths = parseUnits('Unit 1: Differential Calculus\nUnit 2: Vector Calculus')
    expect(resolveUnits('vector calculus is important', maths)).toEqual([1])
    expect(resolveUnits('calculus is hard', maths)).toEqual([0, 1])
  })
  it('handles everything / except / bare numbers', () => {
    expect(resolveUnits('everything', units)).toEqual([0, 1, 2, 3])
    expect(resolveUnits('all except unit 2', units)).toEqual([0, 2, 3])
    expect(resolveUnits('3 and 4', units, true)).toEqual([2, 3])
    expect(resolveUnits('3 and 4', units, false)).toEqual([])
    expect(resolveUnits('I need 3 hours', units, true)).toEqual([])
  })
})

describe('readIntent', () => {
  it('maps plain English to confidence', () => {
    expect(readIntent("haven't started").confidence).toBe(1)
    expect(readIntent('no idea about it').confidence).toBe(1)
    expect(readIntent('not confident').confidence).toBe(2)
    expect(readIntent("I'm weak in it").confidence).toBe(2)
    expect(readIntent('kinda okay').confidence).toBe(3)
    expect(readIntent('I know it well').confidence).toBe(4)
    expect(readIntent('super easy').confidence).toBe(5)
  })
  it('spots importance, drops, marks, hours and skills', () => {
    expect(readIntent('teacher said it is important').important).toBe(true)
    expect(readIntent('not important').low).toBe(true)
    expect(readIntent('removed from syllabus').dropped).toBe(true)
    expect(readIntent('carries 20 marks').marks).toBe(20)
    expect(readIntent('takes 3 hours').hours).toBe(3)
    expect(readIntent('bad at numericals').skills).toEqual(['numericals'])
  })
})

describe('clauses', () => {
  it('splits by intent but keeps lists together', () => {
    expect(clauses('unit 1 is done, unit 4 I have never seen')).toEqual(['unit 1 is done', 'unit 4 I have never seen'])
    expect(clauses('units 1, 2 are done but 3 is hard')).toEqual(['units 1, 2 are done', '3 is hard'])
  })
})

describe('understand', () => {
  it('runs the interview and updates units', () => {
    let s = session()
    let turn = understand(s, '3 and 4')
    expect(turn.session.step).toBe(1)
    expect(turn.session.units[2].confidence).toBe(1)
    expect(turn.session.units[3].confidence).toBe(1)
    expect(replyFor(s, turn, '3 and 4')).toMatch(/Which ones are you actually good at/)
    s = turn.session

    turn = understand(s, 'unit 1 is easy, friction is okay')
    expect(turn.session.units[0].confidence).toBe(5)
    expect(turn.session.units[1].confidence).toBe(3)
    s = turn.session

    const before = s.units[1].marks
    turn = understand(s, 'sir said unit 2 is important and unit 4 is removed')
    expect(turn.session.units[1].teacherHint).toBe(true)
    expect(turn.session.units[1].marks).toBe(Math.round(before * 1.5))
    expect(turn.session.units[3].skipped).toBe(true)
    s = turn.session

    const thermoHours = s.units[2].hours
    turn = understand(s, "I'm terrible at derivations")
    expect(turn.session.weakSkills).toEqual(['derivations'])
    expect(turn.session.units[2].hours).toBeGreaterThan(thermoHours)
    expect(turn.session.units[2].focus[0]).toBe('Practise derivations')
    expect(turn.session.step).toBe(4)
    s = turn.session

    const topics = toTopics(s)
    expect(topics.map((t) => t.name)).toEqual(['Unit 1: Kinematics', 'Unit 2: Laws of Motion', 'Unit 3: Thermodynamics'])
    expect(topics[1].why).toMatch(/teacher hinted/)
    expect(topics[2].why).toMatch(/haven't started/)
  })

  it('matches short unit names and never drops the wrong unit', () => {
    let s = session()
    s = understand(s, 'none').session
    s = understand(s, 'none').session
    const turn = understand(s, "ma'am said unit 3 will surely come and waves is removed from syllabus")
    expect(turn.session.units[2]).toMatchObject({ teacherHint: true, skipped: false })
    expect(turn.session.units[3].skipped).toBe(true)
    // A clause with no unit and no pronoun doesn't borrow the last unit.
    const vague = understand(s, 'unit 2 is fine. the syllabus got removed partly')
    expect(vague.session.units.filter((u) => u.skipped)).toEqual([])
  })

  it('treats "nothing specific" / "no hints" as a plain no, not as every unit', () => {
    let s = { ...session(), step: 2 }
    s = understand(s, 'no hints').session
    expect(s.step).toBe(3)
    const after = understand(s, 'nothing specific').session
    expect(after.step).toBe(4)
    expect(after.units.map((u) => u.confidence)).toEqual(s.units.map((u) => u.confidence))
    // A real answer that starts with "no" still counts.
    expect(understand({ ...session(), step: 1 }, 'no idea about unit 3').session.units[2].confidence).toBe(1)
  })

  it('accepts "none" to move on and asks again when confused', () => {
    const s = session()
    const none = understand(s, 'none')
    expect(none.session.step).toBe(1)
    const confused = understand(s, 'banana')
    expect(confused.session.step).toBe(0)
    expect(replyFor(s, confused, 'banana')).toMatch(/couldn't tell which unit/)
  })

  it('rescales marks to a stated paper total', () => {
    const turn = understand(session(), 'the exam is 100 marks total')
    expect(turn.session.units.reduce((a, u) => a + u.marks, 0)).toBeGreaterThanOrEqual(98)
    expect(turn.session.units.reduce((a, u) => a + u.marks, 0)).toBeLessThanOrEqual(102)
  })

  it('writes an intro that lists the units', () => {
    expect(introFor(session())).toMatch(/Found 4 units/)
  })
})

describe('chat and plan stay in sync', () => {
  let n = 0
  const id = () => `m${++n}`

  it('marks a unit done from chat once the plan exists, and the plan follows', () => {
    let s = session()
    s = { ...s, step: 4 }
    const before = understand(s, 'finished unit 1')
    expect(before.session.units[0].finished).toBeUndefined() // not linked yet: just confidence
    s = checkIn(s, id)
    expect(s.linked).toBe(true)
    expect(s.messages.at(-1)?.text).toMatch(/Welcome back/)
    expect(checkIn(s, id).messages.length).toBe(s.messages.length) // no duplicate greeting
    const turn = understand(s, 'finished unit 1 but unit 2 is harder than I thought')
    expect(turn.session.units[0].finished).toBe(true)
    expect(turn.session.units[1].confidence).toBe(2)
    expect(replyFor(s, turn, 'x')).toMatch(/Plan updated/)
    const topics = mergeTopics([], turn.session, 123)
    expect(topics[0]).toMatchObject({ done: true, doneAt: 123 })
  })

  it('pushes plan edits back into the chat and keeps progress', () => {
    const s = checkIn(session(), id)
    let topics = mergeTopics([], s, 0)
    topics = topics.map((t, i) => (i === 0 ? { ...t, studiedMin: 25, marks: 40 } : t)).filter((_, i) => i !== 3)
    topics.push({ id: 'manual', name: 'Formula sheet', marks: 5, hours: 1, confidence: 3, done: false })
    const synced = syncFromTopics(s, topics)
    expect(synced.units[0].marks).toBe(40)
    expect(synced.units[3].skipped).toBe(true)
    expect(synced.units.at(-1)?.name).toBe('Formula sheet')
    const back = mergeTopics(topics, synced, 0)
    expect(back.map((t) => t.name)).toContain('Formula sheet')
    expect(back[0].studiedMin).toBe(25)
    expect(back).toHaveLength(topics.length)
  })

  it('gives a chat to plans that never had one', () => {
    const s = sessionFromTopics([{ id: 'a', name: 'Unit 1: Algebra', marks: 10, hours: 1, confidence: 2, done: false }], id)
    expect(s.linked).toBe(true)
    expect(s.messages[0].text).toMatch(/1 topic from the plan/)
    expect(understand(s, 'finished algebra').session.units[0].finished).toBe(true)
  })

  it('does not treat "not finished" as done', () => {
    const s = checkIn(session(), id)
    expect(understand(s, "haven't finished unit 1").session.units[0].finished).toBeUndefined()
  })
})
