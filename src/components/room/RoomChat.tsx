"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { sendRoomMessage } from "@/actions/chat";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage } from "@/lib/types";

type Props = {
  roomId: string;
  currentUserId: string;
  initialMessages: ChatMessage[];
};

export function RoomChat({ roomId, currentUserId, initialMessages }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(
    null,
  );

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`room-chat:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_messages",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string;
            room_id: string;
            user_id: string;
            body: string;
            created_at: string;
          };
          if (!row?.id) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [
              ...prev,
              {
                ...row,
                username: "Member",
              },
            ].slice(-200);
          });

          const { data: profile } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", row.user_id)
            .maybeSingle();

          if (profile?.username) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === row.id ? { ...m, username: profile.username } : m,
              ),
            );
          }
        },
      )
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        const msg = payload as ChatMessage | undefined;
        if (!msg?.id) return;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg].slice(-200);
        });
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [roomId]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = String(formData.get("body") || "").trim();
    if (!body) return;
    setError(null);
    form.reset();
    inputRef.current?.focus();

    startTransition(async () => {
      const result = await sendRoomMessage(roomId, body);
      if (result.error || !result.message) {
        setError(result.error || "Could not send.");
        return;
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === result.message!.id)) return prev;
        return [...prev, result.message!].slice(-200);
      });
      void channelRef.current?.send({
        type: "broadcast",
        event: "chat",
        payload: result.message,
      });
    });
  }

  return (
    <section className="room-panel flex min-h-80 flex-col p-5 sm:p-6">
      <h2 className="eyebrow">Room chat</h2>
      <div
        ref={listRef}
        className="mt-4 max-h-72 min-h-48 flex-1 space-y-2 overflow-y-auto pr-1"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No messages yet. Say hi to the room.
          </p>
        ) : (
          messages.map((message) => {
            const mine = message.user_id === currentUserId;
            return (
              <div
                key={message.id}
                className={`rounded-2xl px-3 py-2 text-sm ${
                  mine
                    ? "ml-6 bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "mr-6 bg-[var(--panel-strong)] text-[var(--ink)]"
                }`}
              >
                <p
                  className={`text-[0.65rem] font-semibold uppercase tracking-wider ${
                    mine ? "opacity-80" : "text-[var(--muted)]"
                  }`}
                >
                  {mine ? "You" : message.username}
                </p>
                <p className="mt-0.5 break-words">{message.body}</p>
              </div>
            );
          })
        )}
      </div>
      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          name="body"
          className="input min-w-0 flex-1"
          placeholder="Message the room…"
          maxLength={1000}
          autoComplete="off"
          disabled={pending}
        />
        <button type="submit" className="btn-primary shrink-0" disabled={pending}>
          {pending ? "…" : "Send"}
        </button>
      </form>
      {error ? <p className="mt-2 text-xs text-[var(--danger)]">{error}</p> : null}
    </section>
  );
}
