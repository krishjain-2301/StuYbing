import Link from "next/link";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { StudyGraph } from "@/components/stats/StudyGraph";
import { ensureProfile } from "@/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { getStudyStreak, getWeekSeries } from "@/lib/analytics";
import { getUserStudyTotals } from "@/lib/leaderboard";
import { formatHoursMinutes, startOfDayISO } from "@/lib/utils";

export default async function DashboardPage() {
  const profile = await ensureProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const [totals, streak, weekSeries] = await Promise.all([
    getUserStudyTotals(supabase, profile.id),
    getStudyStreak(supabase, profile.id),
    getWeekSeries(supabase, profile.id),
  ]);

  const { data: memberships } = await supabase
    .from("room_members")
    .select("joined_at, rooms(id, name, room_code)")
    .eq("user_id", profile.id)
    .order("joined_at", { ascending: false });

  const { data: todayTasks } = await supabase
    .from("tasks")
    .select("id, completed")
    .eq("user_id", profile.id)
    .gte("created_at", startOfDayISO());

  const tasksDone = (todayTasks || []).filter((t) => t.completed).length;
  const tasksTotal = (todayTasks || []).length;

  type RoomJoin = { id: string; name: string; room_code: string };
  const rooms = (memberships || [])
    .map((m) => {
      const room = m.rooms as unknown as RoomJoin | RoomJoin[] | null;
      return Array.isArray(room) ? room[0] : room;
    })
    .filter(Boolean) as RoomJoin[];

  const primaryRoom = rooms[0];
  let rankLabel = "Join a room to compete";

  if (primaryRoom) {
    const day = startOfDayISO();
    const { data: sessions } = await supabase
      .from("study_sessions")
      .select("user_id, duration_seconds, started_at, ended_at")
      .eq("room_id", primaryRoom.id)
      .gte("started_at", day);

    const totalsMap = new Map<string, number>();
    const now = Date.now();
    for (const s of sessions || []) {
      let secs = s.duration_seconds || 0;
      if (!s.ended_at) {
        secs = Math.max(
          0,
          Math.floor((now - new Date(s.started_at).getTime()) / 1000),
        );
      }
      totalsMap.set(s.user_id, (totalsMap.get(s.user_id) || 0) + secs);
    }
    const ranked = [...totalsMap.entries()].sort((a, b) => b[1] - a[1]);
    const idx = ranked.findIndex(([id]) => id === profile.id);
    if (idx >= 0) {
      rankLabel = `#${idx + 1} in ${primaryRoom.name}`;
    } else {
      rankLabel = `Unranked in ${primaryRoom.name}`;
    }
  }

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="min-h-screen">
      <AppNav username={profile.username} />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        <div className="fade-up flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-[var(--ink)] sm:text-5xl">
              {greeting}, {profile.username}
            </h1>
            <p className="mt-2 max-w-xl text-[var(--muted)]">
              Enter a room, start your timer, share your screen live, and climb
              the board.
            </p>
          </div>
          <div className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm font-semibold text-[var(--accent)]">
            {streak.current > 0
              ? `${streak.current}-day streak`
              : "Start a streak today"}
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <section className="stat-tile p-5 md:col-span-1">
            <p className="eyebrow">Today</p>
            <p className="relative z-10 mt-3 font-mono text-3xl font-semibold">
              {formatHoursMinutes(totals.today)}
            </p>
          </section>
          <section className="stat-tile p-5 md:col-span-1">
            <p className="eyebrow">Ranking</p>
            <p className="relative z-10 mt-3 text-lg font-semibold leading-snug">
              {rankLabel}
            </p>
          </section>
          <section className="stat-tile p-5 md:col-span-1">
            <p className="eyebrow">Tasks</p>
            <p className="relative z-10 mt-3 text-3xl font-semibold">
              {tasksDone}/{tasksTotal}
            </p>
          </section>
          <section className="stat-tile p-5 md:col-span-1">
            <p className="eyebrow">Best streak</p>
            <p className="relative z-10 mt-3 text-3xl font-semibold">
              {streak.best}d
            </p>
          </section>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <StudyGraph series={weekSeries} />
          </div>
          <section className="room-panel flex flex-col justify-between p-6 lg:col-span-2">
            <div>
              <p className="eyebrow">Quick start</p>
              <h2 className="mt-2 font-display text-2xl font-bold">
                Jump into focus
              </h2>
              <p className="mt-2 text-sm text-[var(--muted)]">
                Create a private room or join with a friend&apos;s code.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/rooms/new" className="btn-primary">
                Create room
              </Link>
              <Link href="/rooms/join" className="btn-secondary">
                Join with code
              </Link>
              <Link href="/stats" className="btn-ghost">
                Full stats
              </Link>
            </div>
          </section>
        </div>

        <section className="mt-10">
          <div className="flex items-center justify-between gap-3">
            <h2 className="eyebrow">Your rooms</h2>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {rooms.map((room) => (
              <li key={room.id}>
                <Link
                  href={`/room/${room.room_code}`}
                  className="feature-card group block p-5 transition hover:-translate-y-1"
                >
                  <p className="font-display text-xl font-bold text-[var(--ink)]">
                    {room.name}
                  </p>
                  <p className="mt-1 font-mono text-sm text-[var(--muted)]">
                    {room.room_code}
                  </p>
                  <p className="mt-5 text-sm font-semibold text-[var(--accent)] transition group-hover:translate-x-1">
                    Enter study room →
                  </p>
                </Link>
              </li>
            ))}
            {rooms.length === 0 ? (
              <li className="room-panel p-6 text-sm text-[var(--muted)]">
                No rooms yet. Create one and invite your friends.
              </li>
            ) : null}
          </ul>
        </section>
      </main>
    </div>
  );
}
