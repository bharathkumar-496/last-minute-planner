// Study Buddy: a free, offline, rule-based assistant. It reads syllabus and
// study-material text, works out units, and understands plain-English chat
// ("haven't started unit 3", "teacher said unit 2 is important") to adjust
// marks, hours and confidence. Pure functions only, so everything is testable.

import { parseSyllabus, type Confidence, type Topic } from './planner'
import type { PyqReport } from './pyq'

export type Skill = 'numericals' | 'derivations' | 'diagrams' | 'definitions' | 'theory' | 'formulas' | 'programs'

export interface BuddyUnit {
  id: string
  name: string
  subtopics: string[]
  marks: number
  marksKnown: boolean
  hours: number
  confidence: Confidence
  teacherHint: boolean
  lowPriority: boolean
  skipped: boolean
  focus: string[]
  skills: Skill[]
  /** Words of study material matched to this unit. */
  materialWords: number
  /** Marked complete, in chat or on the plan. */
  finished?: boolean
  /** How often it appeared in past papers. */
  pyq?: { papers: number; of: number }
  /** Marks before past papers re-weighted them, so re-analysis never compounds. */
  baseMarks?: number
}

export interface BuddyMessage {
  id: string
  from: 'buddy' | 'you'
  text: string
  /** Rich messages: the past-paper hunt and its report. */
  card?: 'pyq-hunt' | 'pyq-report'
  /** Set once a hunt finishes, so it never re-runs on reload. */
  hunt?: { status: 'found' | 'none' | 'offline'; college?: string; papers: Array<{ name: string; year: number | null; url?: string }> }
}

export interface BuddySource {
  name: string
  kind: 'syllabus' | 'material' | 'pyq'
  words: number
}

export interface BuddySession {
  units: BuddyUnit[]
  messages: BuddyMessage[]
  /** Index into QUESTIONS; QUESTIONS.length means the interview is done. */
  step: number
  weakSkills: Skill[]
  sources: BuddySource[]
  /** Once the plan is built from this chat, every message keeps it in sync. */
  linked?: boolean
  profile?: { college?: string; course?: string; code?: string; subjectName?: string; fromSyllabus?: boolean }
  pyqReport?: PyqReport
  /** Units the buddy just asked about ("What about Unit 3?"), so "it's hard" lands there. */
  pendingUnitIds?: string[]
  /** Something said without a unit ("it's so hard"), waiting for "unit 3". */
  pendingIntent?: string
}

// ---------------------------------------------------------------------------
// Text helpers

const STOPWORDS = new Set(
  `a an the and or of to in on for with by from at as is are was were be been being this that these those it its
  into about over under between through during before after above below up down out off then than so such can
  will would should could may might must do does did done have has had not no nor only own same too very just
  also each other some any all both few more most which who whom whose what when where why how there here their
  they them we our you your he she his her i me my unit units chapter chapters module modules lesson part section
  introduction intro basics basic overview concept concepts topic topics using use used etc e.g i.e page fig figure
  example examples given let find note chapter`.split(/\s+/),
)

const words = (text: string) => text.toLowerCase().match(/[a-z][a-z'-]+/g) ?? []
const stem = (w: string) => w.replace(/'s$/, '').replace(/(ies)$/, 'y').replace(/(?<=[a-z]{3})s$/, '')

export function keywordsOf(text: string): string[] {
  return [...new Set(words(text).filter((w) => w.length >= 4 && !STOPWORDS.has(w)).map(stem))]
}

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 }
function romanToInt(s: string): number {
  let total = 0
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]] ?? 0
    const next = ROMAN[s[i + 1]] ?? 0
    total += v < next ? -v : v
  }
  return total
}

const HEADING = /^\s*(?:unit|chapter|module|lesson|part|section)\s*[-–:.]?\s*(\d+|[ivxlc]+)\b/i
const INLINE_HEADING = /(?=\b(?:unit|chapter|module|lesson)\s*[-–:.]?\s*(?:\d+|[ivxlc]+)\b)/gi
const MARKS = /\(?\s*(\d{1,3})\s*(?:marks?|m|pts?|points?)\s*\)?/i

/** "9 Hrs", "(9 hours)", "12 Periods", "L 9" after a unit title: teaching time, not part of the name. */
const CONTACT_HOURS = /\(?\s*\b(?:\d{1,2}\s*(?:hrs?|hours?|periods?|lectures?)\b\.?|L\s*\d{1,2}\b)\s*\)?/gi
const SMALL_WORDS = new Set(['and', 'of', 'the', 'in', 'to', 'for', 'with', 'on', 'a', 'an', 'or', 'by'])
const ROMAN_NUMERAL = /^(i{1,3}|iv|v|vi{1,3}|ix|x)$/i

/** "UNIT III: NEURO FUZZY AND AI" → "Unit III: Neuro Fuzzy and AI". Mixed-case text is left alone. */
export function tidyCase(text: string): string {
  if (!/[A-Z]{3}/.test(text) || text !== text.toUpperCase()) return text
  return text.replace(/[A-Za-z][A-Za-z']*/g, (w: string, i: number) => {
    if (ROMAN_NUMERAL.test(w)) return w.toUpperCase()
    const lower = w.toLowerCase()
    if (i > 0 && SMALL_WORDS.has(lower)) return lower
    if (w.length <= 3 && !/[AEIOU]/.test(w.slice(1))) return w // AI, ML, DSP: acronyms stay
    return lower[0].toUpperCase() + lower.slice(1)
  })
}

export function unitNumber(name: string): number | null {
  const m = name.match(HEADING)
  if (!m) return null
  return /^\d+$/.test(m[1]) ? Number(m[1]) : romanToInt(m[1].toLowerCase())
}

const splitList = (s: string) =>
  s
    .split(/[,;]|\s+[•·|]\s+/)
    .map((x) => x.replace(/^\s*(?:[-*•·>]+|\d+[.)])\s*/, '').replace(/[\s.:–-]+$/, '').trim())
    .filter((x) => x.length > 1)

// ---------------------------------------------------------------------------
// Syllabus → units

export interface ParsedUnit {
  name: string
  marks?: number
  subtopics: string[]
}

/**
 * Lines that start with "Unit/Chapter N" open a unit; the lines under them are
 * its subtopics. A syllabus with no headings is treated as one topic per line
 * or comma.
 */
export function parseUnits(text: string): ParsedUnit[] {
  const chunks = text
    .split(/\r?\n/)
    .flatMap((line) => line.split(INLINE_HEADING))
    .map((c) => c.trim())
    .filter(Boolean)

  if (!chunks.some((c) => HEADING.test(c))) {
    return parseSyllabus(text).map((p) => ({ name: p.name, marks: p.marks, subtopics: [] }))
  }

  const units: ParsedUnit[] = []
  for (const chunk of chunks) {
    let line = chunk
    let marks: number | undefined
    const m = line.match(MARKS)
    if (m && /\d\s*(marks?|m|pts?|points?)\b/i.test(m[0])) {
      marks = Number(m[1])
      line = line.replace(m[0], ' ').replace(/\s+/g, ' ').trim()
    }
    if (HEADING.test(line)) {
      const head = line.match(HEADING)![0].trim()
      const rest = line.slice(line.match(HEADING)![0].length).replace(/^[\s:.\-–]+/, '')
      // "Unit 3: Thermo – First law, Entropy" → title + subtopics
      const sep = rest.search(/\s[–-]\s|:\s/)
      let title = rest
      let subtopics: string[] = []
      if (sep > 0) {
        title = rest.slice(0, sep).trim()
        subtopics = splitList(rest.slice(sep).replace(/^\s*[–:-]\s*/, ''))
      } else if (rest.includes(',')) {
        subtopics = splitList(rest)
      }
      title = tidyCase(title.replace(CONTACT_HOURS, ' ').replace(/\s+/g, ' ').trim())
      const cleanHead = tidyCase(head.replace(/\s+/g, ' '))
      const name = `${cleanHead}${title ? `: ${title}` : ''}`.replace(/[\s:.,–-]+$/, '').slice(0, 80)
      const subs = subtopics.map((t) => tidyCase(t.replace(CONTACT_HOURS, ' ').replace(/\s+/g, ' ').trim())).filter((t) => t.length > 1)
      units.push({ name: name.charAt(0).toUpperCase() + name.slice(1), marks, subtopics: subs })
    } else if (units.length) {
      const last = units[units.length - 1]
      last.subtopics.push(...splitList(line))
      if (marks !== undefined && last.marks === undefined) last.marks = marks
    }
  }
  return units
}

/** No syllabus? Guess units from headings inside the study material. */
export function guessUnitsFromMaterial(text: string): ParsedUnit[] {
  const seen = new Set<string>()
  const out: ParsedUnit[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.length < 4 || line.length > 70) continue
    const isHeading = HEADING.test(line) || /^\d{1,2}[.)]?\s+[A-Z][A-Za-z ,&-]{3,}$/.test(line)
    if (!isHeading) continue
    const name = line.replace(/[\s:.,–-]+$/, '')
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, subtopics: [] })
  }
  return out.slice(0, 15)
}

// ---------------------------------------------------------------------------
// Material → hours, focus, skills

const SKILL_CUES: Record<Skill, RegExp> = {
  numericals: /\b(numericals?|calculate|calculation|problems?|sums?|solve|find the value|evaluate)\b/gi,
  derivations: /\b(derive|derivations?|derived|proofs?|prove|show that)\b/gi,
  diagrams: /\b(diagrams?|draw|sketch|labelled|labeled|graph)\b/gi,
  definitions: /\b(define|definitions?|defined as|meaning of|terms?)\b/gi,
  theory: /\b(explain|discuss|describe|theory|concepts?)\b/gi,
  formulas: /\b(formulas?|formulae|equations?)\b/gi,
  programs: /\b(programs?|code|algorithms?|functions?|syntax|implement)\b/gi,
}

export const SKILL_LABEL: Record<Skill, string> = {
  numericals: 'numericals',
  derivations: 'derivations',
  diagrams: 'diagrams',
  definitions: 'definitions',
  theory: 'theory answers',
  formulas: 'formulas',
  programs: 'programs',
}

const WEAK_CUES: Skill[] = ['theory', 'definitions', 'programs']

/** Roughly how many words of material a student gets through in an hour of real study. */
export const WORDS_PER_STUDY_HOUR = 1500

function chunksOf(text: string): string[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const out: string[] = []
  for (const p of paras) {
    const sentences = p.split(/(?<=[.!?])\s+/)
    let buf: string[] = []
    let n = 0
    for (const s of sentences) {
      buf.push(s)
      n += wordCount(s)
      if (n >= 80) {
        out.push(buf.join(' '))
        buf = []
        n = 0
      }
    }
    if (buf.length) out.push(buf.join(' '))
  }
  return out
}

function topPhrases(texts: string[], exclude: Set<string>, limit: number): string[] {
  const counts = new Map<string, number>()
  for (const t of texts) {
    const ws = words(t)
    for (let i = 0; i < ws.length - 1; i++) {
      const a = ws[i]
      const b = ws[i + 1]
      if (a.length < 4 || b.length < 4 || STOPWORDS.has(a) || STOPWORDS.has(b)) continue
      if (exclude.has(stem(a)) && exclude.has(stem(b))) continue
      const key = `${a} ${b}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((x, y) => y[1] - x[1])
    .slice(0, limit)
    .map(([k]) => k.replace(/\b\w/g, (c) => c.toUpperCase()))
}

const roundHalf = (n: number) => Math.round(n * 2) / 2
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function buildUnits(parsed: ParsedUnit[], material: string, makeId: (i: number) => string): BuddyUnit[] {
  const chunks = material.trim() ? chunksOf(material) : []
  const unitKeys = parsed.map((u) => keywordsOf(`${u.name} ${u.subtopics.join(' ')}`))
  const assigned: string[][] = parsed.map(() => [])

  for (const chunk of chunks) {
    const chunkWords = new Set(words(chunk).map(stem))
    let best = -1
    let bestScore = 0
    unitKeys.forEach((keys, i) => {
      const score = keys.reduce((a, k) => a + (chunkWords.has(k) ? 1 : 0), 0)
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    })
    const needed = unitKeys[best]?.length <= 2 ? 1 : 2
    if (best >= 0 && bestScore >= needed) assigned[best].push(chunk)
  }

  const counted = assigned.map((list) => list.reduce((a, c) => a + wordCount(c), 0))
  const withMaterial = counted.filter((w) => w > 0)
  const avg = withMaterial.length ? withMaterial.reduce((a, b) => a + b, 0) / withMaterial.length : 0

  return parsed.map((u, i) => {
    const text = `${u.name} ${u.subtopics.join(' ')} ${assigned[i].join(' ')}`
    // Weak cues ("explain", "terms", "function") need repeats; strong ones count once.
    const skills = (Object.keys(SKILL_CUES) as Skill[]).filter(
      (s) => (text.match(SKILL_CUES[s]) ?? []).length >= (assigned[i].length && WEAK_CUES.includes(s) ? 2 : 1),
    )
    const digitHeavy = assigned[i].length > 0 && (assigned[i].join(' ').match(/\d+\s*[=+×x*/-]\s*\d+/g) ?? []).length >= 3
    if (digitHeavy && !skills.includes('numericals')) skills.push('numericals')

    const words = counted[i]
    const hours = words > 0
      ? clamp(roundHalf(words / WORDS_PER_STUDY_HOUR + 0.25), 0.5, 8)
      : clamp(roundHalf(0.5 + 0.4 * u.subtopics.length), 1, 4)
    const marks = u.marks ?? (words > 0 && avg > 0 ? clamp(Math.round((10 * words) / avg), 5, 25) : 10)

    const exclude = new Set(keywordsOf(u.name))
    const focus = [...u.subtopics.slice(0, 3)]
    if (focus.length < 3) focus.push(...topPhrases(assigned[i], exclude, 3 - focus.length))

    return {
      id: makeId(i),
      name: u.name,
      subtopics: u.subtopics,
      marks,
      marksKnown: u.marks !== undefined,
      hours,
      confidence: 3,
      teacherHint: false,
      lowPriority: false,
      skipped: false,
      focus,
      skills,
      materialWords: words,
    }
  })
}

// ---------------------------------------------------------------------------
// Understanding chat messages

const ORDINALS: Record<string, number> = {
  first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5,
  sixth: 6, '6th': 6, seventh: 7, '7th': 7, eighth: 8, '8th': 8, ninth: 9, '9th': 9, tenth: 10, '10th': 10,
}
const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

/** Edit distance, capped: small typos ("nuero", "fuzy") still find their unit. */
function near(a: string, b: string): boolean {
  const limit = Math.max(a.length, b.length) >= 8 ? 2 : 1
  if (Math.abs(a.length - b.length) > limit) return false
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    if (Math.min(...row) > limit) return false
    prev = row
  }
  return prev[b.length] <= limit
}

const TYPOS: Array<[RegExp, string]> = [
  [/\b(dont|dnt)\b/gi, "don't"],
  [/\b(havent|havnt|hvnt|haven t)\b/gi, "haven't"],
  [/\b(didnt|didn t)\b/gi, "didn't"],
  [/\b(cant|cnt)\b/gi, "can't"],
  [/\b(im|i m)\b/gi, "i'm"],
  [/\b(finshed|finsihed|fnished|finised|finishd|fineshed)\b/gi, 'finished'],
  [/\b(complted|compelted|completd|competed)\b/gi, 'completed'],
  [/\b(startd|strated|stared it)\b/gi, 'started'],
  [/\b(techer|teachr|teacer|teahcer|tchr)\b/gi, 'teacher'],
  [/\b(importnt|importent|imporant|importamt|impotant)\b/gi, 'important'],
  [/\b(dificult|difficlt|difficut|dificlt)\b/gi, 'difficult'],
  [/\b(subjec|subjct|subj)\b/gi, 'subject'],
  [/\b(syllabs|sylabus|syllbus)\b/gi, 'syllabus'],
  [/\b(numaricals|numricals|numerical's)\b/gi, 'numericals'],
  [/\b(derivatons|derivasions)\b/gi, 'derivations'],
  [/\b(confusng|confuseing)\b/gi, 'confusing'],
  [/\b(pls|plz)\b/gi, 'please'],
]

export function fixTypos(text: string): string {
  return TYPOS.reduce((t, [re, to]) => t.replace(re, to), text)
}

const ALL = /\b(all|everything|every unit|whole (syllabus|thing|portion)|entire syllabus|anything|nothing)\b/
const EXCEPT = /\b(except|other than|apart from|besides|but not)\b/

/** Which units does this bit of text talk about? Returns indexes. */
export function resolveUnits(text: string, units: Pick<BuddyUnit, 'name' | 'subtopics'>[], allowBareNumbers = false): number[] {
  const t = text.toLowerCase()
  const byNumber = (n: number) => {
    const idx = units.findIndex((u) => unitNumber(u.name) === n)
    if (idx >= 0) return idx
    return n >= 1 && n <= units.length ? n - 1 : -1
  }
  const found = new Set<number>()

  // "unit 3", "units 1, 2 and 5", "chapters 2-4", "u3", "ch 2"
  const listRe = /\b(?:units?|chapters?|modules?|lessons?|ch|u)\s*[-.:#]?\s*((?:\d+|[ivx]+\b|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*(?:,|and|&|or|-|to|–)\s*(?:\d+|[ivx]+\b|one|two|three|four|five|six|seven|eight|nine|ten))*)/g
  for (const m of t.matchAll(listRe)) {
    const parts = m[1].split(/\s*(,|and|&|or)\s*/).filter((p) => p && !/^(,|and|&|or)$/.test(p))
    for (const part of parts) {
      const range = part.match(/^(\w+)\s*(?:-|to|–)\s*(\w+)$/)
      const toNum = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUM_WORDS[s] ?? romanToInt(s))
      if (range) {
        for (let n = toNum(range[1]); n <= toNum(range[2]); n++) found.add(byNumber(n))
      } else found.add(byNumber(toNum(part.trim())))
    }
  }
  // "the first one", "third unit", "last one"
  for (const [w, n] of Object.entries(ORDINALS)) {
    if (new RegExp(`\\b${w}\\b(?!\\s*(hour|hr|mark|time))`).test(t)) found.add(byNumber(n))
  }
  if (/\blast (one|unit|chapter)\b/.test(t)) found.add(units.length - 1)

  // Names and subtopics: "thermodynamics", "laplace". "Vector calculus" picks
  // Vector Calculus, not every unit with "calculus" in it: best score wins.
  const tw = new Set(words(t).map(stem))
  const typed = [...tw].filter((w) => w.length >= 4)
  const hit = (k: string) => tw.has(k) || (k.length >= 5 && typed.some((w) => near(w, k)))
  const scores = units.map((u) => {
    const keys = keywordsOf(u.name).filter(hit).length
    const subs = u.subtopics.filter((s) => s.length >= 5 && t.includes(s.toLowerCase())).length
    return keys + subs * 2
  })
  const best = Math.max(0, ...scores)
  if (best > 0) scores.forEach((sc, i) => sc === best && found.add(i))

  // Bare numbers when we just asked "which units?": "3 and 5"
  if (found.size === 0 && allowBareNumbers && !/\b(hours?|hrs?|marks?|minutes?|mins?|days?)\b/.test(t)) {
    for (const m of t.matchAll(/\b(\d{1,2})\b/g)) found.add(byNumber(Number(m[1])))
  }
  found.delete(-1)

  if (ALL.test(t)) {
    const all = units.map((_, i) => i)
    if (EXCEPT.test(t)) {
      const after = t.split(EXCEPT)[2] ?? ''
      const excluded = new Set(resolveUnits(after, units, true))
      return all.filter((i) => !excluded.has(i))
    }
    return all
  }
  return [...found].sort((a, b) => a - b)
}

/** Ordered: the first matching rule wins. */
const CONFIDENCE_RULES: Array<[RegExp, Confidence]> = [
  [/\b(not (even )?started|haven'?t (even )?(started|touched|opened|seen|read|studied)|didn'?t (start|touch|study|read)|never (seen|studied|read|done|touched|heard)|no idea|no clue|clueless|don'?t know (anything|it|this|that|them)?|zero|blank|lost|nothing)\b/, 1],
  [/\b(not|n'?t|never|no)\s+(\w+\s+)?(good|confident|comfortable|sure|strong|clear|great|ready)\b/, 2],
  [/\b(very good|very strong|could teach|piece of cake|nailed|mastered|master|expert|super easy|easy|100%|strong|confident|perfect)\b/, 5],
  [/\b(weak|struggl\w*|confus\w*|shaky|bad at|bad|hard(er)?|(more )?difficult|tough(er)?|worse|barely|rusty|forgot|a little|a bit|scared)\b/, 2],
  [/\b(okay|ok|average|half|partial\w*|some|somewhat|decent|kinda|kind of|sort of|so-so|meh|mid)\b/, 3],
  [/\b(good|know|known|done|finished|completed?|comfortable|studied|revised|covered|fine|solid|ready|clear)\b/, 4],
]

const DROPPED = /\b(removed|not in (the )?syllabus|excluded|cancel+ed|deleted|dropped|out of syllabus)\b/
const LOW = /\b(not important|unimportant|skip|won'?t come|wont come|not coming|optional|low weight(age)?|less important|rarely)\b/
const IMPORTANT = /\b(important|imp|teacher (said|told|mentioned|hinted|says)|(sir|ma'?am|prof\w*|lecturer|faculty) (said|told|mentioned|says)|will (surely |definitely )?come|always (comes|asked)|repeated|pyqs?|previous years?|high weight(age)?|more marks|heavy|must do|focus on|expected)\b/
const SKILL_WORDS: Array<[RegExp, Skill]> = [
  [/\b(numericals?|problems|sums|calculations?|maths? parts?)\b/, 'numericals'],
  [/\b(derivations?|proofs?|deriving)\b/, 'derivations'],
  [/\b(diagrams?|drawings?|figures)\b/, 'diagrams'],
  [/\b(definitions?|terms|terminology)\b/, 'definitions'],
  [/\b(theory|long answers?|essays?|concepts)\b/, 'theory'],
  [/\b(formulas?|formulae|equations)\b/, 'formulas'],
  [/\b(programs?|programming|coding)\b/, 'programs'],
]

export interface Understanding {
  confidence?: Confidence
  dropped?: boolean
  low?: boolean
  important?: boolean
  marks?: number
  hours?: number
  finished?: boolean
  skills: Skill[]
}

const FINISHED = /\b(finished|completed?|done with|wrapped up|ticked off|got through)\b/
const NOT_FINISHED = /(\bnot|n't|\bnever|\byet to)\s+(\w+\s+)?(finished|completed?|done)\b|\bunfinished\b/

export function readIntent(text: string): Understanding {
  const t = text.toLowerCase().replace(/[’`]/g, "'")
  const out: Understanding = { skills: [] }
  if (FINISHED.test(t) && !NOT_FINISHED.test(t)) out.finished = true
  if (DROPPED.test(t)) out.dropped = true
  else if (LOW.test(t)) out.low = true
  else if (IMPORTANT.test(t)) out.important = true
  for (const [re, level] of CONFIDENCE_RULES) {
    if (re.test(t)) {
      out.confidence = level
      break
    }
  }
  // "important" and "heavy" aren't about confidence; "more marks" isn't knowledge.
  if (out.important && out.confidence === 4 && !/\b(know|done|finished|studied|revised|covered)\b/.test(t)) delete out.confidence
  const marks = t.match(/\b(\d{1,3})\s*(?:marks?|m\b|pts?|points?)/) ?? t.match(/\bcarr(?:y|ies)\s+(\d{1,3})\b/)
  if (marks) out.marks = Number(marks[1])
  const hours = t.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/)
  const mins = t.match(/\b(\d{2,3})\s*(?:minutes?|mins?)\b/)
  if (hours) out.hours = Number(hours[1])
  else if (mins) out.hours = Number(mins[1]) / 60
  for (const [re, skill] of SKILL_WORDS) if (re.test(t)) out.skills.push(skill)
  return out
}

const hasIntent = (u: Understanding) =>
  u.confidence !== undefined || u.finished || u.dropped || u.low || u.important || u.marks !== undefined || u.hours !== undefined || u.skills.length > 0

/** Splits a message into clauses, each about its own units. */
export function clauses(text: string): string[] {
  const parts = text
    .split(/[.;!?\n]+|\b(?:but|whereas|however|although|though|while|plus|also)\b/i)
    .flatMap((p) => p.split(/,|\band\b|&/i))
    .map((p) => p.trim())
    .filter(Boolean)
  // A piece with no intent ("units 1") belongs with the next piece ("2 are done").
  const merged: string[] = []
  let carry = ''
  for (const p of parts) {
    const joined = carry ? `${carry}, ${p}` : p
    if (hasIntent(readIntent(p))) {
      merged.push(joined)
      carry = ''
    } else carry = joined
  }
  if (carry) {
    if (merged.length && !/\b(unit|chapter|module|\d)\b/i.test(carry)) merged[merged.length - 1] += `, ${carry}`
    else merged.push(carry)
  }
  return merged
}

// ---------------------------------------------------------------------------
// The interview

interface Question {
  kind?: 'college' | 'code'
  ask: (s: BuddySession) => string
  /** What a bare answer like "3 and 5" means at this step. */
  defaultIntent: Partial<Understanding>
  chips: string[]
}

export const QUESTIONS: Question[] = [
  {
    ask: () => "First up: which ones haven't you started at all? Be honest, I've seen worse. (e.g. \"Unit 3 and 5\", or \"none\")",
    defaultIntent: { confidence: 1 },
    chips: ['None, I started everything', "Haven't started anything 💀"],
  },
  {
    ask: () => 'Okay. Which ones are you actually good at?',
    defaultIntent: { confidence: 4 },
    chips: ['None really', 'I know all of them a bit'],
  },
  {
    ask: () => 'Did your teacher hint at anything important? Or did any unit get dropped from the syllabus?',
    defaultIntent: { important: true },
    chips: ['No hints', 'Previous year questions repeat a lot'],
  },
  {
    ask: () => 'Last one. Any type of question you struggle with? Numericals, derivations, diagrams, definitions, theory, programs?',
    defaultIntent: { confidence: 2 },
    chips: ['Numericals', 'Derivations', 'Nothing specific'],
  },
  {
    kind: 'college',
    ask: () =>
      "Now the fun part 😏 Which college or university are you in? Course and semester help too (like \"Anna University, B.E. Mech, sem 2\"). I'll go hunting for your previous year papers.",
    defaultIntent: {},
    chips: ['Skip this'],
  },
  {
    kind: 'code',
    ask: () => "Got a subject code? It's on your hall ticket or syllabus (like MA3151). It makes my search way sharper. Say \"skip\" if not.",
    defaultIntent: {},
    chips: ["Don't know it"],
  },
]

export const COLLEGE_STEP = QUESTIONS.findIndex((q) => q.kind === 'college')
const PYQ_REQUEST = /\b(pyqs?|previous years?|past (year )?papers?|question papers?|old papers?|find (the |my )?papers?|exam papers?)\b/i
const SUBJECT_CODE = /\b([A-Z]{2,4}\s?-?\d{1,2}[A-Z]?\d{2,3}[A-Z]?|\d{2}[A-Z]{2,4}\d{2,3})\b/i
const SKIP = /^\s*(skip|no+|nope|nah|na|none|don'?t know|dont know|idk|not sure|no idea|no code|later|pass)\b/i

export function extractCode(text: string): string | undefined {
  const m = text.match(SUBJECT_CODE)
  return m && /\d/.test(m[1]) && /[a-z]/i.test(m[1]) ? m[1].replace(/[\s-]/g, '').toUpperCase() : undefined
}

const COURSE_START = /,|\b(b\.?\s?e\b|b\.?\s?tech|b\.?\s?sc|b\.?\s?com|b\.?\s?a\b|m\.?\s?tech|m\.?\s?sc|mba|mbbs|bca|mca|diploma|sem(ester)?\b|\d(st|nd|rd|th) (year|sem)|year\b|class\b|grade\b|branch|dept|department)/i

/** "Anna University, B.E Mech sem 2" → college "Anna University", course "B.E Mech Sem 2". */
export function splitCollege(text: string): { college: string; course?: string } {
  const full = cleanCollege(text)
  const at = full.search(COURSE_START)
  if (at <= 2) return { college: full }
  const course = full.slice(at).replace(/^[\s,]+/, '').trim()
  return { college: titleIfLower(full.slice(0, at).replace(/[\s,]+$/, '')), course: course || undefined }
}

// ---------------------------------------------------------------------------
// Reading the syllabus header: college, subject code, subject name, course

const STRICT_CODE = /\b(?:[A-Z]{2,5}[- ]?\d{2}[A-Z]?\d{1,3}[A-Z]?|\d{2}[A-Z]{2,4}\d{2,3}[A-Z]?)\b/g
const NOT_A_CODE = /^(UNIT|PART|PAGE|CO|PO|PSO|REG|HRS|HOURS|TOTAL|SEM|YEAR|ISBN|NAAC|NBA|ISO)\b/
const CODE_LABEL = /\b(course|subject|paper|module)\s*(code|no\.?)|\bcode\s*[:\-]/i
const QP_CODE = /question\s*paper\s*code/i
const COLLEGE_LINE = /\b(university|institute|college|vidyapeeth|vidyapith|academy|polytechnic)\b/i
// "B.E." needs its dot: plain "BE" is usually the word in "deemed to be university".
const DEGREE = /\b(?:B\.\s?E\.?|B\.?\s?Tech|M\.\s?E\.?|M\.?\s?Tech|B\.?\s?Sc|M\.?\s?Sc|BCA|MCA|MBA|BBA|B\.?\s?Com|M\.?\s?Com|Diploma)(?![a-z])/i
const SEMESTER = /\b(?:semester|sem)\s*[:\-]?\s*([IVX]{1,4}|\d{1,2})\b/i
const CREDITS_TAIL = /\b(L\s*T\s*P\s*C?|credits?|hours?\/week|max\.?\s*marks)\b.*$|(\s+\d(\s+\d){2,4})\s*$/i

export interface SyllabusProfile {
  college?: string
  code?: string
  subjectName?: string
  course?: string
}

const codesIn = (line: string) => [...line.matchAll(STRICT_CODE)].map((m) => m[0].replace(/[- ]/g, '')).filter((c) => !NOT_A_CODE.test(c))

/** Most syllabi print the college, course code and title in the first few lines. */
export function profileFromSyllabus(text: string): SyllabusProfile {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const head = lines.slice(0, 40)
  const out: SyllabusProfile = {}

  // Subject code: a labelled one wins; otherwise the first code-looking token near the top.
  const labelled = head.findIndex((l) => CODE_LABEL.test(l) && !QP_CODE.test(l) && codesIn(l).length)
  const anyCode = head.findIndex((l) => !QP_CODE.test(l) && !HEADING.test(l) && codesIn(l).length)
  const codeLine = labelled >= 0 ? labelled : anyCode
  if (codeLine >= 0) {
    out.code = codesIn(head[codeLine])[0]
    // "SCSB3616 NEURO FUZZY AND GENETIC ALGORITHM L T P C 3 0 0 3" → the title.
    const title = head[codeLine]
      .replace(new RegExp(out.code.replace(/(\D)(\d)/, '$1[- ]?$2'), 'i'), ' ')
      .replace(/\b(course|subject|paper)\s*(code|title|name)\b\s*[:\-]?/gi, ' ')
      .replace(CREDITS_TAIL, ' ')
      .replace(/^[\s:|\-–]+|[\s:|\-–]+$/g, '')
      .trim()
    if (/[a-z]{3}/i.test(title) && title.length >= 4 && title.length <= 90 && !COLLEGE_LINE.test(title)) out.subjectName = tidyCase(title)
  }
  if (!out.subjectName) {
    const titled = head.find((l) => /\b(course|subject|paper)\s*(title|name)\b/i.test(l))
    const t = titled?.replace(/.*\b(?:title|name)\b\s*[:\-]?\s*/i, '').replace(CREDITS_TAIL, '').trim()
    if (t && /[a-z]{3}/i.test(t)) out.subjectName = tidyCase(t.slice(0, 90))
  }

  // College: the first line naming a university/institute/college, minus accreditation fluff.
  const collegeLine = head.find((l) => COLLEGE_LINE.test(l) && l.length <= 140 && !/affiliated|approved by|recognised by|recognized by/i.test(l))
  if (collegeLine) {
    let c = collegeLine
      .replace(/\(.*?\)/g, ' ')
      .replace(/\b(accredited|naac|nba|an autonomous|autonomous|estd\.?|established|ugc|aicte|iso)\b.*$/i, ' ')
      .replace(/[,\-–|:]+\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (c.length >= 4) out.college = tidyCase(c.slice(0, 80))
  }

  const degree = head.map((l) => l.match(DEGREE)?.[0]).find(Boolean)
  const sem = head.map((l) => l.match(SEMESTER)?.[1]).find(Boolean)
  if (degree || sem) out.course = [degree?.replace(/\s+/g, ''), sem && `Sem ${sem}`].filter(Boolean).join(', ')
  return out
}

export function cleanCollege(text: string): string {
  let t = text
    .replace(SUBJECT_CODE, ' ')
    .replace(/^\s*(?:i'?m|i am|we are|we're|i|we)?\s*(?:in|at|from|study(?:ing)? (?:at|in)|go to|attend(?:ing)?)\s+/i, '')
    .replace(/^\s*(?:my\s+(?:college|university|uni|school)(?:\s+is|:)?|(?:college|university|uni|school)(?:\s+is|:))\s*/i, '')
    .replace(/^\s*(it'?s|its)\s+/i, '')
    .replace(/[\s.,!;:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return titleIfLower(t)
}

const ACRONYM = /^(iit|iiit|nit|iiser|iisc|vtu|vit|srm|jntu|jntuh|bits|du|amu|bhu|jnu|mit|ktu|rgpv|aktu|gtu|sppu|lpu|kiit|nmims|cbse|icse|isc|hsc|ssc|neet|jee|gate|upsc|cusat|ggsipu|ipu|mdu|ptu|uptu|au)$/

const titleIfLower = (t: string) =>
  t === t.toLowerCase()
    ? t.replace(/\b\w+/g, (w, i: number) =>
        ACRONYM.test(w) ? w.toUpperCase() : i > 0 && /^(of|and|the|for|in|at)$/.test(w) ? w : w[0].toUpperCase() + w.slice(1),
      )
    : t

const refName = (u: BuddyUnit) => {
  const n = unitNumber(u.name)
  return n !== null ? `unit ${n}` : short(u.name)
}

export function chipsFor(session: BuddySession): string[] {
  const pending = (session.pendingUnitIds ?? []).map((id) => session.units.find((u) => u.id === id)).filter((u): u is BuddyUnit => !!u)
  if (pending.length === 1) {
    const r = refName(pending[0])
    return [`${r} is done`, `${r} is hard`, `Haven't started ${r}`, `${r} is important`]
  }
  if (session.pendingIntent) return session.units.filter((u) => !u.skipped).slice(0, 6).map((u) => refName(u))
  const asked = QUESTIONS[session.step]?.chips
  if (asked) return asked
  const open = session.units.filter((u) => !u.skipped && !u.finished)
  const chips: string[] = []
  if (!session.pyqReport) chips.push('Find my past papers 🔎')
  if (open[0]) chips.push(`Finished ${refName(open[0])}`)
  if (open[1]) chips.push(`${refName(open[1])} is harder than I thought`)
  chips.push('Teacher said something is important')
  return chips
}

const CONFIDENCE_WORDS: Record<Confidence, string> = {
  1: '😱 never seen it',
  2: '😬 shaky',
  3: '😐 kinda know it',
  4: '🙂 pretty solid',
  5: '😎 could teach it',
}

const short = (name: string) => (name.length > 32 ? `${name.slice(0, 30)}…` : name)
const nameList = (units: BuddyUnit[], idx: number[]) => {
  const nums = idx.map((i) => unitNumber(units[i].name))
  if (idx.length >= 2 && nums.every((n) => n !== null)) {
    const list = nums.map(String)
    return `Units ${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
  }
  const names = idx.map((i) => short(units[i].name))
  if (names.length <= 2) return names.join(' and ')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const NO = /^\s*(no+|nope|nah|none|nothing|na|no hints?|nothing specific|not really|none really|all good|nothing like that)\b/i

export interface Turn {
  session: BuddySession
  understood: string[]
  /** Overrides the usual "Got it" reply. */
  reply?: string
  /** Start a past-paper hunt after replying. */
  hunt?: boolean
  /** The hunt started because the syllabus already said which college and code. */
  autoProfile?: boolean
}

const priorityOf = (u: BuddyUnit) => (u.marks * (6 - u.confidence)) / Math.max(u.hours, 0.25)
const isQuestion = (t: string) => /\?\s*$/.test(t) || /^\s*(what|which|how|where|when|should|can|could|do|does|tell me)\b/i.test(t)

const HUNT_REPLY = "Give me a sec. I'm digging through past papers for you… 🕵️"

/** College and subject-code answers, and "find my past papers" at any time. */
function profileTurn(session: BuddySession, message: string): Turn | null {
  const profile = { ...session.profile }
  const done = QUESTIONS.length
  // "Which college?" is open, but they said "unit 2 is hard": that's about units, not a college.
  const aboutUnits =
    (resolveUnits(message, session.units).length > 0 && hasIntent(readIntent(message))) || isQuestion(message) || PYQ_REQUEST.test(message)
  const asked = QUESTIONS[session.step]?.kind
  const kind = asked && !(aboutUnits && !extractCode(message)) ? asked : undefined

  if (kind === 'college') {
    if (SKIP.test(message)) {
      return { session: { ...session, step: done }, understood: [], reply: 'No worries. Say "find my past papers" whenever you want me to go digging.' }
    }
    const { college, course } = splitCollege(message)
    profile.college = college
    profile.course = course ?? profile.course
    profile.code = extractCode(message) ?? profile.code
    const who = [profile.college, profile.course].filter(Boolean).join(', ')
    if (profile.code) {
      return { session: { ...session, profile, step: done }, understood: [], reply: `🎓 ${who}, subject ${profile.code}. ${HUNT_REPLY}`, hunt: true }
    }
    return { session: { ...session, profile, step: session.step + 1 }, understood: [], reply: `🎓 ${who}. Nice.\n\n${QUESTIONS[session.step + 1].ask(session)}` }
  }

  if (kind === 'code') {
    const code = extractCode(message)
    if (!code && !SKIP.test(message)) {
      return { session, understood: [], reply: "That doesn't look like a subject code (they look like MA3151 or 18MAT21). Type it again, or say \"skip\"." }
    }
    if (code) profile.code = code
    return { session: { ...session, profile, step: done }, understood: [], reply: code ? `🔢 ${code}, noted. ${HUNT_REPLY}` : HUNT_REPLY, hunt: true }
  }

  // A subject code can arrive at any point ("SCSB3616 is my subject code").
  const code = extractCode(message)
  if (code && session.step >= done && resolveUnits(message, session.units).length === 0) {
    profile.code = code
    if (!profile.college) {
      return {
        session: { ...session, profile, step: COLLEGE_STEP },
        understood: [],
        reply: `🔢 ${code}, noted. One more thing so I can hunt your past papers: which college or university are you in?`,
      }
    }
    return { session: { ...session, profile }, understood: [], reply: `🔢 ${code}, noted. ${HUNT_REPLY}`, hunt: true }
  }

  if (session.step >= done && PYQ_REQUEST.test(message)) {
    if (!profile.college) return { session: { ...session, step: COLLEGE_STEP }, understood: [], reply: QUESTIONS[COLLEGE_STEP].ask(session) }
    return { session, understood: [], reply: HUNT_REPLY, hunt: true }
  }
  return null
}


/** "What should I study first?", "which unit matters most?", "how much is left?", "what can you do?" */
function answerQuestion(session: BuddySession, message: string): Turn | null {
  const t = message.toLowerCase()
  const open = session.units.filter((u) => !u.skipped && !u.finished)
  const say = (reply: string): Turn => ({ session, understood: [], reply })
  if (/\b(thanks|thank you|thx|tysm|ty)\b/.test(t) && wordCount(t) <= 5) return say('Anytime. Now go get those marks. 💪')
  if (/\b(what can you do|how does this work|what do you do|what are you|help me|^help)\b/.test(t)) {
    return say(
      'I can:\n• Update the plan when you tell me things ("unit 3 is done", "unit 2 is hard", "teacher said unit 4 is important")\n• Hunt and X-ray past papers ("find my past papers")\n• Tell you what to study first, or what matters most\nJust talk normally. Typos are fine.',
    )
  }
  if (!isQuestion(t)) return null
  if (open.length === 0) return say("Everything's marked done. Honestly? Sleep. That's the plan now. 😴")
  if (/\b(first|next|now|start|begin|today|tonight|focus)\b/.test(t) && /\b(study|do|start|begin|learn|focus|read|revise|prepare)\b/.test(t)) {
    const top = [...open].sort((a, b) => priorityOf(b) - priorityOf(a))
    const why = whyFor(top[0], session.weakSkills)
    return say(
      `Start with ${top[0].name}.${why ? ` (${why})` : ''}${top[0].focus.length ? `\nFocus on: ${top[0].focus.slice(0, 3).join(' · ')}` : ''}${top[1] ? `\n\nThen ${top[1].name}.` : ''}`,
    )
  }
  if (/\b(important|imp|matters?|most marks|more marks|highest|weightage|priority|scoring)\b/.test(t)) {
    const byMarks = [...open].sort((a, b) => b.marks - a.marks).slice(0, 3)
    const pyq = open.filter((u) => u.pyq && u.pyq.papers > 0).sort((a, b) => b.pyq!.papers - a.pyq!.papers)[0]
    return say(
      `Biggest marks: ${byMarks.map((u) => `${u.name} (${u.marks})`).join(', ')}.${pyq ? `\nPast papers love ${pyq.name}: it showed up in ${pyq.pyq!.papers} of ${pyq.pyq!.of}.` : ''}${!session.pyqReport ? '\nWant proof from real exams? Say "find my past papers".' : ''}`,
    )
  }
  if (/\b(how (much|many|long)|left|remaining)\b/.test(t) && /\b(left|remaining|hours?|time|work|units?|topics?)\b/.test(t)) {
    const hours = open.reduce((a, u) => a + u.hours, 0)
    return say(`${open.length} unit${open.length === 1 ? '' : 's'} left, about ${Math.round(hours * 2) / 2} hours of study. Your plan tab has the exact schedule.`)
  }
  return null
}

/** Moves past college/code questions the syllabus already answered. */
function skipKnown(session: BuddySession, step: number): number {
  while (QUESTIONS[step]?.kind === 'college' && session.profile?.college) step++
  while (QUESTIONS[step]?.kind === 'code' && session.profile?.code) step++
  return step
}

/** When skipping lands on "done" with a known college, go hunting without asking. */
function withAutoHunt(before: BuddySession, turn: Turn): Turn {
  const { session } = turn
  const jumpedPast = before.step < COLLEGE_STEP && session.step >= QUESTIONS.length
  if (jumpedPast && session.profile?.college && !session.pyqReport && !turn.hunt) return { ...turn, hunt: true, autoProfile: true }
  return turn
}

/** Applies one chat message to the session. Returns what was understood. */
export function understand(session: BuddySession, raw: string): Turn {
  return withAutoHunt(session, understandRaw(session, raw))
}

function understandRaw(session: BuddySession, raw: string): Turn {
  const message = fixTypos(raw)
  const profiled = profileTurn(session, message)
  if (profiled) return profiled
  const answered = answerQuestion(session, message)
  if (answered) return answered
  // "No hints" / "nothing specific" just move on; "nothing" mustn't mean "every unit".
  if (NO.test(message) && wordCount(message) <= 4 && resolveUnits(message.replace(ALL, ''), session.units).length === 0 && !readIntent(message).skills.length) {
    return { session: { ...session, step: QUESTIONS[session.step] ? skipKnown(session, session.step + 1) : session.step }, understood: [] }
  }

  const units = session.units.map((u) => ({ ...u, focus: [...u.focus], skills: [...u.skills] }))
  const weakSkills = [...session.weakSkills]
  const understood: string[] = []
  const question = QUESTIONS[session.step]
  const pendingIdx = (session.pendingUnitIds ?? []).map((id) => units.findIndex((u) => u.id === id)).filter((i) => i >= 0)
  let lastRefs: number[] = pendingIdx
  const mentionedOnly = new Set<number>()
  let orphanIntent = ''
  const lower = message.toLowerCase()

  // "Total exam is 80 marks" rescales unit marks.
  const total = lower.match(/\b(?:total|exam|paper)\b[^.]*?\b(\d{2,3})\s*marks?\b/)
  const mentionsUnit = resolveUnits(message, units).length > 0
  if (total && !mentionsUnit) {
    const target = Number(total[1])
    const live = units.filter((u) => !u.skipped)
    const sum = live.reduce((a, u) => a + u.marks, 0)
    if (sum > 0) {
      for (const u of live) u.marks = Math.max(1, Math.round((u.marks / sum) * target))
      understood.push(`📝 Paper is ${target} marks, so I've spread that across the units.`)
    }
  }

  for (const clause of clauses(message)) {
    let refs = resolveUnits(clause, units, true)
    let intent = readIntent(clause)
    // "unit 3" after "it's so hard": the earlier feeling finds its unit.
    if (!hasIntent(intent) && refs.length && session.pendingIntent) intent = readIntent(session.pendingIntent)
    if (!hasIntent(intent) && refs.length && question) intent = { skills: [], ...question.defaultIntent }
    if (!hasIntent(intent) && refs.length) refs.forEach((i) => mentionedOnly.add(i))
    // "...and it's hard" / "same" refers back; anything longer must name its unit.
    const refersBack = /\b(it|its|it's|that|this|they|them|those|both|same)\b/i.test(clause) || wordCount(clause) <= (pendingIdx.length ? 6 : 3)
    if (refs.length === 0 && hasIntent(intent) && !intent.skills.length && !(lastRefs.length && refersBack)) orphanIntent = clause
    if (refs.length === 0 && hasIntent(intent) && lastRefs.length && !intent.skills.length && refersBack) refs = lastRefs
    if (refs.length) lastRefs = refs

    // Weak at a skill, no unit named: applies to every unit that has that skill.
    if (refs.length === 0 && intent.skills.length && (intent.confidence ?? 2) <= 3) {
      for (const skill of intent.skills) {
        if (weakSkills.includes(skill)) continue
        weakSkills.push(skill)
        const hit = units.map((u, i) => (u.skills.includes(skill) ? i : -1)).filter((i) => i >= 0)
        for (const i of hit) {
          units[i].hours = Math.ceil(units[i].hours * 1.25 * 2) / 2
          const tip = `Practise ${SKILL_LABEL[skill]}`
          if (!units[i].focus.includes(tip)) units[i].focus.unshift(tip)
        }
        understood.push(
          hit.length
            ? `🧮 Weak at ${SKILL_LABEL[skill]}: extra time on ${nameList(units, hit)}.`
            : `🧮 Weak at ${SKILL_LABEL[skill]}: noted. I'll flag it if it shows up.`,
        )
      }
      continue
    }
    if (refs.length === 0) continue

    const label = nameList(units, refs)
    if (intent.dropped) {
      for (const i of refs) units[i].skipped = true
      understood.push(`🗑️ ${label}: dropped from the syllabus. Less work, love that.`)
      continue
    }
    // Before the plan exists, "finished unit 2" just means "I know it".
    if (intent.finished && session.linked) {
      for (const i of refs) {
        units[i].finished = true
        units[i].confidence = Math.max(units[i].confidence, 4) as Confidence
      }
      understood.push(`✅ ${label}: marked done. ${short(units[refs[0]].name)} didn't see that coming.`)
      continue
    }
    if (intent.confidence !== undefined) {
      for (const i of refs) units[i].confidence = intent.confidence
      understood.push(`${label} → ${CONFIDENCE_WORDS[intent.confidence]}`)
    }
    if (intent.important) {
      for (const i of refs) {
        if (!units[i].teacherHint) units[i].marks = Math.round(units[i].marks * 1.5)
        units[i].teacherHint = true
        units[i].lowPriority = false
      }
      understood.push(`⭐ ${label}: teacher-approved. Bumped up the priority.`)
    }
    if (intent.low) {
      for (const i of refs) {
        if (!units[i].lowPriority) units[i].marks = Math.max(1, Math.round(units[i].marks * 0.5))
        units[i].lowPriority = true
        units[i].teacherHint = false
      }
      understood.push(`🪶 ${label}: low priority. Moved it down the list.`)
    }
    if (intent.marks !== undefined) {
      for (const i of refs) {
        units[i].marks = intent.marks
        units[i].marksKnown = true
      }
      understood.push(`📝 ${label}: ${intent.marks} marks.`)
    }
    if (intent.hours !== undefined) {
      for (const i of refs) units[i].hours = clamp(roundHalf(intent.hours), 0.5, 40)
      understood.push(`⏱️ ${label}: about ${roundHalf(intent.hours)}h of work.`)
    }
    for (const skill of intent.skills) {
      for (const i of refs) {
        if (!units[i].skills.includes(skill)) units[i].skills.push(skill)
        const tip = `Practise ${SKILL_LABEL[skill]}`
        if ((intent.confidence ?? 2) <= 3 && !units[i].focus.includes(tip)) units[i].focus.unshift(tip)
      }
    }
  }

  const said = understood.length > 0 || NO.test(message)
  // Nothing landed: remember what's half-said so the next message can finish it.
  const pendingUnitIds = !understood.length && mentionedOnly.size ? [...mentionedOnly].map((i) => units[i].id) : undefined
  const pendingIntent = !understood.length && orphanIntent ? orphanIntent : undefined
  return {
    // College/code questions only move on when they're actually answered.
    session: {
      ...session,
      units,
      weakSkills,
      step: said && question && !question.kind ? skipKnown(session, session.step + 1) : session.step,
      pendingUnitIds,
      pendingIntent,
    },
    understood,
  }
}

export function replyFor(before: BuddySession, turn: Turn, raw: string): string {
  if (turn.reply) return turn.reply
  const message = fixTypos(raw)
  const { session, understood } = turn
  const next = QUESTIONS[session.step]
  const advanced = session.step > before.step
  const live = session.units.filter((u) => !u.skipped)
  const lines: string[] = []

  if (understood.length) {
    lines.push(`Got it:\n${understood.map((u) => `• ${u}`).join('\n')}`)
    if (session.linked) lines.push('Plan updated. ✓')
    const panic = live.filter((u) => u.confidence === 1).length
    if (panic >= Math.max(3, live.length * 0.6)) lines.push("That's a lot of 😱. Fine. We go for the high-mark ones first.")
  } else if (NO.test(message)) {
    lines.push(['Noted.', 'Cool, moving on.', 'Fair enough.'][before.step % 3])
  } else if (/^\s*(hi|hello|hey|yo|sup)\b/i.test(message)) {
    lines.push("Hey! Let's save some marks.")
  } else if (/\b(help|how|what do i|idk|i don'?t know)\b/i.test(message)) {
    lines.push('Just talk to me like a friend. Try "Unit 3 is my weak spot", "teacher said unit 2 is important", or "unit 4 is 20 marks".')
  } else if (session.pendingUnitIds?.length) {
    const named = session.pendingUnitIds.map((id) => session.units.find((u) => u.id === id)!).filter(Boolean)
    lines.push(`What about ${named.map((u) => u.name).join(' and ')}? Done, hard, or not started yet?`)
  } else if (session.pendingIntent) {
    lines.push('Which unit is that about? Tap one below, or type its number.')
  } else {
    const ex = session.units.find((u) => !u.skipped)
    lines.push(
      `I didn't quite get that. Try something like "${ex ? refName(ex) : 'unit 1'} is done", "${ex ? refName(ex) : 'unit 2'} is hard", or ask me "what should I study first?"`,
    )
  }

  const followingUp = !understood.length && (session.pendingUnitIds?.length || session.pendingIntent)
  if (turn.autoProfile) {
    const p = session.profile!
    lines.push(
      `🎓 No need to ask your college: your syllabus says ${p.college}${p.code ? `, subject ${p.code}` : ''}${p.subjectName ? ` (${p.subjectName})` : ''}. Digging up your past papers now… 🕵️`,
    )
    return lines.filter(Boolean).join('\n\n')
  }
  if (next && !followingUp && (advanced || !understood.length)) lines.push(next.ask(session))
  else if (!next && session.linked) lines.push(understood.length ? 'Anything else changed?' : '')
  else if (!next && advanced) lines.push("That's everything I need. Hit \"Build my plan\" when you're ready, or keep telling me stuff.")
  else if (!next) lines.push('Anything else? Otherwise, build the plan.')
  return lines.filter(Boolean).join('\n\n')
}

export function introFor(session: BuddySession): string {
  const { units, sources } = session
  const syllabus = sources.filter((s) => s.kind === 'syllabus')
  const material = sources.filter((s) => s.kind === 'material')
  const materialWords = material.reduce((a, s) => a + s.words, 0)
  const lines: string[] = []
  const read: string[] = []
  if (syllabus.length) read.push('your syllabus')
  if (material.length) read.push(`${material.length} file${material.length === 1 ? '' : 's'} of notes (${materialWords.toLocaleString()} words)`)
  lines.push(`I read ${read.join(' and ') || 'what you gave me'}. Found ${units.length} unit${units.length === 1 ? '' : 's'}:`)
  const p = session.profile
  if (p?.fromSyllabus && (p.college || p.code)) {
    const bits = [p.college, p.code && `${p.code}${p.subjectName ? ` ${p.subjectName}` : ''}`, p.course].filter(Boolean)
    lines.splice(0, 0, `📋 Your syllabus says: ${bits.join(' · ')}. I'll use that to hunt your past papers.`)
  }
  lines.push(units.map((u, i) => `${i + 1}. ${u.name}${u.materialWords ? ` (~${u.hours}h)` : ''}`).join('\n'))
  const heavy = [...units].filter((u) => u.materialWords > 0).sort((a, b) => b.materialWords - a.materialWords)[0]
  if (heavy && units.filter((u) => u.materialWords > 0).length > 1) lines.push(`${short(heavy.name)} has the most notes. Respect.`)
  lines.push(QUESTIONS[0].ask(session))
  return lines.join('\n\n')
}

// ---------------------------------------------------------------------------
// Session → planner topics

export function whyFor(u: BuddyUnit, weakSkills: Skill[]): string {
  const bits: string[] = []
  if (u.teacherHint) bits.push('teacher hinted it')
  if (u.lowPriority) bits.push('low priority')
  if (u.confidence === 1) bits.push("you haven't started it")
  if (u.confidence === 2) bits.push("you're shaky on it")
  if (u.confidence >= 4) bits.push('you already know it')
  const weak = u.skills.filter((s) => weakSkills.includes(s))
  if (weak.length) bits.push(`has ${weak.map((s) => SKILL_LABEL[s]).join(' & ')}`)
  if (u.pyq) bits.push(`in ${u.pyq.papers}/${u.pyq.of} past papers`)
  if (u.materialWords) bits.push(`${u.materialWords.toLocaleString()} words of notes`)
  return bits.length ? bits.join(' · ') : ''
}

export function toTopics(session: BuddySession): Topic[] {
  return session.units
    .filter((u) => !u.skipped)
    .map((u) => ({
      id: u.id,
      name: u.name,
      marks: u.marks,
      hours: u.hours,
      confidence: u.confidence,
      done: !!u.finished,
      focus: u.focus.slice(0, 4),
      why: whyFor(u, session.weakSkills),
    }))
}

// ---------------------------------------------------------------------------
// Keeping the chat and the plan in sync

export const CHECK_IN =
  "Welcome back! What's changed? Finished something, found a unit harder than you thought, got a hint from your teacher? Tell me and I'll update the plan."

/** Coming back from the plan: the chat carries on where it left off. */
export function checkIn(session: BuddySession, makeId: () => string): BuddySession {
  const last = session.messages[session.messages.length - 1]
  // Left halfway through "which college?" / "subject code?": pick that thread back up.
  const known = skipKnown(session, session.step)
  const pending = QUESTIONS[known]?.kind ? known : null
  const step = pending ?? Math.max(session.step, QUESTIONS.length)
  const text = pending !== null ? `Welcome back! Quick one before we carry on. ${QUESTIONS[pending].ask(session)}` : CHECK_IN
  if (last?.from === 'buddy' && last.text === text) return { ...session, step, linked: true }
  return { ...session, step, linked: true, messages: [...session.messages, { id: makeId(), from: 'buddy', text }] }
}

/** A plan built without the buddy (sample exam, typed topics) still gets a chat. */
export function sessionFromTopics(topics: Topic[], makeId: () => string): BuddySession {
  const units: BuddyUnit[] = topics.map((t) => unitFromTopic(t))
  return {
    units,
    weakSkills: [],
    sources: [],
    step: QUESTIONS.length,
    linked: true,
    messages: [
      {
        id: makeId(),
        from: 'buddy',
        text: `I've got your ${units.length} topic${units.length === 1 ? '' : 's'} from the plan. ${CHECK_IN.replace('Welcome back! ', '')}`,
      },
    ],
  }
}

function unitFromTopic(t: Topic): BuddyUnit {
  return {
    id: t.id,
    name: t.name,
    subtopics: [],
    marks: t.marks,
    marksKnown: true,
    hours: t.hours,
    confidence: t.confidence,
    teacherHint: false,
    lowPriority: false,
    skipped: false,
    focus: t.focus ?? [],
    skills: [],
    materialWords: 0,
    finished: t.done,
  }
}

/** Plan edits (Done, Undo, edited marks, deleted or added topics) flow back into the chat. */
export function syncFromTopics(session: BuddySession, topics: Topic[]): BuddySession {
  const byId = new Map(topics.map((t) => [t.id, t]))
  const units = session.units.map((u) => {
    const t = byId.get(u.id)
    if (!t) return u.skipped ? u : { ...u, skipped: true }
    return { ...u, name: t.name, marks: t.marks, hours: t.hours, confidence: t.confidence, finished: t.done, skipped: false }
  })
  const known = new Set(units.map((u) => u.id))
  for (const t of topics) if (!known.has(t.id)) units.push(unitFromTopic(t))
  return { ...session, units }
}

/** Chat changes flow into the plan, keeping study progress. */
export function mergeTopics(existing: Topic[], session: BuddySession, now: number): Topic[] {
  const byId = new Map(existing.map((t) => [t.id, t]))
  const byName = new Map(existing.map((t) => [t.name.toLowerCase(), t]))
  return toTopics(session).map((t) => {
    const old = byId.get(t.id) ?? byName.get(t.name.toLowerCase())
    const done = t.done || (!session.linked && !!old?.done)
    return {
      ...t,
      done,
      doneAt: done ? old?.doneAt ?? now : undefined,
      studiedMin: old?.studiedMin,
    }
  })
}
