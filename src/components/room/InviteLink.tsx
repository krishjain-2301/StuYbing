"use client";

import { useState } from "react";

export function InviteLink({ roomCode }: { roomCode: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/room/${roomCode}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={copy} className="btn-ghost text-xs sm:text-sm">
      {copied ? "Link copied" : `Invite · ${roomCode}`}
    </button>
  );
}
