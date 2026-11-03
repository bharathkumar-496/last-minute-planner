// Real conversations, word for word, so the Buddy keeps understanding them.
import { describe, expect, it } from 'vitest'
import {
  COLLEGE_STEP,
  QUESTIONS,
  buildUnits,
  checkIn,
  chipsFor,
  parseUnits,
  readIntent,
  replyFor,
  tidyCase,
  understand,
  type BuddySession,
} from './buddy'

const SYLLABUS = `UNIT 1: FUZZY SETS AND RELATIONS 9 Hrs
UNIT 2: FUZZY LOGIC AND INFERENCE 9 Hrs
UNIT 3: NEURO FUZZY 9 Hrs
UNIT 4: GENETIC ALGORITHM 9 Hrs
UNIT 5: ARTIFICIAL INTELLIGENCE 9 Hrs`

let n = 0
const id = () => `m${++n}`
const session = (over: Partial<BuddySession> = {}): BuddySession => ({
  units: buildUnits(parseUnits(SYLLABUS), '', (i) => `u${i}`),
  messages: [],
  step: QUESTIONS.length,
  weakSkills: [],
  sources: [],
  linked: true,
  ...over,
})
const say = (s: BuddySession, text: string) => {
  const turn = understand(s, text)
  return { ...turn, text: replyFor(s, turn, text) }
}

describe('syllabus written the usual Indian-university way', () => {
  it('drops contact hours and tidies ALL CAPS', () => {
    expect(parseUnits(SYLLABUS).map((u) => u.name)).toEqual([
      'Unit 1: Fuzzy Sets and Relations',
      'Unit 2: Fuzzy Logic and Inference',
      'Unit 3: Neuro Fuzzy',
      'Unit 4: Genetic Algorithm',
      'Unit 5: Artificial Intelligence',
    ])
    expect(parseUnits('UNIT III: DATA STRUCTURES (12 Periods)')[0].name).toBe('Unit III: Data Structures')
    expect(tidyCase('ARTIFICIAL INTELLIGENCE AND ML')).toBe('Artificial Intelligence and ML')
    expect(tidyCase('Neuro Fuzzy in AI')).toBe('Neuro Fuzzy in AI')
  })
})

describe('the conversation from the screenshot', () => {
  it('comes back to the unanswered code question and understands "SCSB3616 my subjec code"', () => {
    let s = session({ step: COLLEGE_STEP })
    s = understand(s, 'Sathyabama').session
    expect(s.profile?.college).toBe('Sathyabama')
    expect(QUESTIONS[s.step].kind).toBe('code')

    // Left for the plan, came back.
    s = checkIn(s, id)
    expect(s.step).toBe(COLLEGE_STEP + 1)
    expect(s.messages.at(-1)?.text).toMatch(/^Welcome back! Quick one.*subject code/s)

    const turn = say(s, 'SCSB3616 my subjec code')
    expect(turn.session.profile?.code).toBe('SCSB3616')
    expect(turn.hunt).toBe(true)
    expect(turn.session.weakSkills).toEqual([]) // "code" is not "weak at programs"
    expect(turn.text).toMatch(/SCSB3616, noted/)
  })

  it('takes a bare code at any time, and asks for the college if it is missing', () => {
    const withCollege = say(session({ profile: { college: 'Sathyabama' } }), 'SCSB3616')
    expect(withCollege.hunt).toBe(true)
    const noCollege = say(session(), 'SCSB3616')
    expect(noCollege.session.profile?.code).toBe('SCSB3616')
    expect(noCollege.session.step).toBe(COLLEGE_STEP)
    expect(noCollege.text).toMatch(/which college/i)
  })

  it('never reads "code" as programming', () => {
    expect(readIntent('my subject code').skills).toEqual([])
    expect(readIntent("I'm bad at coding").skills).toEqual(['programs'])
  })

  it('still understands units while the college question is open', () => {
    const turn = say(session({ step: COLLEGE_STEP }), 'unit 2 is so hard')
    expect(turn.session.units[1].confidence).toBe(2)
    expect(turn.session.profile?.college).toBeUndefined()
    expect(turn.session.step).toBe(COLLEGE_STEP)
  })
})

describe('answers questions instead of a canned line', () => {
  it('what to study first, what matters most, how much is left, what it can do', () => {
    const s = session()
    s.units[3] = { ...s.units[3], confidence: 1, marks: 20 }
    expect(say(s, 'what should I study first?').text).toMatch(/^Start with Unit 4: Genetic Algorithm/)
    expect(say(s, 'which unit is most important?').text).toMatch(/^Biggest marks: Unit 4: Genetic Algorithm \(20\)/)
    expect(say(s, 'how much is left?').text).toMatch(/^5 units left, about \d+(\.5)? hours/)
    expect(say(s, 'what can you do').text).toMatch(/I can:/)
    expect(say(s, 'thanks!').text).toMatch(/Anytime/)
  })
})

describe('follow-ups that remember what was half-said', () => {
  it('"unit 3" alone → asks about it → "its really hard" lands on unit 3', () => {
    const first = say(session(), 'unit 3')
    expect(first.text).toMatch(/^What about Unit 3: Neuro Fuzzy\? Done, hard, or not started yet\?/)
    expect(chipsFor(first.session)).toEqual(['unit 3 is done', 'unit 3 is hard', "Haven't started unit 3", 'unit 3 is important'])
    const second = understand(first.session, 'its really hard')
    expect(second.session.units[2].confidence).toBe(2)
    expect(second.session.pendingUnitIds).toBeUndefined()
  })

  it('"its so confusing" → which unit? → "4" finishes the thought', () => {
    const first = say(session(), 'its so confusing')
    expect(first.text).toMatch(/Which unit is that about/)
    expect(chipsFor(first.session)).toContain('unit 4')
    const second = understand(first.session, 'unit 4')
    expect(second.session.units[3].confidence).toBe(2)
  })

  it('suggests real examples when lost', () => {
    expect(say(session(), 'banana').text).toMatch(/"unit 1 is done"/)
  })
})

describe('typos', () => {
  it('forgives misspelt units and words', () => {
    expect(understand(session(), 'finshed nuero fuzy').session.units[2].finished).toBe(true)
    const hint = understand(session(), 'techer said genetic algoritm is importnt').session
    expect(hint.units[3].teacherHint).toBe(true)
    expect(understand(session(), 'havent started artifical inteligence').session.units[4].confidence).toBe(1)
  })
})
