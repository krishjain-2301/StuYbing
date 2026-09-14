"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateRoomCode, hashRoomPassword } from "@/lib/utils";

export type ActionResult = { error?: string; success?: boolean };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return { supabase, user };
}

export async function createRoom(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const isPrivate = formData.get("is_private") === "on";
  const password = String(formData.get("password") || "").trim();

  if (!name || name.length < 2) {
    return { error: "Room name must be at least 2 characters." };
  }

  let roomCode: string | null = null;
  const { data: generatedCode } = await supabase.rpc("generate_unique_room_code");
  if (typeof generatedCode === "string" && generatedCode.length > 0) {
    roomCode = generatedCode;
  } else {
    roomCode = generateRoomCode();
  }

  const passwordHash =
    isPrivate && password ? await hashRoomPassword(password) : null;

  const { data: room, error } = await supabase
    .from("rooms")
    .insert({
      room_code: roomCode,
      name,
      description: description || null,
      is_private: isPrivate,
      password_hash: passwordHash,
      owner_id: user.id,
    })
    .select("id, room_code")
    .single();

  if (error || !room) {
    return { error: error?.message || "Could not create room." };
  }

  await supabase.from("room_members").insert({
    room_id: room.id,
    user_id: user.id,
  });

  redirect(`/room/${room.room_code}`);
}

export async function joinRoom(formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const code = String(formData.get("room_code") || "")
    .trim()
    .toUpperCase();
  const password = String(formData.get("password") || "").trim();

  if (!code) {
    return { error: "Enter a room code." };
  }

  const { data, error } = await supabase.rpc("join_room_with_code", {
    p_code: code,
    p_password: password || null,
  });

  if (error) {
    return { error: error.message.replace(/^.*exception:\s*/i, "") || "Could not join room." };
  }

  if (!data) {
    return { error: "Could not join room." };
  }

  revalidatePath("/dashboard");
  redirect(`/room/${code}`);
}
