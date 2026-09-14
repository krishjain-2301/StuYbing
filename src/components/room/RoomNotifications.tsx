"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Toast = { id: string; message: string };

export function RoomNotifications({
  roomId,
  username,
}: {
  roomId: string;
  username: string;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  function push(message: string) {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-3), { id, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`room-events:${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "notify" }, ({ payload }) => {
        if (payload?.message) push(String(payload.message));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.send({
            type: "broadcast",
            event: "notify",
            payload: { message: `${username} joined the room` },
          });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, username]);

  useEffect(() => {
    (window as unknown as { __stuybingNotify?: (m: string) => void }).__stuybingNotify =
      push;
    return () => {
      delete (window as unknown as { __stuybingNotify?: (m: string) => void })
        .__stuybingNotify;
    };
  }, []);

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast text-sm text-[var(--ink)]">
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export function notifyRoom(message: string) {
  if (typeof window === "undefined") return;
  (window as unknown as { __stuybingNotify?: (m: string) => void }).__stuybingNotify?.(
    message,
  );
}
