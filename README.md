# StuYbing

A real-time study competition platform where friends study together, track study time, share screens live (never recorded), manage tasks, and compete on daily, weekly, and monthly leaderboards.

> **Study together. Stay accountable. Compete. Improve.**

## Features

- Email/password + Google authentication (Supabase Auth)
- Light / dark theme toggle
- Create / join private study rooms by code or invite link
- Server-timed study sessions (start / stop / heartbeat)
- Live member status + room notifications
- Live-only WebRTC screen sharing (no recording / storage)
- Room leaderboards (daily / weekly / monthly)
- Personal to-do list with priorities
- Study streaks (30+ min/day), weekly graph, calendar heat map
- Achievements + personal stats

## Tech stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase (Auth, Postgres, Realtime, RLS)
- WebRTC for peer-to-peer screen sharing

## Setup

### 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** and run [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql)
3. Enable **Email** auth under Authentication → Providers
4. (Optional) Enable **Google** OAuth and set the redirect URL to:
   `http://localhost:3000/auth/callback`

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

### 3. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Privacy

Screen shares are live-only peer streams. They are not recorded, stored, or uploaded for replay.
