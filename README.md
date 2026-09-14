# StuYbing

A real-time virtual study room where friends study together, share screens live (never recorded), track study time, complete tasks, and compete on daily, weekly, and monthly leaderboards.

> **Study together. Stay accountable. Compete. Improve.**

**Repo:** [github.com/krishjain-2301/StuYbing](https://github.com/krishjain-2301/StuYbing)

---

## Features

### Accounts & rooms
- Email/password authentication (Supabase Auth)
- Create private rooms with optional password
- Join via room code or invite link (`/room/ABC123`)
- Personal dashboard with rooms, ranking snippet, and quick actions

### Study experience
- Server-timed study sessions (start / stop / heartbeat — not client-clock based)
- Live member status: studying / online / offline
- Camera, microphone, and live-only WebRTC screen sharing (never recorded)
- Leave room (ends your study session)
- Personal to-do list with priorities
- In-room notifications (join, start/stop study, screen share)
- Live room chat

### Competition & progress
- Room leaderboards: daily / weekly / monthly
- Study streaks (30+ minutes per day)
- Weekly study graph + monthly calendar heat map
- Achievements and personal stats page

### UI
- **AMOLED dark** (true black + electric-blue accents) and light mode
- Theme toggle in the top-right nav
- Page enter transitions

---

## Tech stack

| Layer | Choice |
|--------|--------|
| App | Next.js (App Router), React, TypeScript, Tailwind CSS |
| Backend | Supabase (Auth, Postgres, Realtime, RLS) |
| Screen share | WebRTC + Supabase Realtime signaling |
| Hosting (free) | Vercel (app) + Supabase (data) |

---

## Local setup

### 1. Clone and install

```bash
git clone https://github.com/krishjain-2301/StuYbing.git
cd StuYbing
npm install
```

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. In **SQL Editor**, run [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql)
3. If the app already existed, also run [`supabase/migrations/002_room_messages.sql`](supabase/migrations/002_room_messages.sql) for room chat
4. Enable **Email** under Authentication → Providers

**Authentication → URL Configuration** (local):

| Setting | Value |
|--------|--------|
| Site URL | `http://localhost:3000` |
| Redirect URLs | `http://localhost:3000/auth/callback` |

### 3. Environment

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Get these from Supabase → **Project Settings → API**.

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy (free): Vercel + Supabase

1. Push to GitHub (already set up for this repo).
2. Import the repo on [vercel.com](https://vercel.com).
3. Add the same env vars:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy.

Then in Supabase Auth URL settings, **add** (keep localhost for local dev):

| Setting | Value |
|--------|--------|
| Site URL | `https://YOUR-APP.vercel.app` |
| Redirect URLs | `https://YOUR-APP.vercel.app/auth/callback` |

---

## Privacy

Screen sharing is **live-only**:

- Not recorded  
- Not stored  
- Not uploaded for later viewing  

Study time is stored as session metadata (start, end, duration) only.

---

## Project structure (high level)

```text
src/app/                 # Pages (landing, auth, dashboard, room, stats)
src/actions/             # Server actions (auth, rooms, sessions, tasks)
src/components/          # UI (room, stats, theme, nav)
src/lib/                 # Supabase clients, analytics, leaderboard helpers
supabase/migrations/     # Postgres schema + RLS
```

---

## Scripts

```bash
npm run dev      # Local development
npm run build    # Production build
npm run start    # Run production build
npm run lint     # ESLint
```
