"use client";

import { useEffect, useState, useTransition } from "react";
import {
  heartbeatStudySession,
  startStudySession,
  stopStudySession,
} from "@/actions/sessions";
import { createClient } from "@/lib/supabase/client";
import { formatDuration } from "@/lib/utils";

type Props = {
  roomId: string;
  roomCode: string;
  initialStartedAt: string | null;
  username?: string;
};

export function StudyTimer({
  roomId,
  roomCode,
  initialStartedAt,
  username,
}: Props) {
  const [startedAt, setStartedAt] = useState<string | null>(initialStartedAt);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setStartedAt(initialStartedAt);
  }, [initialStartedAt]);

  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  useEffect(() => {
    if (!startedAt) return;
    const id = window.setInterval(() => {
      void heartbeatStudySession();
    }, 20000);
    void heartbeatStudySession();
    return () => window.clearInterval(id);
  }, [startedAt]);

  useEffect(() => {
    if (!startedAt) return;
    const onHide = () => {
      void fetch("/api/sessions/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode }),
        keepalive: true,
      });
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [startedAt, roomCode]);

  const elapsed = startedAt
    ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
    : 0;

  async function broadcast(message: string) {
    const supabase = createClient();
    const channel = supabase.channel(`room-events:${roomId}`);
    await channel.subscribe();
    await channel.send({
      type: "broadcast",
      event: "notify",
      payload: { message },
    });
    void supabase.removeChannel(channel);
  }

  function onStart() {
    setError(null);
    startTransition(async () => {
      const result = await startStudySession(roomId, roomCode);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.session) {
        setStartedAt(result.session.started_at);
        setNow(Date.now());
        if (username) void broadcast(`${username} started studying`);
      }
    });
  }

  function onStop() {
    setError(null);
    startTransition(async () => {
      const result = await stopStudySession(roomCode);
      if (result.error) {
        setError(result.error);
        return;
      }
      setStartedAt(null);
      if (username) void broadcast(`${username} stopped studying`);
    });
  }

  return (
    <section className="room-panel relative overflow-hidden px-6 py-10 text-center sm:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(13,115,119,0.12),transparent_65%)]" />
      <p className="relative text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
        Your study timer
      </p>
      <div
        className={`relative mt-4 font-mono text-5xl font-semibold tracking-tight text-[var(--ink)] sm:text-6xl ${
          startedAt ? "timer-pulse" : ""
        }`}
      >
        {formatDuration(elapsed)}
      </div>
      <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
        {!startedAt ? (
          <button
            type="button"
            onClick={onStart}
            disabled={pending}
            className="btn-primary min-w-36"
          >
            {pending ? "Starting…" : "Start study"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onStop}
            disabled={pending}
            className="btn-danger min-w-36"
          >
            {pending ? "Stopping…" : "Stop study"}
          </button>
        )}
      </div>
      {error ? (
        <p className="relative mt-4 text-sm text-red-700">{error}</p>
      ) : null}
      <p className="relative mt-4 text-xs text-[var(--muted)]">
        Time is counted from the server clock. Leaving or closing this tab ends your session.
      </p>
    </section>
  );
}
