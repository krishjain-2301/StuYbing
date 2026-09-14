"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createRoom } from "@/actions/rooms";

export default function NewRoomPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [isPrivate, setIsPrivate] = useState(true);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-10">
      <Link href="/dashboard" className="text-sm text-[var(--muted)]">
        ← Dashboard
      </Link>
      <h1 className="mt-6 font-display text-4xl tracking-tight">Create room</h1>
      <p className="mt-2 text-[var(--muted)]">
        Make a private space for your study group.
      </p>

      <form
        className="room-panel mt-8 space-y-4 p-6"
        action={(formData) => {
          startTransition(async () => {
            const result = await createRoom(formData);
            if (result?.error) setError(result.error);
          });
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Room name</span>
          <input
            name="name"
            className="input"
            placeholder="VIT Exam Grind"
            required
            minLength={2}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Description (optional)</span>
          <textarea
            name="description"
            className="input min-h-24 resize-y"
            placeholder="Late-night revision crew"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_private"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
          />
          Private room
        </label>
        {isPrivate ? (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Room password (optional)</span>
            <input
              name="password"
              type="password"
              className="input"
              placeholder="Optional password"
            />
          </label>
        ) : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? "Creating…" : "Generate room"}
        </button>
      </form>
    </div>
  );
}
