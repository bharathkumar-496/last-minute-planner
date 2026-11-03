# Last Minute Planner

**What should I study right now to save the most marks?**
A funny, mobile-first exam survival planner. Live at **https://lastminuteplanner.vercel.app**

- Priority planner: marks × (6 − confidence) ÷ hours, 25-minute blocks, sleep always protected
- Panic Meter, "I Wasted Time 💀" instant replans, badges, Survival Report image
- Study Buddy (free, on-device): reads syllabus / notes / photos, chats, and X-rays past papers it finds online
- Pomodoro timer that keeps counting while the app is closed
- Google sign-in with cloud saving (Firebase), works offline-first with localStorage

## Run locally
```bash
npm install
cp .env.example .env.local   # optional: add Firebase keys for Google sign-in
npm run dev                  # http://localhost:5173
```

## Checks
```bash
npm run typecheck && npm test && npm run build
```

## Deploy
Pushing to `main` deploys to Vercel automatically. Google sign-in setup: see
[SETUP-GOOGLE-LOGIN.md](SETUP-GOOGLE-LOGIN.md).

Built with Vite, React, TypeScript, Tailwind CSS, Vitest and Firebase.
