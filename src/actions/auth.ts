"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { usernameFromEmail } from "@/lib/utils";

export type AuthResult = { error?: string };

export async function signUp(formData: FormData): Promise<AuthResult> {
  const supabase = await createClient();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const username = String(formData.get("username") || "").trim();

  if (!email || !password) {
    return { error: "Email and password are required." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: username || usernameFromEmail(email),
      },
    },
  });

  if (error) return { error: error.message };

  redirect("/dashboard");
}

export async function signIn(formData: FormData): Promise<AuthResult> {
  const supabase = await createClient();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) return { error: error.message };

  const next = String(formData.get("next") || "/dashboard");
  redirect(next.startsWith("/") ? next : "/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function ensureProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) return existing;

  const username =
    (user.user_metadata?.username as string) ||
    usernameFromEmail(user.email || "student");

  const { data: created } = await supabase
    .from("profiles")
    .upsert({
      id: user.id,
      username,
      avatar_url: (user.user_metadata?.avatar_url as string) || null,
    })
    .select("*")
    .single();

  return created;
}
