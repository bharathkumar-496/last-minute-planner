// The live part of the past-paper hunt. Free, keyless sources that allow
// browser requests: the Internet Archive (papers + their OCR text) and
// Wikipedia (to confirm the college's real name). Only the college, subject
// and subject code are sent; the student's files never leave the device.

import { archiveQueries, looksLikePaper, rankCandidates, type Candidate, type HuntProfile, type Paper } from './pyq'

const MAX_PAPERS = 6
const TIMEOUT_MS = 12_000

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

/** "anna univ" → "Anna University", when Wikipedia agrees. */
export async function canonicalCollege(name: string): Promise<string> {
  try {
    const [, titles] = await getJson<[string, string[]]>(
      `https://en.wikipedia.org/w/api.php?action=opensearch&limit=3&namespace=0&origin=*&search=${encodeURIComponent(name)}`,
    )
    const words = name.toLowerCase().split(/\s+/).filter((w) => w.length >= 3)
    const match = titles.find((t) => words.length > 0 && words.every((w) => t.toLowerCase().includes(w.slice(0, 4))))
    // Same name, different casing? Keep ours ("VTU Belgaum" beats "Vtu belgaum").
    return match && match.toLowerCase() !== name.toLowerCase() ? match : name
  } catch {
    return name
  }
}

interface ArchiveSearch {
  response: { docs: Array<{ identifier: string; title?: string | string[]; year?: string | number }> }
}

async function searchArchive(p: HuntProfile): Promise<Candidate[]> {
  const found: Candidate[] = []
  for (const q of archiveQueries(p)) {
    const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=year&rows=15&output=json`
    try {
      const { response } = await getJson<ArchiveSearch>(url)
      for (const d of response.docs) {
        const title = Array.isArray(d.title) ? d.title[0] : d.title ?? d.identifier
        found.push({ identifier: d.identifier, title, year: d.year ? Number(d.year) || undefined : undefined })
      }
    } catch {
      // try the next, broader query
    }
    if (rankCandidates(found, p).length >= MAX_PAPERS) break
  }
  return rankCandidates(found, p).slice(0, MAX_PAPERS * 2)
}

interface ArchiveMeta {
  files?: Array<{ name: string; size?: string }>
}

/** The archive keeps an OCR'd text copy of every PDF; that one is fetchable from the browser. */
async function paperText(c: Candidate): Promise<Paper | null> {
  try {
    const meta = await getJson<ArchiveMeta>(`https://archive.org/metadata/${encodeURIComponent(c.identifier)}`)
    const txt = meta.files?.find((f) => f.name.endsWith('_djvu.txt') && Number(f.size ?? 0) < 400_000)
    if (!txt) return null
    const res = await fetch(`https://archive.org/download/${encodeURIComponent(c.identifier)}/${encodeURIComponent(txt.name)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null
    const text = await res.text()
    if (!looksLikePaper(text)) return null
    return { name: c.title, text, year: c.year ?? null, url: `https://archive.org/details/${encodeURIComponent(c.identifier)}` }
  } catch {
    return null
  }
}

export interface HuntResult {
  college?: string
  papers: Paper[]
  /** False when the network itself failed, not just "found nothing". */
  reachable: boolean
}

export async function huntPapers(p: HuntProfile, onProgress: (message: string) => void): Promise<HuntResult> {
  let college = p.college
  if (college) {
    onProgress(`Checking who "${college}" is…`)
    college = await canonicalCollege(college)
  }
  onProgress('Searching the Internet Archive for past papers…')
  let candidates: Candidate[]
  try {
    candidates = await searchArchive({ ...p, college })
  } catch {
    return { college, papers: [], reachable: false }
  }
  if (candidates.length === 0) {
    const online = await fetch('https://archive.org/advancedsearch.php?q=test&rows=0&output=json', { signal: AbortSignal.timeout(TIMEOUT_MS) })
      .then((r) => r.ok)
      .catch(() => false)
    return { college, papers: [], reachable: online }
  }
  onProgress(`Found ${candidates.length} possible paper${candidates.length === 1 ? '' : 's'}. Reading them…`)
  const papers: Paper[] = []
  for (let i = 0; i < candidates.length && papers.length < MAX_PAPERS; i += 3) {
    const batch = await Promise.all(candidates.slice(i, i + 3).map(paperText))
    for (const paper of batch) if (paper && papers.length < MAX_PAPERS) papers.push(paper)
    onProgress(`Reading papers… ${papers.length} real question paper${papers.length === 1 ? '' : 's'} so far`)
  }
  return { college, papers, reachable: true }
}
