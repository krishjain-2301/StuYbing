"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { leaveRoom } from "@/actions/rooms";

export function LeaveRoomButton({ roomCode }: { roomCode: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className="btn-danger"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Leave this study room?")) return;
          startTransition(async () => {
            const result = await leaveRoom(roomCode);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? "Leaving…" : "Leave room"}
      </button>
      {error ? (
        <span className="text-xs text-[var(--danger)]">{error}</span>
      ) : null}
    </>
  );
}
