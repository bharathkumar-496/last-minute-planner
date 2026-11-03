// Previous-year-question (PYQ) X-ray. Pure functions: split exam papers into
// questions, map them to units, find repeats, and turn it into a plan nudge.
// Works on messy scanned text, so it leans on question wording, not numbering.

import { keywordsOf, wordCount, type BuddyUnit } from './buddy'

export interface Paper {
  name: string
  text: string
  year?: number | null
  url?: string
}

export type QuestionStyle = 'derive' | 'numerical' | 'explain' | 'define' | 'diagram' | 'compare' | 'notes' | 'program'

export const STYLE_LABEL: Record<QuestionStyle, string> = {
  derive: 'derivations & proofs',
  numerical: 'numericals',
  explain: 'explain / describe',
  define: 'definitions',
  diagram: 'diagrams',
  compare: 'compare & contrast',
  notes: 'short notes',
  program: 'programs & code',
}

const STYLE_CUES: Array<[QuestionStyle, RegExp]> = [
  ['program', /\b(write a (program|code|function)|algorithm|pseudo ?code|software|matlab|python|c\+\+|java)\b/i],
  ['derive', /\b(derive|derivation|prove|show that|deduce|establish)\b/i],
  ['compare', /\b(differentiate|distinguish|compare|difference between|contrast)\b/i],
  ['diagram', /\b(draw|sketch|diagram|neat|labelled|labeled)\b/i],
  ['notes', /\b(short notes?|write notes?|notes on)\b/i],
  ['define', /\b(define|definition|what is|what are|state the|state)\b/i],
  ['numerical', /\b(find|calculate|compute|determine|evaluate|solve|obtain|verify|check whether|diagonali[sz]e)\b/i],
  ['explain', /\b(explain|describe|discuss|elaborate|illustrate|justify|why|how)\b/i],
]

export function styleOf(q: string): QuestionStyle | null {
  for (const [style, re] of STYLE_CUES) if (re.test(q)) return style
  return null
}

const QUESTION_START =
  /(?=(?:^|\s)(?:Q\.?\s*(?:No\.?)?\s*\d{1,2}[.):]?\s+|\(\s*(?:[a-h]|i{1,3}|iv|v|vi)\s*\)\s+|\b(?:Find|Determine|Derive|Prove|Show that|Explain|Describe|Discuss|Define|State|Write|Draw|Sketch|Compare|Differentiate|Distinguish|Calculate|Compute|Evaluate|Solve|Obtain|Verify|Check|Apply|Using|Use|Construct|Design|Analy[sz]e|List|What|Why|How|Which|Illustrate|Give|Diagonali[sz]e|Orthogonally|Estimate|Classify|Mention|Outline|Discuss)\b))/

const NOISE =
  /(question paper code|regulations?|time\s*:|maximum\s*:|max(imum)?\.? marks|answer all|answer any|reg(ister|\.)? no|roll no|bloom|course outcome|\bco\s*-|\bbl\s*-|part\s*[-–—]?\s*[abc]\b|degree examination|semester|common to|all questions carry|\(\s*[a-d]\s*\)\s*[^a-z]{0,3}$)/i

/** The body of a paper: course outcomes and cover-page waffle come before PART A / "Answer all". */
function bodyOf(text: string): string {
  const start = text.search(/PART\s*[-–—]?\s*A\b|Answer\s+(ALL|any)\b/i)
  return start > 0 ? text.slice(start) : text
}

export function splitQuestions(text: string): string[] {
  const blocks = bodyOf(text)
    .split(/\n/)
    .map((l) => l.trim())
    // Multiple-choice options and pure-symbol OCR junk aren't questions.
    .filter((l) => l && !/^[|(\[]?\s*[A-D]\s*[).\]]\s/.test(l) && /[a-z]{3}/i.test(l))
    .join(' ')
  const out: string[] = []
  for (const raw of blocks.split(QUESTION_START)) {
    const q = raw
      .replace(/^\s*(?:Q\.?\s*(?:No\.?)?\s*\d{1,2}[.):]?|\(\s*[a-hiv]+\s*\))\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (wordCount(q) < 4 || NOISE.test(q) || !/[a-z]{4}/i.test(q)) continue
    out.push(q.length > 220 ? `${q.slice(0, 217)}…` : q)
  }
  return out
}

const MONTH_YEAR = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s*[/–-]\s*[a-z]+)?[\s,]*((?:19|20)\d{2})\b/i

export function detectYear(paper: Pick<Paper, 'name' | 'text' | 'year'>): number | null {
  if (paper.year) return paper.year
  const header = paper.text.slice(0, 1500).match(MONTH_YEAR)
  if (header) return Number(header[1])
  const inName = paper.name.match(/\b((?:19|20)\d{2})\b/)
  if (inName) return Number(inName[1])
  const counts = new Map<number, number>()
  for (const m of paper.text.slice(0, 3000).matchAll(/\b(20[0-3]\d|19[89]\d)\b/g)) counts.set(Number(m[1]), (counts.get(Number(m[1])) ?? 0) + 1)
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return best ? best[0] : null
}

/** Is this text actually an exam paper (not a textbook or a random PDF)? */
export function looksLikePaper(text: string): boolean {
  const cues = (text.match(/\b(marks?|question paper|answer (all|any)|part\s*[-–—]?\s*[ab]|time\s*:\s*\d|max(imum)?)\b/gi) ?? []).length
  return cues >= 2 && splitQuestions(text).length >= 4
}

// ---------------------------------------------------------------------------
// Analysis

const STYLE_WORDS = new Set(
  keywordsOf(
    'find determine derive prove show explain describe discuss define state write draw sketch compare differentiate calculate compute evaluate solve obtain verify check apply using construct design analyse analyze list what which give illustrate following given suitable example briefly detail neat diagram short notes marks whether',
  ),
)

const tokensOf = (q: string) => keywordsOf(q).filter((k) => !STYLE_WORDS.has(k))

/** Meaningful terms in a question, keyed by stem, shown as written ("eigenvalues"). */
function surfaceTerms(q: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const w of q.toLowerCase().match(/[a-z][a-z-]{4,}/g) ?? []) {
    const [k] = keywordsOf(w)
    if (k && !STYLE_WORDS.has(k) && !out.has(k)) out.set(k, w)
  }
  return out
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a)
  const B = new Set(b)
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter || 1)
}

export function unitFor(question: string, units: Pick<BuddyUnit, 'name' | 'subtopics' | 'focus'>[]): number {
  const words = new Set(tokensOf(question))
  let best = -1
  let bestScore = 0
  units.forEach((u, i) => {
    const keys = keywordsOf(`${u.name} ${u.subtopics.join(' ')} ${u.focus.filter((f) => !/^(practise|repeat q)/i.test(f)).join(' ')}`)
    const score = keys.reduce((a, k) => a + (words.has(k) ? 1 : 0), 0)
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  })
  return best
}

export interface UnitStat {
  unitId: string
  name: string
  papers: number
  questions: number
}

export interface Repeat {
  text: string
  papers: number
  years: number[]
  unitId: string | null
}

export interface PyqReport {
  papers: Array<{ name: string; year: number | null; questions: number; url?: string }>
  totalQuestions: number
  units: UnitStat[]
  repeats: Repeat[]
  styles: Array<{ style: QuestionStyle; share: number }>
  hotTopics: string[]
  matched: number
}

export function analysePapers(papers: Paper[], units: BuddyUnit[]): PyqReport {
  const live = units.filter((u) => !u.skipped)
  const parsed = papers.map((p) => ({ ...p, year: detectYear(p), questions: splitQuestions(p.text) }))
  const unitPapers = live.map(() => new Set<number>())
  const unitQuestions = live.map(() => 0)
  const styleCounts = new Map<QuestionStyle, number>()
  const clusters: Array<{ text: string; tokens: string[]; papers: Set<number>; years: Set<number>; unit: number }> = []
  const termQuestions = new Map<string, { surface: string; questions: number; papers: Set<number> }>()
  let matched = 0
  let total = 0

  parsed.forEach((paper, pi) => {
    for (const q of paper.questions) {
      total++
      const u = unitFor(q, live)
      if (u >= 0) {
        matched++
        unitPapers[u].add(pi)
        unitQuestions[u]++
      }
      const style = styleOf(q)
      if (style) styleCounts.set(style, (styleCounts.get(style) ?? 0) + 1)

      const tokens = tokensOf(q)
      for (const [stemmed, surface] of surfaceTerms(q)) {
        const entry = termQuestions.get(stemmed) ?? { surface, questions: 0, papers: new Set<number>() }
        entry.questions++
        entry.papers.add(pi)
        termQuestions.set(stemmed, entry)
      }
      if (tokens.length < 3) continue
      const hit = clusters.find((c) => jaccard(c.tokens, tokens) >= 0.5)
      if (hit) {
        hit.papers.add(pi)
        if (paper.year) hit.years.add(paper.year)
        if (q.length < hit.text.length) hit.text = q
      } else {
        clusters.push({ text: q, tokens, papers: new Set([pi]), years: new Set(paper.year ? [paper.year] : []), unit: u })
      }
    }
  })

  const repeats = clusters
    .filter((c) => c.papers.size >= 2)
    .sort((a, b) => b.papers.size - a.papers.size || a.text.length - b.text.length)
    .slice(0, 8)
    .map((c) => ({
      text: c.text,
      papers: c.papers.size,
      years: [...c.years].sort((a, b) => a - b),
      unitId: c.unit >= 0 ? live[c.unit].id : null,
    }))

  const styled = [...styleCounts.values()].reduce((a, b) => a + b, 0)
  const styles = [...styleCounts.entries()]
    .map(([style, n]) => ({ style, share: styled ? Math.round((n / styled) * 100) : 0 }))
    .sort((a, b) => b.share - a.share)

  const hotTopics = [...termQuestions.values()]
    .filter((t) => t.questions >= 2 && (parsed.length === 1 || t.papers.size >= 2))
    .sort((a, b) => b.papers.size - a.papers.size || b.questions - a.questions)
    .slice(0, 6)
    .map((t) => t.surface)

  return {
    papers: parsed.map((p) => ({ name: p.name, year: p.year ?? null, questions: p.questions.length, url: p.url })),
    totalQuestions: total,
    units: live.map((u, i) => ({ unitId: u.id, name: u.name, papers: unitPapers[i].size, questions: unitQuestions[i] })),
    repeats,
    styles,
    hotTopics,
    matched,
  }
}

const shortQ = (q: string, n = 70) => (q.length > n ? `${q.slice(0, n - 1).trimEnd()}…` : q)
const yearSpan = (years: number[]) => (years.length === 0 ? '' : years.length === 1 ? ` (${years[0]})` : ` (${years[0]}–${years[years.length - 1]})`)

/** Units that keep showing up get more weight; ones that never do get less. */
export function applyReport(units: BuddyUnit[], report: PyqReport): BuddyUnit[] {
  const n = report.papers.length
  if (n === 0) return units
  return units.map((u) => {
    const stat = report.units.find((s) => s.unitId === u.id)
    if (!stat || u.skipped) return u
    const meanQuestions = report.units.reduce((a, s) => a + s.questions, 0) / Math.max(1, report.units.length)
    const repeats = report.repeats.filter((r) => r.unitId === u.id).slice(0, 2).map((r) => `Repeat Q: ${shortQ(r.text, 60)}`)
    const focus = [...repeats, ...u.focus.filter((f) => !f.startsWith('Repeat Q:'))]
    const baseMarks = u.baseMarks ?? u.marks
    let marks = baseMarks
    // Syllabus-stated marks are facts; estimated ones follow the evidence.
    if (!u.marksKnown && report.matched >= 5) {
      // Twice the average number of questions → about 1.5× the marks; none → half.
      const relative = meanQuestions > 0 ? stat.questions / meanQuestions : 1
      const factor = n >= 3 && stat.papers === 0 ? 0.5 : Math.min(2, Math.max(0.5, 0.5 + 0.5 * relative))
      marks = Math.max(1, Math.round(baseMarks * factor))
    }
    return { ...u, marks, baseMarks, focus, pyq: { papers: stat.papers, of: n } }
  })
}

export function insightsFor(report: PyqReport): string {
  const n = report.papers.length
  if (n === 0) return ''
  const years = report.papers.map((p) => p.year).filter((y): y is number => !!y).sort((a, b) => a - b)
  const lines: string[] = []
  lines.push(
    `🤯 I X-rayed ${n} past paper${n === 1 ? '' : 's'}${yearSpan([...new Set(years)])}: ${report.totalQuestions} questions. Here's what your examiner doesn't want you to know:`,
  )
  const ranked = [...report.units].sort((a, b) => b.papers - a.papers || b.questions - a.questions)
  const byQuestions = [...report.units].sort((a, b) => b.questions - a.questions)
  const jackpot = n === 1 ? byQuestions[0] : ranked[0]
  if (jackpot && jackpot.questions > 0) {
    const pct = Math.round((jackpot.questions / Math.max(1, report.totalQuestions)) * 100)
    lines.push(
      n === 1
        ? `🔥 ${jackpot.name} got ${jackpot.questions} of the ${report.totalQuestions} questions (${pct}%). Biggest chunk of the paper. That's your jackpot.`
        : `🔥 ${jackpot.name} showed up in ${jackpot.papers} of ${n} papers (${jackpot.questions} questions). That's your jackpot.`,
    )
  }
  if (report.repeats.length) {
    lines.push(
      `🔁 Repeat offenders. These keep coming back:\n${report.repeats
        .slice(0, 3)
        .map((r) => `• "${shortQ(r.text)}" ×${r.papers}${yearSpan(r.years)}`)
        .join('\n')}`,
    )
  }
  const top = report.styles[0]
  if (top && top.share >= 20) lines.push(`🎯 This examiner loves ${STYLE_LABEL[top.style]}: ${top.share}% of questions. Practise those, not just reading.`)
  const sneaky = report.styles.find((s) => s.style === 'program' && s.share >= 10 && s !== top)
  if (sneaky) lines.push(`👀 Plot twist: ${sneaky.share}% of questions want you to write code or use software. Most people don't see that coming.`)
  const thin = byQuestions.filter((u) => u.questions > 0 && u.questions <= Math.max(2, report.totalQuestions * 0.08))
  if (n === 1 && thin.length && thin.length < byQuestions.length) {
    lines.push(`🪶 ${thin.slice(0, 3).map((u) => u.name.replace(/^Unit (\d+):.*/, 'Unit $1')).join(', ')} only got ${thin[0].questions === 1 ? 'one question' : 'a couple of questions'} each. Lower priority if time's tight.`)
  }
  const ghost = ranked.filter((u) => u.papers === 0)
  if (n >= 2 && ghost.length && ghost.length < ranked.length) {
    lines.push(`😴 ${ghost.slice(0, 2).map((u) => u.name).join(' and ')} barely ever show${ghost.length === 1 ? 's' : ''} up. If time's short, ${ghost.length === 1 ? 'it goes' : 'they go'} last.`)
  }
  if (report.hotTopics.length) lines.push(`🧲 Words that keep appearing: ${report.hotTopics.slice(0, 4).join(', ')}.`)
  const likely = report.repeats.filter((r) => r.papers >= Math.max(2, Math.ceil(n * 0.5))).slice(0, 2)
  if (likely.length) lines.push(`📈 If I had to bet on this year: ${likely.map((r) => `"${shortQ(r.text, 50)}"`).join(' and ')}.`)
  lines.push("I've re-weighted your plan around what actually gets asked. 😏")
  return lines.join('\n\n')
}

// ---------------------------------------------------------------------------
// Searching

export interface HuntProfile {
  subject: string
  college?: string
  code?: string
}

const SYNONYMS: Record<string, string> = {
  maths: 'mathematics',
  math: 'mathematics',
  bio: 'biology',
  chem: 'chemistry',
  phy: 'physics',
  eco: 'economics',
  dsa: 'data structures',
  os: 'operating systems',
  dbms: 'database management systems',
  cn: 'computer networks',
}

/** Subject words worth searching for: "Engineering Maths II" → engineering, mathematics. */
export function subjectTerms(subject: string): string[] {
  return subject
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !/^(i{1,3}|iv|v|vi|1|2|3|4|and|of|the|for|paper|exam|subject|sem|semester)$/.test(w))
    .map((w) => SYNONYMS[w] ?? w)
}

const PAPER_TITLE = '("question paper" OR "previous year" OR pyq OR "question bank" OR "model paper" OR "exam paper" OR "past paper" OR "semester question")'

/** Archive.org queries, most precise first. */
export function archiveQueries(p: HuntProfile): string[] {
  const terms = subjectTerms(p.subject)
  const subject = terms.length ? `title:(${terms.join(' ')})` : ''
  const college = p.college ? `(${p.college.replace(/["()]/g, ' ').trim()})` : ''
  const q: string[] = []
  if (p.code) q.push(`"${p.code}" AND mediatype:texts`)
  if (subject && college) q.push(`${subject} AND title:${PAPER_TITLE} AND ${college} AND mediatype:texts`)
  if (subject) q.push(`${subject} AND title:${PAPER_TITLE} AND mediatype:texts`)
  return q
}

export interface Candidate {
  identifier: string
  title: string
  year?: number
}

export function rankCandidates(found: Candidate[], p: HuntProfile): Candidate[] {
  const terms = subjectTerms(p.subject)
  const collegeWords = (p.college ?? '').toLowerCase().split(/\s+/).filter((w) => w.length >= 3)
  const score = (c: Candidate) => {
    const t = `${c.title} ${c.identifier}`.toLowerCase()
    let s = terms.filter((w) => t.includes(w)).length * 2
    s += collegeWords.filter((w) => t.includes(w)).length
    if (p.code && t.includes(p.code.toLowerCase())) s += 5
    if (/question|paper|pyq|exam/.test(t)) s += 2
    return s
  }
  const seen = new Set<string>()
  return found
    .filter((c) => (seen.has(c.identifier) ? false : (seen.add(c.identifier), true)))
    .map((c) => ({ c, s: score(c) }))
    .filter(({ s }) => s >= 3)
    .sort((a, b) => b.s - a.s)
    .map(({ c }) => c)
}

export interface SearchLink {
  label: string
  url: string
}

export function searchLinks(p: HuntProfile): SearchLink[] {
  const g = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`
  const where = p.college ? `${p.college} ` : ''
  const links: SearchLink[] = [
    { label: '📄 Past papers (PDF)', url: g(`${where}${p.subject} previous year question papers filetype:pdf`) },
  ]
  if (p.code) links.push({ label: `🔢 Papers for ${p.code}`, url: g(`"${p.code}" question paper`) })
  links.push(
    { label: '📚 Question banks', url: g(`${where}${p.subject} question bank important questions`) },
    { label: '▶️ Important-questions videos', url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${p.subject} important questions ${p.college ?? ''}`.trim())}` },
    { label: '💬 Seniors’ tips on Reddit', url: g(`${where}${p.subject} exam tips important topics site:reddit.com`) },
  )
  return links
}
