"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatHoursMinutes } from "@/lib/utils";
import type { MemberStatus } from "@/lib/types";

export type MemberRow = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  today_seconds: number;
  active_started_at: string | null;
};

type Props = {
  roomId: string;
  currentUserId: string;
  initialMembers: MemberRow[];
};

function statusFor(
  member: MemberRow,
  onlineIds: Set<string>,
  now: number,
): MemberStatus {
  if (member.active_started_at) return "studying";
  if (onlineIds.has(member.user_id)) return "online";
  return "offline";
}

function StatusDot({ status }: { status: MemberStatus }) {
  const color =
    status === "studying"
      ? "bg-emerald-500"
      : status === "online"
        ? "bg-amber-400"
        : "bg-slate-300";
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${color} ${
        status === "studying" ? "status-glow" : ""
      }`}
    />
  );
}

export function MemberList({ roomId, currentUserId, initialMembers }: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setMembers(initialMembers);
  }, [initialMembers]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`room-presence:${roomId}`, {
      config: { presence: { key: currentUserId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setOnlineIds(new Set(Object.keys(state)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: currentUserId,
            online_at: new Date().toISOString(),
          });
        }
      });

    const sessionsChannel = supabase
      .channel(`room-sessions:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "study_sessions",
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          const { data: memberRows } = await supabase
            .from("room_members")
            .select("user_id, profiles(username, avatar_url)")
            .eq("room_id", roomId);

          const { data: activeSessions } = await supabase
            .from("study_sessions")
            .select("user_id, started_at, last_heartbeat_at")
            .eq("room_id", roomId)
            .is("ended_at", null);

          const activeMap = new Map(
            (activeSessions || [])
              .filter((s) => {
                if (!s.last_heartbeat_at) return true;
                return Date.now() - new Date(s.last_heartbeat_at).getTime() < 90_000;
              })
              .map((s) => [s.user_id, s.started_at]),
          );

          const dayStart = new Date();
          dayStart.setHours(0, 0, 0, 0);

          const { data: todaySessions } = await supabase
            .from("study_sessions")
            .select("user_id, duration_seconds, started_at, ended_at")
            .eq("room_id", roomId)
            .gte("started_at", dayStart.toISOString());

          const todayMap = new Map<string, number>();
          for (const s of todaySessions || []) {
            let secs = s.duration_seconds || 0;
            if (!s.ended_at) {
              secs = Math.max(
                0,
                Math.floor(
                  (Date.now() - new Date(s.started_at).getTime()) / 1000,
                ),
              );
            }
            todayMap.set(s.user_id, (todayMap.get(s.user_id) || 0) + secs);
          }

          type ProfileJoin = { username: string; avatar_url: string | null };
          setMembers(
            (memberRows || []).map((m) => {
              const profile = m.profiles as unknown as ProfileJoin | ProfileJoin[] | null;
              const p = Array.isArray(profile) ? profile[0] : profile;
              return {
                user_id: m.user_id,
                username: p?.username || "Member",
                avatar_url: p?.avatar_url || null,
                today_seconds: todayMap.get(m.user_id) || 0,
                active_started_at: activeMap.get(m.user_id) || null,
              };
            }),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      void supabase.removeChannel(sessionsChannel);
    };
  }, [roomId, currentUserId]);

  const rows = useMemo(() => {
    return [...members].sort((a, b) => {
      const sa = statusFor(a, onlineIds, now);
      const sb = statusFor(b, onlineIds, now);
      const rank = { studying: 0, online: 1, offline: 2 } as const;
      if (rank[sa] !== rank[sb]) return rank[sa] - rank[sb];
      return b.today_seconds - a.today_seconds;
    });
  }, [members, onlineIds, now]);

  return (
    <section className="room-panel p-5 sm:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
        People studying
      </h2>
      <ul className="mt-4 space-y-3">
        {rows.map((member) => {
          const status = statusFor(member, onlineIds, now);
          const liveExtra = member.active_started_at
            ? Math.max(
                0,
                Math.floor(
                  (now - new Date(member.active_started_at).getTime()) / 1000,
                ),
              )
            : 0;
          const displaySeconds = member.active_started_at
            ? liveExtra
            : member.today_seconds;
          const label =
            status === "studying"
              ? "Studying"
              : status === "online"
                ? "Online"
                : "Offline";

          return (
            <li
              key={member.user_id}
              className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 transition hover:bg-[var(--panel-strong)]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <StatusDot status={status} />
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--ink)]">
                    {member.username}
                    {member.user_id === currentUserId ? " (you)" : ""}
                  </p>
                  <p className="text-xs text-[var(--muted)]">{label}</p>
                </div>
              </div>
              <p className="shrink-0 font-mono text-sm text-[var(--ink)]">
                {formatHoursMinutes(displaySeconds)}
              </p>
            </li>
          );
        })}
        {rows.length === 0 ? (
          <li className="text-sm text-[var(--muted)]">No members yet.</li>
        ) : null}
      </ul>
    </section>
  );
}
