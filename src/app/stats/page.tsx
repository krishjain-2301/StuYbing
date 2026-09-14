import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { AchievementsGrid } from "@/components/stats/AchievementsGrid";
import { StudyCalendar } from "@/components/stats/StudyCalendar";
import { StudyGraph } from "@/components/stats/StudyGraph";
import { ensureProfile } from "@/actions/auth";
import { createClient } from "@/lib/supabase/server";
import {
  evaluateAchievements,
  getMonthHeatmap,
  getStudyStreak,
  getWeekSeries,
} from "@/lib/analytics";
import { getUserStudyTotals } from "@/lib/leaderboard";
import { formatHoursMinutes, startOfDayISO } from "@/lib/utils";

export default async function StatsPage() {
  const profile = await ensureProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const now = new Date();
  const [totals, streak, weekSeries, monthCells] = await Promise.all([
    getUserStudyTotals(supabase, profile.id),
    getStudyStreak(supabase, profile.id),
    getWeekSeries(supabase, profile.id),
    getMonthHeatmap(supabase, profile.id, now.getFullYear(), now.getMonth()),
  ]);

  const { count: tasksDoneToday } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("completed", true)
    .gte("completed_at", startOfDayISO());

  const { count: tasksTotalToday } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .gte("created_at", startOfDayISO());

  const { count: tasksCompletedAll } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("completed", true);

  const { count: completedSessions } = await supabase
    .from("study_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .not("ended_at", "is", null);

  const achievements = evaluateAchievements({
    totalSeconds: totals.total,
    streak: streak.current,
    tasksCompleted: tasksCompletedAll || 0,
    hasFirstSession: (completedSessions || 0) > 0,
  });

  const weekAvg = Math.floor(totals.thisWeek / 7);
  const monthAvg = Math.floor(totals.thisMonth / 30);

  return (
    <div className="min-h-screen">
      <AppNav username={profile.username} />
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6">
        <Link href="/dashboard" className="text-sm text-[var(--muted)]">
          ← Dashboard
        </Link>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">
          Your stats
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Streaks need 30+ minutes a day. Screen shares are never saved.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <section className="stat-tile p-5">
            <p className="eyebrow">Streak</p>
            <p className="relative z-10 mt-3 text-3xl font-semibold">
              {streak.current}d
            </p>
          </section>
          <section className="stat-tile p-5">
            <p className="eyebrow">Today</p>
            <p className="relative z-10 mt-3 font-mono text-2xl font-semibold">
              {formatHoursMinutes(totals.today)}
            </p>
          </section>
          <section className="stat-tile p-5">
            <p className="eyebrow">This week</p>
            <p className="relative z-10 mt-3 font-mono text-2xl font-semibold">
              {formatHoursMinutes(totals.thisWeek)}
            </p>
          </section>
          <section className="stat-tile p-5">
            <p className="eyebrow">Tasks today</p>
            <p className="relative z-10 mt-3 text-3xl font-semibold">
              {tasksDoneToday || 0}/{tasksTotalToday || 0}
            </p>
          </section>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <StudyGraph series={weekSeries} />
          <StudyCalendar
            year={now.getFullYear()}
            monthIndex={now.getMonth()}
            cells={monthCells}
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <section className="room-panel p-6">
            <p className="eyebrow">This month</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-[var(--muted)]">Study time</dt>
                <dd className="font-mono text-2xl font-semibold">
                  {formatHoursMinutes(totals.thisMonth)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--muted)]">Average / day</dt>
                <dd className="font-mono text-2xl font-semibold">
                  {formatHoursMinutes(monthAvg)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--muted)]">Week avg / day</dt>
                <dd className="font-mono text-2xl font-semibold">
                  {formatHoursMinutes(weekAvg)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--muted)]">All time</dt>
                <dd className="font-mono text-2xl font-semibold">
                  {formatHoursMinutes(totals.total)}
                </dd>
              </div>
            </dl>
          </section>
          <AchievementsGrid achievements={achievements} />
        </div>
      </main>
    </div>
  );
}
