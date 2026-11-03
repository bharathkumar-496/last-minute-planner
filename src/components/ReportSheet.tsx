import { useState } from 'react'
import { BADGES, type BadgeId } from '../lib/fun'
import type { Plan } from '../lib/planner'
import { Button } from './ui'
import { Sheet } from './Sheet'

export interface ReportData {
  subject: string
  cookedPct: number
  panic: string
  done: number
  saved: number
  released: number
  badges: BadgeId[]
}

export function reportFrom(subject: string, plan: Plan, doneCount: number, badges: BadgeId[]): ReportData {
  return {
    subject,
    cookedPct: plan.cookedPct,
    panic: plan.panic,
    done: doneCount,
    saved: doneCount + plan.topics.filter((t) => t.tier === 'lock-in').length,
    released: plan.topics.filter((t) => t.tier === 'let-go').length,
    badges,
  }
}

export function ReportSheet({ data, onClose }: { data: ReportData; onClose: () => void }) {
  const [state, setState] = useState<'idle' | 'working' | 'error' | 'saved'>('idle')

  const download = async () => {
    setState('working')
    try {
      const blob = await renderReport(data)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'survival-report.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      setState('saved')
    } catch {
      setState('error')
    }
  }

  const share = async () => {
    try {
      const blob = await renderReport(data)
      const file = new File([blob], 'survival-report.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My Survival Report' })
      }
    } catch {
      // user cancelled or unsupported
    }
  }

  const canShareFiles = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'

  return (
    <Sheet title="Survival Report" onClose={onClose}>
      <ReportCard data={data} />
      <div className="mt-5 grid gap-2">
        <Button variant="primary" big onClick={download} disabled={state === 'working'}>
          {state === 'working' ? 'Printing your report…' : 'Download as image ⬇️'}
        </Button>
        {canShareFiles && (
          <Button onClick={share} className="w-full">
            Share
          </Button>
        )}
        <p aria-live="polite" className="min-h-5 text-center text-sm font-bold">
          {state === 'saved' && 'Saved. Frame it. Or send it to the group chat.'}
          {state === 'error' && "Couldn't make the image on this browser. Screenshot it instead?"}
        </p>
      </div>
    </Sheet>
  )
}

function ReportCard({ data }: { data: ReportData }) {
  return (
    <figure
      aria-label={`Survival report for ${data.subject}: ${data.cookedPct}% cooked, ${data.saved} units saved, ${data.released} units released`}
      className="overflow-hidden rounded-2xl border-[3px] border-ink bg-[#f4efe3] text-[#141414] hard-shadow"
    >
      <div className="hazard h-5" aria-hidden />
      <div className="p-5">
        <p className="text-xs font-bold tracking-widest uppercase">Official-ish document</p>
        <p className="font-display text-3xl leading-none">SURVIVAL REPORT</p>
        <p className="mt-1 font-hand text-xl">{data.subject}</p>
        <div className="mt-4 flex items-center gap-4">
          <div className="grid size-28 shrink-0 -rotate-12 place-items-center rounded-full border-[5px] border-[#c8102e] text-center text-[#c8102e]">
            <div>
              <p className="font-display text-3xl leading-none">{data.cookedPct}%</p>
              <p className="font-display text-xs">COOKED</p>
            </div>
          </div>
          <p className="font-display text-lg leading-tight">{data.panic}</p>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ['Done', data.done],
            ['Saved', data.saved],
            ['Released 🕊️', data.released],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border-2 border-[#141414] bg-[#ffd23f] p-2">
              <dt className="text-xs font-bold">{k}</dt>
              <dd className="font-display text-2xl">{v}</dd>
            </div>
          ))}
        </dl>
        {data.badges.length > 0 && (
          <p className="mt-3 text-sm font-bold">{data.badges.map((b) => `${BADGES[b].emoji} ${BADGES[b].name}`).join('  ·  ')}</p>
        )}
        <p className="mt-3 text-xs font-bold text-[#4a4640]">Last Minute Planner · sleep was protected</p>
      </div>
    </figure>
  )
}

/** Draws the report on a canvas so it downloads as a crisp 1080×1350 PNG. */
async function renderReport(d: ReportData): Promise<Blob> {
  try {
    await Promise.all([
      document.fonts.load('96px "Archivo Black"'),
      document.fonts.load('48px "Permanent Marker"'),
      document.fonts.load('bold 32px "Space Grotesk"'),
    ])
  } catch {
    // fall back to system fonts
  }
  const W = 1080
  const H = 1350
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')

  const ink = '#141414'
  const red = '#c8102e'
  const yellow = '#ffd23f'
  const display = '"Archivo Black", "Arial Black", sans-serif'
  const hand = '"Permanent Marker", cursive'
  const body = '"Space Grotesk", Arial, sans-serif'

  ctx.fillStyle = '#f4efe3'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = '#c9dcec'
  ctx.lineWidth = 2
  for (let y = 180; y < H; y += 48) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(W, y)
    ctx.stroke()
  }
  ctx.strokeStyle = '#e3877f'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(70, 0)
  ctx.lineTo(70, H)
  ctx.stroke()

  // Hazard tape
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, W, 70)
  ctx.clip()
  ctx.fillStyle = yellow
  ctx.fillRect(0, 0, W, 70)
  ctx.fillStyle = ink
  for (let x = -70; x < W + 70; x += 56) {
    ctx.beginPath()
    ctx.moveTo(x, 70)
    ctx.lineTo(x + 28, 70)
    ctx.lineTo(x + 98, 0)
    ctx.lineTo(x + 70, 0)
    ctx.fill()
  }
  ctx.restore()
  ctx.fillStyle = ink
  ctx.fillRect(0, 70, W, 6)

  ctx.fillStyle = ink
  ctx.font = `bold 28px ${body}`
  ctx.fillText('OFFICIAL-ISH DOCUMENT', 110, 150)
  ctx.font = `96px ${display}`
  ctx.fillText('SURVIVAL', 110, 260)
  ctx.fillText('REPORT', 110, 360)
  ctx.font = `52px ${hand}`
  ctx.fillText(truncate(ctx, d.subject, 860), 110, 440)

  // Stamp
  ctx.save()
  ctx.translate(320, 650)
  ctx.rotate(-0.21)
  ctx.strokeStyle = red
  ctx.lineWidth = 14
  ctx.beginPath()
  ctx.arc(0, 0, 175, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(0, 0, 150, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = red
  ctx.textAlign = 'center'
  ctx.font = `110px ${display}`
  ctx.fillText(`${d.cookedPct}%`, 0, 30)
  ctx.font = `40px ${display}`
  ctx.fillText('COOKED', 0, 90)
  ctx.restore()

  ctx.fillStyle = ink
  ctx.font = `48px ${display}`
  wrap(ctx, d.panic, 560, 600, 440, 58)

  const stats: Array<[string, number]> = [
    ['UNITS DONE', d.done],
    ['UNITS SAVED', d.saved],
    ['RELEASED 🕊️', d.released],
  ]
  stats.forEach(([label, value], i) => {
    const x = 110 + i * 300
    const y = 880
    ctx.fillStyle = ink
    ctx.fillRect(x + 8, y + 8, 270, 190)
    ctx.fillStyle = yellow
    ctx.fillRect(x, y, 270, 190)
    ctx.strokeStyle = ink
    ctx.lineWidth = 5
    ctx.strokeRect(x, y, 270, 190)
    ctx.fillStyle = ink
    ctx.textAlign = 'center'
    ctx.font = `bold 28px ${body}`
    ctx.fillText(label, x + 135, y + 55)
    ctx.font = `96px ${display}`
    ctx.fillText(String(value), x + 135, y + 160)
    ctx.textAlign = 'left'
  })

  ctx.font = d.badges.length ? `bold 34px ${body}` : `40px ${hand}`
  ctx.fillStyle = ink
  ctx.fillText(
    d.badges.length ? d.badges.map((b) => `${BADGES[b].emoji} ${BADGES[b].name}`).join('   ') : 'No badges yet. The night is young.',
    110,
    1170,
    860,
  )
  ctx.font = `bold 28px ${body}`
  ctx.fillStyle = '#4a4640'
  ctx.fillText('Last Minute Planner · sleep was protected', 110, 1280)

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'))
}

function truncate(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t}…`
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  let line = ''
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > max && line) {
      ctx.fillText(line, x, y)
      line = word
      y += lh
    } else line = test
  }
  if (line) ctx.fillText(line, x, y)
}
