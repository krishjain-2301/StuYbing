"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createClient } from "@/lib/supabase/client";
import { ICE_SERVERS } from "@/lib/webrtc";
import { notifyRoom } from "@/components/room/RoomNotifications";

type Signal =
  | { type: "hello"; from: string; username: string }
  | { type: "offer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: "bye"; from: string };

type PeerBundle = {
  pc: RTCPeerConnection;
  camera: RTCRtpTransceiver;
  mic: RTCRtpTransceiver;
  screen: RTCRtpTransceiver;
  pendingIce: RTCIceCandidateInit[];
  makingOffer: boolean;
};

type RemoteMedia = {
  userId: string;
  username: string;
  camera: MediaStream;
  screen: MediaStream | null;
};

export function RoomMedia({
  roomId,
  userId,
  username,
}: {
  roomId: string;
  userId: string;
  username: string;
}) {
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [remotes, setRemotes] = useState<RemoteMedia[]>([]);
  const [error, setError] = useState<string | null>(null);

  const localCamRef = useRef<HTMLVideoElement | null>(null);
  const localScreenRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerBundle>>(new Map());
  const namesRef = useRef<Map<string, string>>(new Map());
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(
    null,
  );
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const broadcast = useCallback((payload: Signal) => {
    void channelRef.current?.send({
      type: "broadcast",
      event: "signal",
      payload,
    });
  }, []);

  const upsertRemote = useCallback(
    (peerId: string, patch: Partial<RemoteMedia>) => {
      setRemotes((prev) => {
        const existing = prev.find((r) => r.userId === peerId);
        const next: RemoteMedia = {
          userId: peerId,
          username: patch.username || existing?.username || namesRef.current.get(peerId) || "Peer",
          camera: patch.camera || existing?.camera || new MediaStream(),
          screen: patch.screen !== undefined ? patch.screen : existing?.screen || null,
        };
        return [...prev.filter((r) => r.userId !== peerId), next];
      });
    },
    [],
  );

  const applyLocalTracks = useCallback((peer: PeerBundle) => {
    const camTrack = cameraStreamRef.current?.getVideoTracks()[0] || null;
    const micTrack = cameraStreamRef.current?.getAudioTracks()[0] || null;
    const screenTrack = screenStreamRef.current?.getVideoTracks()[0] || null;
    void peer.camera.sender.replaceTrack(camTrack);
    void peer.mic.sender.replaceTrack(micTrack);
    void peer.screen.sender.replaceTrack(screenTrack);
  }, []);

  const teardownPeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId);
    if (peer) {
      peer.pc.close();
      peersRef.current.delete(peerId);
    }
    setRemotes((prev) => prev.filter((r) => r.userId !== peerId));
  }, []);

  const ensurePeer = useCallback(
    (peerId: string) => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      const camera = pc.addTransceiver("video", { direction: "sendrecv" });
      const mic = pc.addTransceiver("audio", { direction: "sendrecv" });
      const screen = pc.addTransceiver("video", { direction: "sendrecv" });
      const bundle: PeerBundle = {
        pc,
        camera,
        mic,
        screen,
        pendingIce: [],
        makingOffer: false,
      };
      peersRef.current.set(peerId, bundle);

      const cameraStream = new MediaStream();
      const screenStream = new MediaStream();
      upsertRemote(peerId, { camera: cameraStream, screen: null });

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        broadcast({
          type: "ice",
          from: userIdRef.current,
          to: peerId,
          candidate: event.candidate.toJSON(),
        });
      };

      pc.ontrack = (event) => {
        const track = event.track;
        if (event.transceiver === camera || event.transceiver.mid === camera.mid) {
          cameraStream.getTracks().forEach((t) => cameraStream.removeTrack(t));
          cameraStream.addTrack(track);
          upsertRemote(peerId, { camera: cameraStream });
          return;
        }
        if (event.transceiver === mic || event.transceiver.mid === mic.mid) {
          cameraStream.addTrack(track);
          upsertRemote(peerId, { camera: cameraStream });
          return;
        }
        if (event.transceiver === screen || event.transceiver.mid === screen.mid) {
          if (track.muted || track.readyState === "ended") {
            upsertRemote(peerId, { screen: null });
            return;
          }
          screenStream.getVideoTracks().forEach((t) => screenStream.removeTrack(t));
          screenStream.addTrack(track);
          track.onunmute = () => upsertRemote(peerId, { screen: screenStream });
          track.onmute = () => upsertRemote(peerId, { screen: null });
          track.onended = () => upsertRemote(peerId, { screen: null });
          upsertRemote(peerId, { screen: screenStream });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          pc.restartIce();
        }
        if (pc.connectionState === "closed") {
          teardownPeer(peerId);
        }
      };

      applyLocalTracks(bundle);
      return bundle;
    },
    [applyLocalTracks, broadcast, teardownPeer, upsertRemote],
  );

  const negotiate = useCallback(
    async (peerId: string) => {
      const peer = peersRef.current.get(peerId);
      if (!peer || peer.pc.signalingState !== "stable") return;
      try {
        peer.makingOffer = true;
        const offer = await peer.pc.createOffer();
        await peer.pc.setLocalDescription(offer);
        broadcast({
          type: "offer",
          from: userIdRef.current,
          to: peerId,
          sdp: peer.pc.localDescription!,
        });
      } finally {
        peer.makingOffer = false;
      }
    },
    [broadcast],
  );

  const flushIce = useCallback(async (peer: PeerBundle) => {
    if (!peer.pc.remoteDescription) return;
    const queued = peer.pendingIce.splice(0);
    for (const candidate of queued) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`room-media:${roomId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: userId },
      },
    });
    channelRef.current = channel;

    const connectTo = (peerId: string, peerName?: string) => {
      if (peerId === userId) return;
      if (peerName) namesRef.current.set(peerId, peerName);
      ensurePeer(peerId);
      if (userId < peerId) {
        void negotiate(peerId);
      }
    };

    channel
      .on("broadcast", { event: "signal" }, async ({ payload }) => {
        const msg = payload as Signal;
        if (!msg || msg.from === userId) return;

        if (msg.type === "hello") {
          namesRef.current.set(msg.from, msg.username);
          connectTo(msg.from, msg.username);
          return;
        }

        if (msg.type === "bye") {
          teardownPeer(msg.from);
          return;
        }

        if (msg.type === "offer" && msg.to === userId) {
          const peer = ensurePeer(msg.from);
          const offerCollision =
            peer.makingOffer || peer.pc.signalingState !== "stable";
          const polite = userId > msg.from;
          if (offerCollision && !polite) return;
          await peer.pc.setRemoteDescription(msg.sdp);
          await flushIce(peer);
          applyLocalTracks(peer);
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          broadcast({
            type: "answer",
            from: userId,
            to: msg.from,
            sdp: peer.pc.localDescription!,
          });
          return;
        }

        if (msg.type === "answer" && msg.to === userId) {
          const peer = peersRef.current.get(msg.from);
          if (!peer) return;
          if (peer.pc.signalingState === "have-local-offer") {
            await peer.pc.setRemoteDescription(msg.sdp);
            await flushIce(peer);
          }
          return;
        }

        if (msg.type === "ice" && msg.to === userId) {
          const peer = peersRef.current.get(msg.from) || ensurePeer(msg.from);
          if (!peer.pc.remoteDescription) {
            peer.pendingIce.push(msg.candidate);
            return;
          }
          try {
            await peer.pc.addIceCandidate(msg.candidate);
          } catch {
            // ignore
          }
        }
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        for (const presence of newPresences) {
          const id = String(
            (presence as { user_id?: string }).user_id || key || "",
          );
          const name = String(
            (presence as { username?: string }).username || "Peer",
          );
          if (id) connectTo(id, name);
        }
      })
      .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
        for (const presence of leftPresences) {
          const id = String(
            (presence as { user_id?: string }).user_id || key || "",
          );
          if (id) teardownPeer(id);
        }
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await channel.track({ user_id: userId, username });
        broadcast({ type: "hello", from: userId, username });
        const state = channel.presenceState();
        for (const [presenceKey, presences] of Object.entries(state)) {
          const first = (presences as { user_id?: string; username?: string }[])[0];
          connectTo(
            String(first?.user_id || presenceKey),
            first?.username,
          );
        }
      });

    return () => {
      broadcast({ type: "bye", from: userId });
      peersRef.current.forEach((peer) => peer.pc.close());
      peersRef.current.clear();
      void supabase.removeChannel(channel);
    };
  }, [
    applyLocalTracks,
    broadcast,
    ensurePeer,
    flushIce,
    negotiate,
    roomId,
    teardownPeer,
    userId,
    username,
  ]);

  useEffect(() => {
    if (localCamRef.current) {
      localCamRef.current.srcObject = cameraStreamRef.current;
    }
  }, [cameraOn]);

  useEffect(() => {
    if (localScreenRef.current) {
      localScreenRef.current.srcObject = screenStreamRef.current;
    }
  }, [sharing]);

  async function renegotiateAll() {
    for (const [peerId, peer] of peersRef.current) {
      applyLocalTracks(peer);
      if (userId < peerId) {
        void negotiate(peerId);
      }
    }
  }

  async function toggleCamera() {
    setError(null);
    try {
      if (cameraOn) {
        cameraStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
        const audio = cameraStreamRef.current?.getAudioTracks() || [];
        cameraStreamRef.current = audio.length ? new MediaStream(audio) : null;
        setCameraOn(false);
        await renegotiateAll();
        return;
      }
      const cam = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 } },
        audio: micOn,
      });
      const audioTracks = cameraStreamRef.current?.getAudioTracks() || [];
      if (audioTracks.length && !micOn) {
        audioTracks.forEach((t) => cam.addTrack(t));
      }
      cameraStreamRef.current = cam;
      if (localCamRef.current) localCamRef.current.srcObject = cam;
      setCameraOn(true);
      if (micOn && cam.getAudioTracks().length === 0) {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic.getAudioTracks().forEach((t) => cam.addTrack(t));
      }
      await renegotiateAll();
    } catch {
      setError("Camera permission was blocked or unavailable.");
    }
  }

  async function toggleMic() {
    setError(null);
    try {
      if (micOn) {
        cameraStreamRef.current?.getAudioTracks().forEach((t) => {
          t.stop();
          cameraStreamRef.current?.removeTrack(t);
        });
        setMicOn(false);
        await renegotiateAll();
        return;
      }
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      const stream = cameraStreamRef.current || new MediaStream();
      mic.getAudioTracks().forEach((t) => stream.addTrack(t));
      cameraStreamRef.current = stream;
      setMicOn(true);
      await renegotiateAll();
    } catch {
      setError("Microphone permission was blocked or unavailable.");
    }
  }

  async function toggleScreen() {
    setError(null);
    try {
      if (sharing) {
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
        if (localScreenRef.current) localScreenRef.current.srcObject = null;
        setSharing(false);
        await renegotiateAll();
        notifyRoom(`${username} stopped sharing`);
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (track) track.contentHint = "detail";
      screenStreamRef.current = stream;
      if (localScreenRef.current) localScreenRef.current.srcObject = stream;
      setSharing(true);
      track?.addEventListener("ended", () => {
        screenStreamRef.current = null;
        setSharing(false);
        void renegotiateAll();
      });
      await renegotiateAll();
      notifyRoom(`${username} started sharing their screen`);
    } catch {
      setError("Screen share was blocked or cancelled.");
    }
  }

  const screens = [
    ...(sharing && screenStreamRef.current
      ? [{ id: "local", name: "You", stream: screenStreamRef.current, muted: true }]
      : []),
    ...remotes
      .filter((r) => r.screen && r.screen.getVideoTracks().some((t) => t.readyState === "live"))
      .map((r) => ({
        id: r.userId,
        name: r.username,
        stream: r.screen!,
        muted: false,
      })),
  ];

  return (
    <section className="room-panel space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Live room</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Camera, mic, and screen share are live-only — never recorded.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cameraOn ? "btn-danger" : "btn-secondary"}
            onClick={() => void toggleCamera()}
          >
            {cameraOn ? "Camera off" : "Camera"}
          </button>
          <button
            type="button"
            className={micOn ? "btn-danger" : "btn-secondary"}
            onClick={() => void toggleMic()}
          >
            {micOn ? "Mic off" : "Mic"}
          </button>
          <button
            type="button"
            className={sharing ? "btn-danger" : "btn-primary"}
            onClick={() => void toggleScreen()}
          >
            {sharing ? "Stop sharing" : "Share screen"}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <div>
        <p className="eyebrow">People</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <MediaTile
            title={`${username} (you)`}
            stream={cameraOn || micOn ? cameraStreamRef.current : null}
            muted
            videoRef={localCamRef}
            placeholder={cameraOn ? null : "Camera off"}
          />
          {remotes.map((remote) => (
            <MediaTile
              key={remote.userId}
              title={remote.username}
              stream={remote.camera}
              placeholder="Waiting for video…"
            />
          ))}
        </div>
      </div>

      <div>
        <p className="eyebrow">Screen shares</p>
        {screens.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-[var(--line)] px-4 py-10 text-center text-sm text-[var(--muted)]">
            No screens shared yet. Use Share screen so everyone can follow along.
          </div>
        ) : (
          <div className="mt-3 grid gap-3">
            {screens.map((item) => (
              <MediaTile
                key={item.id}
                title={`${item.name} · screen`}
                stream={item.stream}
                muted={item.muted}
                tall
                videoRef={item.id === "local" ? localScreenRef : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function MediaTile({
  title,
  stream,
  muted = false,
  placeholder,
  tall = false,
  videoRef,
}: {
  title: string;
  stream: MediaStream | null;
  muted?: boolean;
  placeholder?: string | null;
  tall?: boolean;
  videoRef?: RefObject<HTMLVideoElement | null>;
}) {
  const innerRef = useRef<HTMLVideoElement | null>(null);
  const ref = videoRef || innerRef;

  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
    }
  }, [ref, stream]);

  return (
    <div className={`screen-tile ${tall ? "min-h-64" : "min-h-44"}`}>
      {stream ? (
        <video ref={ref} autoPlay playsInline muted={muted} />
      ) : (
        <div className="flex h-full min-h-44 items-center justify-center px-3 text-sm text-white/70">
          {placeholder || "No video"}
        </div>
      )}
      <div className="absolute bottom-2 left-2 rounded-full bg-black/55 px-3 py-1 text-xs text-white">
        {title}
      </div>
    </div>
  );
}
