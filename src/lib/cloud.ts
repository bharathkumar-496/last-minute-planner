// Google sign-in and saving to the student's account (Firebase Auth + Firestore,
// both free tier). Firebase loads only when cloud saving is configured and
// used, so the app stays light for everyone else.

import type { AppState } from './storage'

export interface CloudUser {
  uid: string
  name: string
  email: string
  photo: string | null
}

const env = import.meta.env
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
}
const useEmulators = env.VITE_FIREBASE_EMULATOR === 'true'

/** Without a Firebase project, the app simply stays local-only. */
export const cloudConfigured = Boolean(config.apiKey && config.projectId)

type Services = {
  auth: import('firebase/auth').Auth
  db: import('firebase/firestore/lite').Firestore
  authLib: typeof import('firebase/auth')
  dbLib: typeof import('firebase/firestore/lite')
}

let services: Promise<Services> | null = null

function load(): Promise<Services> {
  services ??= (async () => {
    const [{ initializeApp }, authLib, dbLib] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore/lite')])
    const app = initializeApp(config)
    const auth = authLib.getAuth(app)
    const db = dbLib.getFirestore(app)
    if (useEmulators) {
      authLib.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
      dbLib.connectFirestoreEmulator(db, '127.0.0.1', 8080)
    }
    return { auth, db, authLib, dbLib }
  })()
  return services
}

const toUser = (u: import('firebase/auth').User): CloudUser => ({
  uid: u.uid,
  name: u.displayName ?? u.email?.split('@')[0] ?? 'Student',
  email: u.email ?? '',
  photo: u.photoURL,
})

/** Calls back with the signed-in user (or null) now and whenever it changes. */
export function watchUser(callback: (user: CloudUser | null) => void): () => void {
  if (!cloudConfigured) return () => {}
  let stop = () => {}
  let cancelled = false
  load()
    .then(({ auth, authLib }) => {
      if (cancelled) return
      // Finishes a redirect sign-in (used when a popup was blocked).
      authLib.getRedirectResult(auth).catch(() => {})
      stop = authLib.onAuthStateChanged(auth, (u) => callback(u ? toUser(u) : null))
    })
    .catch(() => callback(null))
  return () => {
    cancelled = true
    stop()
  }
}

export class SignInError extends Error {}

/** Google refuses to sign in inside Instagram/WhatsApp/Facebook-style in-app browsers. */
export function inAppBrowser(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|LinkedInApp|; wv\)/i.test(ua)
}

export async function signInWithGoogle(): Promise<void> {
  if (inAppBrowser()) throw new SignInError('Google sign-in doesn\u2019t work inside this app\u2019s browser. Tap ⋮ or the share icon and choose "Open in Chrome" or "Open in Safari".')
  const { auth, authLib } = await load()
  const provider = new authLib.GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    await authLib.signInWithPopup(auth, provider)
  } catch (e) {
    const code = (e as { code?: string }).code ?? ''
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await authLib.signInWithRedirect(auth, provider)
      return
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') throw new SignInError('Sign-in cancelled.')
    if (code === 'auth/network-request-failed') throw new SignInError("Can't reach Google right now. Check your internet.")
    if (code === 'auth/unauthorized-domain') throw new SignInError('This website address isn’t allowed to sign in yet (see the setup guide).')
    throw new SignInError("Sign-in didn't work. Try again?")
  }
}

export async function signOutOfGoogle(): Promise<void> {
  const { auth, authLib } = await load()
  await authLib.signOut(auth)
}

// ---------------------------------------------------------------------------
// The saved copy: one document per student, holding the whole app state.

/** Firestore documents max out at 1 MB; long chats get trimmed to fit. */
const MAX_CHARS = 900_000

function serialise(state: AppState): string {
  let json = JSON.stringify(state)
  if (json.length > MAX_CHARS && state.buddy) {
    json = JSON.stringify({ ...state, buddy: { ...state.buddy, messages: state.buddy.messages.slice(-40) } })
  }
  return json
}

export async function loadFromCloud(uid: string): Promise<{ state: AppState; updatedAt: number } | null> {
  const { db, dbLib } = await load()
  const snap = await dbLib.getDoc(dbLib.doc(db, 'users', uid))
  if (!snap.exists()) return null
  const data = snap.data() as { data?: string; updatedAt?: number }
  if (typeof data.data !== 'string') return null
  try {
    return { state: JSON.parse(data.data) as AppState, updatedAt: data.updatedAt ?? 0 }
  } catch {
    return null
  }
}

export async function saveToCloud(uid: string, state: AppState, updatedAt: number): Promise<void> {
  const { db, dbLib } = await load()
  await dbLib.setDoc(dbLib.doc(db, 'users', uid), {
    data: serialise(state),
    updatedAt,
    savedAt: dbLib.serverTimestamp(),
    schema: 2,
  })
}
