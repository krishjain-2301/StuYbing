"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { signUp } from "@/actions/auth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
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
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Join friends in a private study room in seconds.
        </p>

        <form
          className="mt-8 space-y-3"
          action={(formData) => {
            startTransition(async () => {
              const result = await signUp(formData);
              if (result?.error) setError(result.error);
            });
          }}
        >
          <input
            className="input"
            type="text"
            name="username"
            placeholder="Username"
            required
          />
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
            placeholder="Password (min 6 characters)"
            minLength={6}
            required
          />
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          <button type="submit" className="btn-primary w-full" disabled={pending}>
            {pending ? "Creating…" : "Create account"}
          </button>
        </form>
      </div>

      <p className="mt-6 text-sm text-[var(--muted)]">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[var(--accent)]">
          Log in
        </Link>
      </p>
    </div>
  );
}
