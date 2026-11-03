// Pure "personality" logic: badges, wasted-time jokes, completion lines.

export type BadgeId = 'back-from-the-dead' | 'one-night-warrior' | 'touched-grass'

export const BADGES: Record<BadgeId, { name: string; emoji: string; blurb: string }> = {
  'back-from-the-dead': {
    name: 'Back From The Dead',
    emoji: '🧟',
    blurb: 'Dragged the Panic Meter down 30+ points from the danger zone.',
  },
  'one-night-warrior': {
    name: 'One Night Warrior',
    emoji: '🌙',
    blurb: 'Finished 3 topics in the final 24 hours. And still slept.',
  },
  'touched-grass': {
    name: 'Touched Grass',
    emoji: '🌱',
    blurb: 'Admitted to wasting time, then came back and finished a topic.',
  },
}

export interface BadgeContext {
  peakCooked: number
  cookedPct: number
  examAt: number
  completions: number[]
  wasteLogs: number[]
}

export function earnedBadges(ctx: BadgeContext): BadgeId[] {
  const out: BadgeId[] = []
  if (ctx.peakCooked >= 55 && ctx.cookedPct <= ctx.peakCooked - 30) out.push('back-from-the-dead')
  const finalDay = ctx.completions.filter((t) => t <= ctx.examAt && ctx.examAt - t <= 24 * 3600_000)
  if (finalDay.length >= 3) out.push('one-night-warrior')
  const firstWaste = Math.min(...ctx.wasteLogs)
  if (ctx.wasteLogs.length > 0 && ctx.completions.some((t) => t > firstWaste)) out.push('touched-grass')
  return out
}

export const WASTE_REASONS = [
  { id: 'instagram', label: 'Instagram got me', emoji: '📱' },
  { id: 'nap', label: 'Accidental nap', emoji: '😴' },
  { id: 'cleaning', label: 'Started cleaning my room', emoji: '🧹' },
  { id: 'custom', label: 'Custom', emoji: '✍️' },
] as const
export type WasteReasonId = (typeof WASTE_REASONS)[number]['id']

const WASTE_JOKES: Record<WasteReasonId, string[]> = {
  instagram: [
    'The algorithm thanks you for your service. Back to the syllabus.',
    'You watched 40 reels. Not one was about Unit 3. Shocking.',
    'Doomscroll arc complete. Lock-in arc starts now.',
  ],
  nap: [
    'Your brain was saving its progress. Respect. Now load the next level.',
    'Accidental nap? Your body staged an intervention. Fair.',
    'Rested and dangerous. Let’s use it.',
  ],
  cleaning: [
    'The room has never been cleaner. The syllabus has never been more ignored.',
    'Classic. Nothing makes a desk shine like an exam tomorrow.',
    'Spotless room, clear mind. Now, the topics.',
  ],
  custom: [
    'Noted. No judgement. We just reshuffled the deck.',
    'It happens to everyone. The plan has been adjusted.',
    'Time spent is time spent. Here’s the new plan.',
  ],
}

export function wasteJoke(reason: WasteReasonId, seed: number): string {
  const options = WASTE_JOKES[reason]
  return options[Math.abs(Math.floor(seed)) % options.length]
}

const DONE_LINES = [
  (n: string) => `${n} didn't see that coming.`,
  (n: string) => `${n}: handled. Next victim?`,
  (n: string) => `${n} has left the chat.`,
  (n: string) => `Marks secured. ${n} never stood a chance.`,
]

export function doneLine(name: string, seed: number): string {
  return DONE_LINES[Math.abs(Math.floor(seed)) % DONE_LINES.length](name)
}

export const LOADING_LINES = [
  'Negotiating with your syllabus...',
  'Finding marks you can still save...',
]
