"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useTransition, Suspense } from "react";
import { signIn } from "@/actions/auth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";
  const authError = searchParams.get("error");
  const [error, setError] = useState<string | null>(
    authError ? "Authentication failed. Try again." : null,
  );
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link href="/" className="font-display text-3xl font-bold text-[var(--ink)]">
          StuYbing
        </Link>
        <ThemeToggle />
      </div>
      <div className="room-panel p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Log in to join your study room.
        </p>

        <form
          className="mt-8 space-y-3"
          action={(formData) => {
            startTransition(async () => {
              formData.set("next", next);
              const result = await signIn(formData);
              if (result?.error) setError(result.error);
            });
          }}
        >
          <input
            className="input"
            type="email"
            name="email"
            placeholder="Email"
            required
          />
          <input
            className="input"
            type="password"
            name="password"
            placeholder="Password"
            required
          />
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          <button type="submit" className="btn-primary w-full" disabled={pending}>
            {pending ? "Signing in…" : "Log in"}
          </button>
        </form>
      </div>

      <p className="mt-6 text-sm text-[var(--muted)]">
        No account?{" "}
        <Link href="/signup" className="font-medium text-[var(--accent)]">
          Sign up
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
