"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Task, TaskPriority } from "@/lib/types";

export type TaskActionResult = {
  error?: string;
  success?: boolean;
  task?: Task;
};

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

export async function createTask(formData: FormData): Promise<TaskActionResult> {
  const { supabase, user, error } = await getAuthedClient();
  if (error || !supabase || !user) return { error: error || "Not authenticated." };

  const roomId = String(formData.get("room_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const title = String(formData.get("title") || "").trim();
  const priority = (String(formData.get("priority") || "medium") as TaskPriority);
  const deadlineRaw = String(formData.get("deadline") || "").trim();

  if (!title) return { error: "Task title is required." };
  if (!roomId) return { error: "Missing room." };

  const { data: task, error: insertError } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      room_id: roomId,
      title,
      priority: ["high", "medium", "low"].includes(priority)
        ? priority
        : "medium",
      deadline: deadlineRaw ? new Date(deadlineRaw).toISOString() : null,
    })
    .select("*")
    .single();

  if (insertError || !task) return { error: insertError?.message || "Failed." };

  revalidatePath(`/room/${roomCode}`);
  revalidatePath("/dashboard");
  return { success: true, task: task as Task };
}

export async function toggleTask(
  taskId: string,
  completed: boolean,
  roomCode: string,
): Promise<TaskActionResult> {
  const { supabase, user, error } = await getAuthedClient();
  if (error || !supabase || !user) return { error: error || "Not authenticated." };

  const { error: updateError } = await supabase
    .from("tasks")
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", taskId)
    .eq("user_id", user.id);

  if (updateError) return { error: updateError.message };

  revalidatePath(`/room/${roomCode}`);
  revalidatePath("/dashboard");
  revalidatePath("/stats");
  return { success: true };
}

export async function updateTask(formData: FormData): Promise<TaskActionResult> {
  const { supabase, user, error } = await getAuthedClient();
  if (error || !supabase || !user) return { error: error || "Not authenticated." };

  const taskId = String(formData.get("task_id") || "");
  const roomCode = String(formData.get("room_code") || "");
  const title = String(formData.get("title") || "").trim();
  const priority = String(formData.get("priority") || "medium");

  if (!taskId || !title) return { error: "Invalid task update." };

  const { error: updateError } = await supabase
    .from("tasks")
    .update({
      title,
      priority: ["high", "medium", "low"].includes(priority) ? priority : "medium",
    })
    .eq("id", taskId)
    .eq("user_id", user.id);

  if (updateError) return { error: updateError.message };

  revalidatePath(`/room/${roomCode}`);
  return { success: true };
}

export async function deleteTask(
  taskId: string,
  roomCode: string,
): Promise<TaskActionResult> {
  const { supabase, user, error } = await getAuthedClient();
  if (error || !supabase || !user) return { error: error || "Not authenticated." };

  const { error: deleteError } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("user_id", user.id);

  if (deleteError) return { error: deleteError.message };

  revalidatePath(`/room/${roomCode}`);
  revalidatePath("/dashboard");
  return { success: true };
}
