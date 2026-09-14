"use server";

import { createClient } from "@/lib/supabase/server";
import type { ChatMessage } from "@/lib/types";

export type ChatActionResult = {
  error?: string;
  message?: ChatMessage;
};

export async function sendRoomMessage(
  roomId: string,
  body: string,
): Promise<ChatActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const text = body.trim();
  if (!text) return { error: "Message cannot be empty." };
  if (text.length > 1000) return { error: "Message is too long." };

  const { data: membership } = await supabase
    .from("room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return { error: "You are not a member of this room." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  const username = profile?.username || "Member";

  const { data, error } = await supabase
    .from("room_messages")
    .insert({
      room_id: roomId,
      user_id: user.id,
      body: text,
    })
    .select("id, room_id, user_id, body, created_at")
    .single();

  if (error || !data) {
    return {
      error:
        error?.message?.includes("does not exist") || error?.code === "42P01"
          ? "Chat table is missing. Run supabase/migrations/002_room_messages.sql in the SQL editor."
          : error?.message || "Could not send message.",
    };
  }

  return {
    message: {
      ...data,
      username,
    },
  };
}
