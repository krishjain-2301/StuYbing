import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ensureProfile } from "@/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { getRoomLeaderboard } from "@/lib/leaderboard";
import { startOfDayISO } from "@/lib/utils";
import { StudyTimer } from "@/components/room/StudyTimer";
import { MemberList, type MemberRow } from "@/components/room/MemberList";
import { Leaderboard } from "@/components/room/Leaderboard";
import { TodoList } from "@/components/room/TodoList";
import { InviteLink } from "@/components/room/InviteLink";
import { RoomMedia } from "@/components/room/RoomMedia";
import { RoomChat } from "@/components/room/RoomChat";
import { LeaveRoomButton } from "@/components/room/LeaveRoomButton";
import { RoomNotifications } from "@/components/room/RoomNotifications";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { ChatMessage, Task } from "@/lib/types";

type Props = {
  params: Promise<{ code: string }>;
};

export default async function RoomPage({ params }: Props) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const profile = await ensureProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();

  const { data: joinInfoRaw } = await supabase.rpc("get_room_join_info", {
    p_code: roomCode,
  });
  const joinInfo = Array.isArray(joinInfoRaw) ? joinInfoRaw[0] : joinInfoRaw;
  if (!joinInfo?.id) notFound();

  const { data: membership } = await supabase
    .from("room_members")
    .select("id")
    .eq("room_id", joinInfo.id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership) {
    if (joinInfo.requires_password) {
      redirect(`/rooms/join?code=${joinInfo.room_code}`);
    }

    const { error: joinError } = await supabase.rpc("join_room_with_code", {
      p_code: joinInfo.room_code,
      p_password: null,
    });

    if (joinError) {
      redirect(`/rooms/join?code=${joinInfo.room_code}`);
    }
  }

  const { data: room } = await supabase
    .from("rooms")
    .select("id, name, description, room_code, owner_id")
    .eq("id", joinInfo.id)
    .maybeSingle();

  if (!room) notFound();

  const { data: memberRows } = await supabase
    .from("room_members")
    .select("user_id, profiles(username, avatar_url)")
    .eq("room_id", room.id);

  const { data: activeSessions } = await supabase
    .from("study_sessions")
    .select("user_id, started_at, last_heartbeat_at")
    .eq("room_id", room.id)
    .is("ended_at", null);

  const STALE_MS = 90_000;
  const activeMap = new Map(
    (activeSessions || [])
      .filter((s) => {
        if (!s.last_heartbeat_at) return true;
        return Date.now() - new Date(s.last_heartbeat_at).getTime() < STALE_MS;
      })
      .map((s) => [s.user_id, s.started_at]),
  );

  const dayStart = startOfDayISO();
  const { data: todaySessions } = await supabase
    .from("study_sessions")
    .select("user_id, duration_seconds, started_at, ended_at")
    .eq("room_id", room.id)
    .gte("started_at", dayStart);

  const todayMap = new Map<string, number>();
  const now = Date.now();
  for (const s of todaySessions || []) {
    let secs = s.duration_seconds || 0;
    if (!s.ended_at) {
      secs = Math.max(
        0,
        Math.floor((now - new Date(s.started_at).getTime()) / 1000),
      );
    }
    todayMap.set(s.user_id, (todayMap.get(s.user_id) || 0) + secs);
  }

  type ProfileJoin = { username: string; avatar_url: string | null };
  const members: MemberRow[] = (memberRows || []).map((m) => {
    const profileJoin = m.profiles as unknown as ProfileJoin | ProfileJoin[] | null;
    const p = Array.isArray(profileJoin) ? profileJoin[0] : profileJoin;
    return {
      user_id: m.user_id,
      username: p?.username || "Member",
      avatar_url: p?.avatar_url || null,
      today_seconds: todayMap.get(m.user_id) || 0,
      active_started_at: activeMap.get(m.user_id) || null,
    };
  });

  const myActive = activeMap.get(profile.id) || null;

  const [daily, weekly, monthly] = await Promise.all([
    getRoomLeaderboard(supabase, room.id, "daily"),
    getRoomLeaderboard(supabase, room.id, "weekly"),
    getRoomLeaderboard(supabase, room.id, "monthly"),
  ]);

  const { data: tasksData } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", profile.id)
    .eq("room_id", room.id)
    .order("created_at", { ascending: false });

  const tasks = (tasksData || []) as Task[];

  const { data: chatRows } = await supabase
    .from("room_messages")
    .select("id, room_id, user_id, body, created_at")
    .eq("room_id", room.id)
    .order("created_at", { ascending: true })
    .limit(100);

  const chatUserIds = [...new Set((chatRows || []).map((row) => row.user_id))];
  const { data: chatProfiles } = chatUserIds.length
    ? await supabase.from("profiles").select("id, username").in("id", chatUserIds)
    : { data: [] as { id: string; username: string }[] };

  const chatNames = new Map((chatProfiles || []).map((p) => [p.id, p.username]));
  const initialMessages: ChatMessage[] = (chatRows || []).map((row) => ({
    id: row.id,
    room_id: row.room_id,
    user_id: row.user_id,
    username: chatNames.get(row.user_id) || "Member",
    body: row.body,
    created_at: row.created_at,
  }));

  return (
    <div className="min-h-screen pb-16">
      <div className="nav-shell">
        <header className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <Link href="/dashboard" className="text-xs text-[var(--muted)]">
              ← Dashboard
            </Link>
            <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)] sm:text-4xl">
              {room.name}
            </h1>
            {room.description ? (
              <p className="mt-1 text-sm text-[var(--muted)]">{room.description}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 font-mono text-xs tracking-wider">
              Code {room.room_code}
            </span>
            <InviteLink roomCode={room.room_code} />
            <LeaveRoomButton roomCode={room.room_code} />
            <ThemeToggle />
          </div>
        </header>
      </div>

      <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 pt-4 sm:px-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <StudyTimer
            roomId={room.id}
            roomCode={room.room_code}
            initialStartedAt={myActive}
            username={profile.username}
          />
          <RoomMedia
            roomId={room.id}
            userId={profile.id}
            username={profile.username}
          />
          <TodoList
            roomId={room.id}
            roomCode={room.room_code}
            initialTasks={tasks}
          />
        </div>
        <div className="space-y-4">
          <MemberList
            roomId={room.id}
            currentUserId={profile.id}
            initialMembers={members}
          />
          <Leaderboard
            roomId={room.id}
            initialDaily={daily}
            initialWeekly={weekly}
            initialMonthly={monthly}
          />
          <RoomChat
            roomId={room.id}
            currentUserId={profile.id}
            initialMessages={initialMessages}
          />
        </div>
      </main>
      <RoomNotifications roomId={room.id} username={profile.username} />
    </div>
  );
}
