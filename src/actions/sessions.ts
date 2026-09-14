"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SessionActionResult = {
  error?: string;
  session?: {
    id: string;
    started_at: string;
    last_heartbeat_at: string | null;
  };
};

const STALE_MS = 90_000;

async function closeOwnStaleSessions(
  supabase: NonNullable<Awaited<ReturnType<typeof getAuthedClient>>["supabase"]>,
  userId: string,
) {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const { data: stale } = await supabase
    .from("study_sessions")
    .select("id, started_at")
    .eq("user_id", userId)
    .is("ended_at", null)
    .lt("last_heartbeat_at", cutoff);

  for (const session of stale || []) {
    const endedAt = new Date();
    const durationSeconds = Math.max(
      0,
      Math.floor((endedAt.getTime() - new Date(session.started_at).getTime()) / 1000),
    );
    await supabase
      .from("study_sessions")
      .update({
        ended_at: endedAt.toISOString(),
        duration_seconds: durationSeconds,
      })
      .eq("id", session.id)
      .eq("user_id", userId);
  }
}

async function getAuthedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated." as const, supabase: null, user: null };
  }
  return { supabase, user, error: null };
}

export async function startStudySession(
  roomId: string,
  roomCode: string,
): Promise<SessionActionResult> {
  const { supabase, user, error } = await getAuthedClient();
  if (error || !supabase || !user) return { error: error || "Not authenticated." };

  await closeOwnStaleSessions(supabase, user.id);

  const { data: membership } = await supabase
    .from("room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return { error: "You are not a member of this room." };
  }

  const { data: active } = await supabase
    .from("study_sessions")
    .select("id, started_at, last_heartbeat_at")
    .eq("user_id", user.id)
    .is("ended_at", null)
    .maybeSingle();

  if (active) {
    return {
      session: {
        id: active.id,
        started_at: active.started_at,
        last_heartbeat_at: active.last_heartbeat_at,
      },
    };
  }

  const { data: session, error: insertError } = await supabase
    .from("study_sessions")
    .insert({
      user_id: user.id,
      room_id: roomId,
    })
    .select("id, started_at, last_heartbeat_at")
    .single();

  if (insertError || !session) {
    return { error: insertError?.message || "Could not start session." };
  }

  revalidatePath(`/room/${roomCode}`);
  return { session };
}

export async function stopStudySession(
  roomCode: string,
): Promise<SessionActionResult> {
  const { supabase, user, error } = await getAuthedClient();
  if (error || !supabase || !user) return { error: error || "Not authenticated." };

  const { data: active } = await supabase
    .from("study_sessions")
    .select("id, started_at")
    .eq("user_id", user.id)
    .is("ended_at", null)
    .maybeSingle();

  if (!active) {
    return { error: "No active study session." };
  }

  const endedAt = new Date();
  const startedAt = new Date(active.started_at);
  const durationSeconds = Math.max(
    0,
    Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
  );

  const { error: updateError } = await supabase
    .from("study_sessions")
    .update({
      ended_at: endedAt.toISOString(),
      duration_seconds: durationSeconds,
      last_heartbeat_at: endedAt.toISOString(),
    })
    .eq("id", active.id)
    .eq("user_id", user.id);

  if (updateError) {
    return { error: updateError.message };
  }

  revalidatePath(`/room/${roomCode}`);
  revalidatePath("/dashboard");
  revalidatePath("/stats");
  return {};
}

export async function heartbeatStudySession(): Promise<SessionActionResult> {
  const { supabase, user, error } = await getAuthedClient();
  if (error || !supabase || !user) return { error: error || "Not authenticated." };

  await closeOwnStaleSessions(supabase, user.id);

  const now = new Date().toISOString();
  const { data: active, error: updateError } = await supabase
    .from("study_sessions")
    .update({ last_heartbeat_at: now })
    .eq("user_id", user.id)
    .is("ended_at", null)
    .select("id, started_at, last_heartbeat_at")
    .maybeSingle();

  if (updateError) {
    return { error: updateError.message };
  }

  if (!active) {
    return { error: "No active session." };
  }

  return {
    session: {
      id: active.id,
      started_at: active.started_at,
      last_heartbeat_at: active.last_heartbeat_at,
    },
  };
}
