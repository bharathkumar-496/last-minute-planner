# Turning on Google login (free, ~10 minutes)

Without this, Last Minute Planner works fully but saves only on the device.
With it, students sign in with Google and their plan, Study Buddy chat, badges
and past exams follow them to any phone or laptop.

It uses **Firebase** (Google's free app backend). The free "Spark" plan is plenty:
50,000 reads and 20,000 writes a day. No credit card needed.

## 1. Create the Firebase project
1. Go to https://console.firebase.google.com and click **Create a project**
   (name it e.g. `last-minute-planner`; Google Analytics is optional).
2. In the project, click the **</>** (Web) icon to add a web app. Give it a name and
   click **Register app**. Firebase shows a `firebaseConfig` block. Keep it open.

## 2. Turn on Google sign-in
1. **Build → Authentication → Get started → Sign-in method → Google → Enable.**
2. Pick a support email and **Save**.
3. **Authentication → Settings → Authorized domains:** `localhost` is there already.
   When you put the site online, add its domain here (e.g. `myplanner.vercel.app`),
   or sign-in will say the address isn't allowed.

## 3. Turn on the database
1. **Build → Firestore Database → Create database** (production mode, any nearby region).
2. Open the **Rules** tab, replace everything with the contents of
   [`firestore.rules`](firestore.rules) from this project, and click **Publish**.
   These rules let each student read and write only their own data.

## 4. Connect the app
Copy `.env.example` to `.env.local` and fill in four values from `firebaseConfig`:

```
VITE_FIREBASE_API_KEY=...        # apiKey
VITE_FIREBASE_AUTH_DOMAIN=...    # authDomain
VITE_FIREBASE_PROJECT_ID=...     # projectId
VITE_FIREBASE_APP_ID=...         # appId
VITE_FIREBASE_EMULATOR=false
```

These are safe to ship in a website (Firebase web config isn't secret; the
security rules are what protect the data). Restart `npm run dev`, and a
**Sign in** button appears top-right.

When you deploy (Vercel, Netlify, Firebase Hosting…), add the same four
`VITE_FIREBASE_*` values as environment variables there.

## Testing without a real project
`npm run emulators` runs a fake Google sign-in and database locally
(needs Java 21; on Java 17 use `npx firebase-tools@13.35.1 emulators:start --only auth,firestore --project demo-last-minute-planner`).
Then use the emulator values shown at the bottom of `.env.example`.

## What gets saved
One document per student (`users/{their id}`): the exam setup, topics and
progress, the Study Buddy chat and past-paper X-ray, badges, past exams and the
Pomodoro timer. Uploaded files and downloaded past papers stay on the device.
When a student signs in on a device that already has data, the newer plan wins,
and badges and past exams from both are kept.

## Live site on Vercel (lastminuteplanner.vercel.app)
The app is deployed as the Vercel project `lastminuteplanner`. To make Google's
sign-in screen say "continue to **lastminuteplanner.vercel.app**" (instead of
`…firebaseapp.com`), the site serves Firebase's sign-in handler itself:

- `vercel.json` rewrites `/__/auth/*` to `https://last-minute-planner-f0923.firebaseapp.com/__/auth/*`
- On Vercel, `VITE_FIREBASE_AUTH_DOMAIN=lastminuteplanner.vercel.app`
  (locally, `.env.local` keeps `last-minute-planner-f0923.firebaseapp.com`)

Two allow-lists must include the site (one-time):
1. Firebase console → Authentication → Settings → **Authorized domains** → add
   `lastminuteplanner.vercel.app`
2. Google Cloud console → APIs & Services → **Credentials** → OAuth 2.0 Client
   "Web client (auto created by Google Service)":
   - Authorized JavaScript origins: `https://lastminuteplanner.vercel.app`
   - Authorized redirect URIs: `https://lastminuteplanner.vercel.app/__/auth/handler`

Redeploy after changes: `npx vercel deploy --prod`
