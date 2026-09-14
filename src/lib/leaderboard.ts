import {
  startOfDayISO,
  startOfMonthISO,
  startOfWeekISO,
} from "@/lib/utils";
import type { LeaderboardEntry } from "@/lib/types";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type LeaderboardPeriod = "daily" | "weekly" | "monthly";

function periodStart(period: LeaderboardPeriod): string {
  if (period === "daily") return startOfDayISO();
  if (period === "weekly") return startOfWeekISO();
  return startOfMonthISO();
}

export async function getRoomLeaderboard(
  supabase: Supabase,
  roomId: string,
  period: LeaderboardPeriod,
): Promise<LeaderboardEntry[]> {
  const since = periodStart(period);

  const { data: sessions } = await supabase
    .from("study_sessions")
    .select("user_id, duration_seconds, started_at, ended_at")
    .eq("room_id", roomId)
    .gte("started_at", since);

  if (!sessions?.length) return [];

  const totals = new Map<string, number>();
  const now = Date.now();

  for (const session of sessions) {
    let seconds = session.duration_seconds ?? 0;
    if (!session.ended_at && session.started_at) {
      const started = new Date(session.started_at).getTime();
      seconds = Math.max(0, Math.floor((now - started) / 1000));
    }
    totals.set(session.user_id, (totals.get(session.user_id) || 0) + seconds);
  }

  const userIds = [...totals.keys()];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", userIds);

  const profileMap = new Map(
    (profiles || []).map((p) => [p.id, p] as const),
  );

  return userIds
    .map((userId) => {
      const profile = profileMap.get(userId);
      return {
        user_id: userId,
        username: profile?.username || "Unknown",
        avatar_url: profile?.avatar_url || null,
        total_seconds: totals.get(userId) || 0,
      };
    })
    .sort((a, b) => b.total_seconds - a.total_seconds);
}

export async function getUserStudyTotals(
  supabase: Supabase,
  userId: string,
) {
  const day = startOfDayISO();
  const week = startOfWeekISO();
  const month = startOfMonthISO();

  const { data: sessions } = await supabase
    .from("study_sessions")
    .select("duration_seconds, started_at, ended_at")
    .eq("user_id", userId)
    .not("ended_at", "is", null);

  let today = 0;
  let thisWeek = 0;
  let thisMonth = 0;
  let total = 0;

  for (const session of sessions || []) {
    const seconds = session.duration_seconds || 0;
    total += seconds;
    if (session.started_at >= month) thisMonth += seconds;
    if (session.started_at >= week) thisWeek += seconds;
    if (session.started_at >= day) today += seconds;
  }

  const { data: active } = await supabase
    .from("study_sessions")
    .select("started_at")
    .eq("user_id", userId)
    .is("ended_at", null)
    .maybeSingle();

  if (active?.started_at) {
    const live = Math.max(
      0,
      Math.floor((Date.now() - new Date(active.started_at).getTime()) / 1000),
    );
    today += live;
    thisWeek += live;
    thisMonth += live;
    total += live;
  }

  return { today, thisWeek, thisMonth, total };
}
