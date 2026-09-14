import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const MIN_STREAK_SECONDS = 30 * 60;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export async function getDailyStudyMap(
  supabase: Supabase,
  userId: string,
  daysBack = 120,
): Promise<Map<string, number>> {
  const start = addDays(new Date(), -daysBack);
  start.setHours(0, 0, 0, 0);

  const { data: sessions } = await supabase
    .from("study_sessions")
    .select("duration_seconds, started_at, ended_at")
    .eq("user_id", userId)
    .gte("started_at", start.toISOString());

  const map = new Map<string, number>();
  const now = Date.now();

  for (const session of sessions || []) {
    const key = dayKey(new Date(session.started_at));
    let seconds = session.duration_seconds || 0;
    if (!session.ended_at) {
      seconds = Math.max(
        0,
        Math.floor((now - new Date(session.started_at).getTime()) / 1000),
      );
    }
    map.set(key, (map.get(key) || 0) + seconds);
  }

  return map;
}

export async function getStudyStreak(
  supabase: Supabase,
  userId: string,
): Promise<{ current: number; best: number }> {
  const map = await getDailyStudyMap(supabase, userId, 400);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let current = 0;
  let cursor = today;
  // Allow streak to continue if today hasn't hit minimum yet but yesterday did
  if ((map.get(dayKey(cursor)) || 0) < MIN_STREAK_SECONDS) {
    cursor = addDays(cursor, -1);
  }

  while ((map.get(dayKey(cursor)) || 0) >= MIN_STREAK_SECONDS) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  let best = 0;
  let run = 0;
  for (let i = 400; i >= 0; i--) {
    const key = dayKey(addDays(today, -i));
    if ((map.get(key) || 0) >= MIN_STREAK_SECONDS) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }

  return { current, best };
}

export async function getWeekSeries(
  supabase: Supabase,
  userId: string,
): Promise<{ label: string; seconds: number }[]> {
  const map = await getDailyStudyMap(supabase, userId, 14);
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  const monday = addDays(today, -mondayOffset);
  monday.setHours(0, 0, 0, 0);

  return labels.map((label, index) => {
    const d = addDays(monday, index);
    return {
      label,
      seconds: map.get(dayKey(d)) || 0,
    };
  });
}

export async function getMonthHeatmap(
  supabase: Supabase,
  userId: string,
  year: number,
  monthIndex: number,
): Promise<{ date: string; seconds: number }[]> {
  const map = await getDailyStudyMap(supabase, userId, 60);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: { date: string; seconds: number }[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, monthIndex, day);
    const key = dayKey(d);
    cells.push({ date: key, seconds: map.get(key) || 0 });
  }
  return cells;
}

export type Achievement = {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
};

export function evaluateAchievements(input: {
  totalSeconds: number;
  streak: number;
  tasksCompleted: number;
  hasFirstSession: boolean;
}): Achievement[] {
  const hours = input.totalSeconds / 3600;
  return [
    {
      id: "first-hour",
      title: "First Hour",
      description: "Study for at least 1 hour total",
      unlocked: hours >= 1,
    },
    {
      id: "ten-hours",
      title: "10 Hours Studied",
      description: "Reach 10 hours of tracked study",
      unlocked: hours >= 10,
    },
    {
      id: "fifty-hours",
      title: "50 Hours Studied",
      description: "Reach 50 hours of tracked study",
      unlocked: hours >= 50,
    },
    {
      id: "streak-7",
      title: "7 Day Streak",
      description: "Study 30+ minutes for 7 days in a row",
      unlocked: input.streak >= 7,
    },
    {
      id: "streak-30",
      title: "30 Day Streak",
      description: "Keep a 30-day study streak",
      unlocked: input.streak >= 30,
    },
    {
      id: "task-master",
      title: "Task Master",
      description: "Complete 25 tasks",
      unlocked: input.tasksCompleted >= 25,
    },
    {
      id: "first-session",
      title: "First Session",
      description: "Complete your first study session",
      unlocked: input.hasFirstSession,
    },
  ];
}
