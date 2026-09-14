"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";
import { joinRoom } from "@/actions/rooms";

function JoinRoomForm() {
  const searchParams = useSearchParams();
  const presetCode = (searchParams.get("code") || "").toUpperCase();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-10">
      <Link href="/dashboard" className="text-sm text-[var(--muted)]">
        ← Dashboard
      </Link>
      <h1 className="mt-6 font-display text-4xl tracking-tight">Join room</h1>
      <p className="mt-2 text-[var(--muted)]">
        Enter a room code from your friend&apos;s invite.
      </p>

      <form
        className="room-panel mt-8 space-y-4 p-6"
        action={(formData) => {
          startTransition(async () => {
            const result = await joinRoom(formData);
            if (result?.error) setError(result.error);
          });
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Room code</span>
          <input
            name="room_code"
            className="input uppercase tracking-[0.2em]"
            placeholder="ABC123"
            defaultValue={presetCode}
            required
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Password (if required)</span>
          <input
            name="password"
            type="password"
            className="input"
            placeholder="Optional"
          />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? "Joining…" : "Join room"}
        </button>
      </form>
    </div>
  );
}

export default function JoinRoomPage() {
  return (
    <Suspense>
      <JoinRoomForm />
    </Suspense>
  );
}
