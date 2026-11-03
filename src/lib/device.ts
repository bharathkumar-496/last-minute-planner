export function haptic(pattern: number | number[] = 15): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
  } catch {
    // unsupported, that's fine
  }
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function uid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }
}

let audio: AudioContext | null = null

/** A short two-note chime. Silent if audio is unavailable. */
export function chime(): void {
  try {
    audio ??= new AudioContext()
    const t = audio.currentTime
    for (const [i, freq] of [660, 880].entries()) {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t + i * 0.18)
      gain.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.4)
      osc.connect(gain).connect(audio.destination)
      osc.start(t + i * 0.18)
      osc.stop(t + i * 0.18 + 0.45)
    }
  } catch {
    // no sound, no problem
  }
}

export function askNotificationPermission(): void {
  try {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
  } catch {
    // unsupported
  }
}

/** Only notifies when the tab is in the background; the page shows it otherwise. */
export function notify(title: string, body: string): void {
  try {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body })
  } catch {
    // unsupported
  }
}
