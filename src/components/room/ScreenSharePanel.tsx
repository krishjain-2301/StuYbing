"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { notifyRoom } from "@/components/room/RoomNotifications";

type SignalPayload =
  | { type: "share-started"; from: string; username: string }
  | { type: "share-stopped"; from: string }
  | { type: "offer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: "request-offer"; from: string; to: string };

type RemoteShare = {
  userId: string;
  username: string;
  stream: MediaStream;
};

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export function ScreenSharePanel({
  roomId,
  userId,
  username,
}: {
  roomId: string;
  userId: string;
  username: string;
}) {
  const [sharing, setSharing] = useState(false);
  const [remotes, setRemotes] = useState<RemoteShare[]>([]);
  const [error, setError] = useState<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const sharersRef = useRef<Map<string, string>>(new Map());

  const broadcast = useCallback((payload: SignalPayload) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "webrtc",
      payload,
    });
  }, []);

  const cleanupPeer = useCallback((peerId: string) => {
    const pc = peersRef.current.get(peerId);
    if (pc) {
      pc.close();
      peersRef.current.delete(peerId);
    }
    setRemotes((prev) => prev.filter((r) => r.userId !== peerId));
  }, []);

  const stopSharing = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setSharing(false);
    broadcast({ type: "share-stopped", from: userId });
    notifyRoom(`${username} stopped sharing`);
  }, [broadcast, userId, username]);

  const ensurePeer = useCallback(
    (peerId: string, isInitiator: boolean) => {
      let pc = peersRef.current.get(peerId);
      if (pc) return pc;

      pc = new RTCPeerConnection(ICE_SERVERS);
      peersRef.current.set(peerId, pc);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          broadcast({
            type: "ice",
            from: userId,
            to: peerId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (!stream) return;
        setRemotes((prev) => {
          const without = prev.filter((r) => r.userId !== peerId);
          return [
            ...without,
            {
              userId: peerId,
              username: sharersRef.current.get(peerId) || "Peer",
              stream,
            },
          ];
        });
      };

      pc.onconnectionstatechange = () => {
        if (
          pc &&
          (pc.connectionState === "failed" ||
            pc.connectionState === "closed" ||
            pc.connectionState === "disconnected")
        ) {
          cleanupPeer(peerId);
        }
      };

      if (isInitiator && localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc!.addTrack(track, localStreamRef.current!);
        });
      }

      return pc;
    },
    [broadcast, cleanupPeer, userId],
  );

  const createOfferFor = useCallback(
    async (peerId: string) => {
      const pc = ensurePeer(peerId, true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      broadcast({
        type: "offer",
        from: userId,
        to: peerId,
        sdp: offer,
      });
    },
    [broadcast, ensurePeer, userId],
  );

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`room-webrtc:${roomId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "webrtc" }, async ({ payload }) => {
        const msg = payload as SignalPayload;
        if (!msg || msg.from === userId) return;

        if (msg.type === "share-started") {
          sharersRef.current.set(msg.from, msg.username);
          notifyRoom(`${msg.username} started sharing their screen`);
          broadcast({ type: "request-offer", from: userId, to: msg.from });
          return;
        }

        if (msg.type === "share-stopped") {
          sharersRef.current.delete(msg.from);
          cleanupPeer(msg.from);
          return;
        }

        if (msg.type === "request-offer" && msg.to === userId && localStreamRef.current) {
          await createOfferFor(msg.from);
          return;
        }

        if (msg.type === "offer" && msg.to === userId) {
          const pc = ensurePeer(msg.from, false);
          await pc.setRemoteDescription(msg.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          broadcast({
            type: "answer",
            from: userId,
            to: msg.from,
            sdp: answer,
          });
          return;
        }

        if (msg.type === "answer" && msg.to === userId) {
          const pc = peersRef.current.get(msg.from);
          if (pc) await pc.setRemoteDescription(msg.sdp);
          return;
        }

        if (msg.type === "ice" && msg.to === userId) {
          const pc = peersRef.current.get(msg.from);
          if (pc && msg.candidate) {
            try {
              await pc.addIceCandidate(msg.candidate);
            } catch {
              // ignore late candidates
            }
          }
        }
      })
      .subscribe();

    return () => {
      stopSharing();
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId]);

  async function startSharing() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setSharing(true);
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stopSharing();
      });
      broadcast({ type: "share-started", from: userId, username });
      notifyRoom(`${username} started sharing their screen`);
    } catch {
      setError("Screen share was blocked or cancelled.");
    }
  }

  return (
    <section className="room-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Screen shares</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Live only — never recorded, stored, or uploaded.
          </p>
        </div>
        {!sharing ? (
          <button type="button" className="btn-primary" onClick={startSharing}>
            Share screen
          </button>
        ) : (
          <button type="button" className="btn-danger" onClick={stopSharing}>
            Stop sharing
          </button>
        )}
      </div>

      {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {sharing ? (
          <div className="screen-tile">
            <video ref={localVideoRef} autoPlay muted playsInline />
            <div className="absolute bottom-2 left-2 rounded-full bg-black/55 px-3 py-1 text-xs text-white">
              You · live
            </div>
          </div>
        ) : null}
        {remotes.map((remote) => (
          <RemoteVideo key={remote.userId} remote={remote} />
        ))}
        {!sharing && remotes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-10 text-center text-sm text-[var(--muted)] sm:col-span-2">
            No one is sharing yet. Click Share screen to start a live stream.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function RemoteVideo({ remote }: { remote: RemoteShare }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = remote.stream;
  }, [remote.stream]);

  return (
    <div className="screen-tile">
      <video ref={ref} autoPlay playsInline />
      <div className="absolute bottom-2 left-2 rounded-full bg-black/55 px-3 py-1 text-xs text-white">
        {remote.username} · live
      </div>
    </div>
  );
}
