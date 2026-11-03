import { describe, expect, it } from 'vitest'
import { inAppBrowser } from './cloud'

describe('inAppBrowser', () => {
  it('spots in-app browsers where Google blocks sign-in', () => {
    expect(inAppBrowser('Mozilla/5.0 (iPhone) AppleWebKit Instagram 300.0')).toBe(true)
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit Chrome/120 Mobile WhatsApp')).toBe(true)
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36')).toBe(true)
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36')).toBe(false)
    expect(inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit Version/18.0 Mobile Safari/604.1')).toBe(false)
  })
})
