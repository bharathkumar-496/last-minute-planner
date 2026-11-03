import { describe, expect, it } from 'vitest'
import { buildUnits, cleanCollege, extractCode, splitCollege, parseUnits, understand, COLLEGE_STEP, QUESTIONS, type BuddySession } from './buddy'
import {
  analysePapers,
  applyReport,
  archiveQueries,
  detectYear,
  insightsFor,
  looksLikePaper,
  rankCandidates,
  searchLinks,
  splitQuestions,
  styleOf,
  subjectTerms,
} from './pyq'

// Shaped like real OCR'd papers: cover-page noise, course outcomes, MCQ options, lost numbering.
const paper = (year: number, extra: string) => `Question Paper Code : 30069
B.E./B.Tech. DEGREE EXAMINATIONS, APRIL/MAY ${year}.
Second Semester
Time : 3 hours Maximum : 100 marks
CO - Course Outcomes
Explain the fundamental concepts of thermodynamics.
Answer ALL questions.
PART - A (10 x 2 = 20 marks)
Define entropy and state its unit.
Which of the following is a state function?
(A) work
(B) heat
State Newton's second law of motion.
PART - B (5 x 16 = 80 marks)
11. (a) Derive the efficiency of a Carnot engine working between two reservoirs. (16)
OR
(b) Explain the first law of thermodynamics with a neat diagram.
12. (a) A projectile is fired at 30 degrees with velocity 20 m/s. Calculate the maximum height and range.
${extra}`

const SYLLABUS = `Unit 1: Kinematics - Projectile motion, Motion in a straight line
Unit 2: Laws of Motion - Newton's laws, Friction
Unit 3: Thermodynamics - First law, Entropy, Carnot cycle
Unit 4: Waves and Optics - Interference, Diffraction`

const units = () => buildUnits(parseUnits(SYLLABUS), '', (i) => `u${i}`)

describe('splitting real-looking papers', () => {
  const qs = splitQuestions(paper(2024, ''))
  it('keeps questions and drops cover-page noise, outcomes and MCQ options', () => {
    expect(qs).toContain('Define entropy and state its unit.')
    expect(qs.some((q) => q.startsWith('Derive the efficiency of a Carnot engine'))).toBe(true)
    expect(qs.some((q) => /course outcomes|fundamental concepts/i.test(q))).toBe(false)
    expect(qs.some((q) => /^\(?A\)? work/.test(q))).toBe(false)
    expect(qs.some((q) => /Maximum : 100/.test(q))).toBe(false)
  })
  it('detects the year, the question style, and real papers', () => {
    expect(detectYear({ name: 'x.pdf', text: paper(2023, '') })).toBe(2023)
    expect(detectYear({ name: 'thermo 2019.pdf', text: 'no date here' })).toBe(2019)
    expect(styleOf('Derive the efficiency of a Carnot engine')).toBe('derive')
    expect(styleOf('Calculate the maximum height')).toBe('numerical')
    expect(styleOf('Write a program to sort an array')).toBe('program')
    expect(looksLikePaper(paper(2024, ''))).toBe(true)
    expect(looksLikePaper('Chapter 1. Thermodynamics is the study of heat. It has many laws.')).toBe(false)
  })
})

describe('analysePapers', () => {
  const papers = [
    { name: 'May 2022', text: paper(2022, 'Explain interference of light with a diagram.') },
    { name: 'May 2023', text: paper(2023, 'Derive an expression for the efficiency of the Carnot engine.') },
    { name: 'May 2024', text: paper(2024, 'Compare static and kinetic friction.') },
  ]
  const report = analysePapers(papers, units())

  it('counts how often each unit appears and finds repeats across years', () => {
    const thermo = report.units.find((u) => u.unitId === 'u2')!
    expect(thermo.papers).toBe(3)
    expect(report.units.find((u) => u.unitId === 'u3')!.papers).toBe(1)
    const carnot = report.repeats.find((r) => /carnot/i.test(r.text))!
    expect(carnot.papers).toBe(3)
    expect(carnot.years).toEqual([2022, 2023, 2024])
    expect(carnot.unitId).toBe('u2')
    expect(report.papers.map((p) => p.year)).toEqual([2022, 2023, 2024])
  })

  it('uses question share when there is only one paper', () => {
    const one = analysePapers([papers[0]], units())
    const text = insightsFor(one)
    expect(text).toMatch(/Unit 3: Thermodynamics got \d+ of the \d+ questions/)
    expect(text).not.toMatch(/1 of 1/)
    expect(one.hotTopics.every((t) => !t.includes(' '))).toBe(true)
  })

  it('writes mind-blowing but true insights', () => {
    const text = insightsFor(report)
    expect(text).toMatch(/X-rayed 3 past papers \(2022–2024\)/)
    expect(text).toMatch(/Unit 3: Thermodynamics showed up in 3 of 3 papers/)
    expect(text).toMatch(/Repeat offenders/)
    expect(text).toMatch(/×3 \(2022–2024\)/)
  })

  it('re-weights units by the evidence, but never overrides stated marks', () => {
    const before = units()
    before[0].marksKnown = true
    const after = applyReport(before, report)
    const thermo = after.find((u) => u.id === 'u2')!
    expect(thermo.marks).toBeGreaterThan(before[2].marks)
    expect(after.find((u) => u.id === 'u3')!.marks).toBeLessThan(before[3].marks)
    expect(thermo.pyq).toEqual({ papers: 3, of: 3 })
    expect(thermo.focus[0]).toMatch(/^Repeat Q: /)
    expect(after[0].marks).toBe(before[0].marks)
    // Running it again (new papers, reload) never stacks the boost.
    expect(applyReport(after, report).find((u) => u.id === 'u2')!.marks).toBe(thermo.marks)
  })
})

describe('searching', () => {
  it('builds precise archive queries and useful search links', () => {
    expect(subjectTerms('Engineering Maths II')).toEqual(['engineering', 'mathematics'])
    const q = archiveQueries({ subject: 'Physics', college: 'Anna University', code: 'PH3151' })
    expect(q[0]).toBe('"PH3151" AND mediatype:texts')
    expect(q).toHaveLength(3)
    const links = searchLinks({ subject: 'Physics', college: 'Anna University', code: 'PH3151' })
    expect(links[0].url).toContain(encodeURIComponent('Anna University Physics previous year question papers filetype:pdf'))
    expect(links.some((l) => l.url.startsWith('https://www.youtube.com/results'))).toBe(true)
  })
  it('ranks real papers above noise', () => {
    const ranked = rankCandidates(
      [
        { identifier: 'cia-report', title: 'CIA Reading Room report' },
        { identifier: 'annauniv-physics', title: 'Engineering Physics - May 2025 Question Paper' },
        { identifier: 'annauniv-physics', title: 'duplicate' },
      ],
      { subject: 'Engineering Physics', college: 'Anna University' },
    )
    expect(ranked.map((c) => c.identifier)).toEqual(['annauniv-physics'])
  })
})

describe('Buddy asks about college and code', () => {
  const base = (): BuddySession => ({ units: units(), messages: [], step: COLLEGE_STEP, weakSkills: [], sources: [] })

  it('reads college and code, then starts the hunt', () => {
    let turn = understand(base(), "i'm in anna university, b.e mech sem 2")
    expect(turn.session.profile?.college).toBe('Anna University')
    expect(turn.session.profile?.course).toBe('B.E Mech Sem 2')
    expect(turn.reply).toMatch(/subject code/)
    turn = understand(turn.session, 'its MA3151')
    expect(turn.session.profile?.code).toBe('MA3151')
    expect(turn.hunt).toBe(true)
    expect(turn.session.step).toBe(QUESTIONS.length)
  })
  it('takes both at once, skips cleanly, and hunts on request later', () => {
    expect(understand(base(), 'VTU, code 18MAT21').hunt).toBe(true)
    const skipped = understand(base(), 'skip')
    expect(skipped.session.step).toBe(QUESTIONS.length)
    expect(understand(skipped.session, 'find my past papers').session.step).toBe(COLLEGE_STEP)
    const known = { ...skipped.session, profile: { college: 'VTU' } }
    expect(understand(known, 'can you find previous year papers?').hunt).toBe(true)
  })
  it('separates the college from the course', () => {
    expect(splitCollege("anna university, B.E civil sem 2")).toEqual({ college: 'Anna University', course: 'B.E civil sem 2' })
    expect(splitCollege('VIT Vellore btech cse 2nd year')).toEqual({ college: 'VIT Vellore', course: 'btech cse 2nd year' })
    expect(splitCollege('Delhi University')).toEqual({ college: 'Delhi University' })
  })

  it('parses codes and colleges', () => {
    expect(extractCode('code is ma 3151')).toBe('MA3151')
    expect(extractCode('18MAT21')).toBe('18MAT21')
    expect(extractCode('anna university')).toBeUndefined()
    expect(cleanCollege('I study at IIT Bombay.')).toBe('IIT Bombay')
    expect(cleanCollege('university of mumbai')).toBe('University of Mumbai')
    expect(cleanCollege('vtu belgaum')).toBe('VTU Belgaum')
  })
})
