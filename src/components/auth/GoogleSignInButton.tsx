"use client";

import { createClient } from "@/lib/supabase/client";

export function GoogleSignInButton({
  label = "Continue with Google",
  next = "/dashboard",
}: {
  label?: string;
  next?: string;
}) {
  async function handleClick() {
    const supabase = createClient();
    const origin = window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel)]"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
        <path
          fill="#EA4335"
          d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.3-1.9 3l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z"
        />
        <path
          fill="#34A853"
          d="M6.6 14.3l-.9.7-3 2.3C4.5 20.3 8 22.2 12 22.2c2.7 0 5-.9 6.7-2.4l-3.1-2.4c-.9.6-2 .9-3.6.9-2.8 0-5.1-1.9-5.9-4.4z"
        />
        <path
          fill="#4A90E2"
          d="M3.7 7.3C3.1 8.5 2.8 9.8 2.8 11.2c0 1.4.3 2.7.9 3.9l3.9-3c-.2-.6-.3-1.2-.3-1.9 0-.7.1-1.3.3-1.9l-3.9-3z"
        />
        <path
          fill="#FBBC05"
          d="M12 5.8c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 2.8 14.7 1.8 12 1.8 8 1.8 4.5 3.7 2.8 7.3l3.9 3c.8-2.5 3.1-4.5 5.3-4.5z"
        />
      </svg>
      {label}
    </button>
  );
}
