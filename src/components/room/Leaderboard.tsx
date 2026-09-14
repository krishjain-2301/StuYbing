"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatHoursMinutes } from "@/lib/utils";
import type { LeaderboardEntry } from "@/lib/types";
import type { LeaderboardPeriod } from "@/lib/leaderboard";

type Props = {
  roomId: string;
  initialDaily: LeaderboardEntry[];
  initialWeekly: LeaderboardEntry[];
  initialMonthly: LeaderboardEntry[];
};

const medals = ["1", "2", "3"];

export function Leaderboard({
  roomId,
  initialDaily,
  initialWeekly,
  initialMonthly,
}: Props) {
  const [period, setPeriod] = useState<LeaderboardPeriod>("daily");
  const [daily, setDaily] = useState(initialDaily);
  const [weekly, setWeekly] = useState(initialWeekly);
  const [monthly, setMonthly] = useState(initialMonthly);

  useEffect(() => {
    setDaily(initialDaily);
    setWeekly(initialWeekly);
    setMonthly(initialMonthly);
  }, [initialDaily, initialWeekly, initialMonthly]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`room-leaderboard:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "study_sessions",
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          const refresh = async (p: LeaderboardPeriod) => {
            const since = (() => {
              const d = new Date();
              if (p === "daily") {
                d.setHours(0, 0, 0, 0);
                return d.toISOString();
              }
              if (p === "weekly") {
                const day = d.getDay();
                const diff = day === 0 ? 6 : day - 1;
                d.setDate(d.getDate() - diff);
                d.setHours(0, 0, 0, 0);
                return d.toISOString();
              }
              return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
            })();

            const { data: sessions } = await supabase
              .from("study_sessions")
              .select("user_id, duration_seconds, started_at, ended_at")
              .eq("room_id", roomId)
              .gte("started_at", since);

            const totals = new Map<string, number>();
            const now = Date.now();
            for (const s of sessions || []) {
              let secs = s.duration_seconds || 0;
              if (!s.ended_at) {
                secs = Math.max(
                  0,
                  Math.floor((now - new Date(s.started_at).getTime()) / 1000),
                );
              }
              totals.set(s.user_id, (totals.get(s.user_id) || 0) + secs);
            }
            const ids = [...totals.keys()];
            if (!ids.length) return [];
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, username, avatar_url")
              .in("id", ids);
            const map = new Map((profiles || []).map((p) => [p.id, p]));
            return ids
              .map((id) => ({
                user_id: id,
                username: map.get(id)?.username || "Unknown",
                avatar_url: map.get(id)?.avatar_url || null,
                total_seconds: totals.get(id) || 0,
              }))
              .sort((a, b) => b.total_seconds - a.total_seconds);
          };

          setDaily(await refresh("daily"));
          setWeekly(await refresh("weekly"));
          setMonthly(await refresh("monthly"));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId]);

  const entries =
    period === "daily" ? daily : period === "weekly" ? weekly : monthly;

  const tabs: { id: LeaderboardPeriod; label: string }[] = [
    { id: "daily", label: "Today" },
    { id: "weekly", label: "This week" },
    { id: "monthly", label: "This month" },
  ];

  return (
    <section className="room-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          Leaderboard
        </h2>
        <div className="flex gap-1 rounded-full bg-white/50 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPeriod(tab.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                period === tab.id
                  ? "bg-[var(--ink)] text-[var(--paper)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <ol className="mt-4 space-y-2">
        {entries.map((entry, index) => (
          <li
            key={entry.user_id}
            className="leaderboard-row flex items-center justify-between gap-3 rounded-xl px-2 py-2"
          >
            <div className="flex items-center gap-3">
              <span className="w-6 text-center font-semibold text-[var(--teal)]">
                {index < 3 ? medals[index] : index + 1}
              </span>
              <span className="font-medium text-[var(--ink)]">
                {entry.username}
              </span>
            </div>
            <span className="font-mono text-sm">
              {formatHoursMinutes(entry.total_seconds)}
            </span>
          </li>
        ))}
        {entries.length === 0 ? (
          <li className="text-sm text-[var(--muted)]">
            No study time recorded yet. Be the first.
          </li>
        ) : null}
      </ol>
    </section>
  );
}
