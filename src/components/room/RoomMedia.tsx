"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ICE_SERVERS } from "@/lib/webrtc";
import { notifyRoom } from "@/components/room/RoomNotifications";

type Signal =
  | { type: "hello"; from: string; username: string }
  | {
      type: "media-state";
      from: string;
      camera: boolean;
      mic: boolean;
      sharing: boolean;
    }
  | { type: "offer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: "bye"; from: string };

type PeerLink = {
  pc: RTCPeerConnection;
  pendingIce: RTCIceCandidateInit[];
  makingOffer: boolean;
  cameraSender: RTCRtpSender | null;
  micSender: RTCRtpSender | null;
  screenSender: RTCRtpSender | null;
};

type RemotePeer = {
  userId: string;
  username: string;
  stream: MediaStream;
  screen: MediaStream | null;
  connection: string;
  cameraOn: boolean;
  micOn: boolean;
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
  const [localPreview, setLocalPreview] = useState<MediaStream | null>(null);
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null);
  const [remotes, setRemotes] = useState<RemotePeer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerLink>>(new Map());
  const remoteStreamsRef = useRef<Map<string, { cam: MediaStream; screen: MediaStream }>>(
    new Map(),
  );
  const namesRef = useRef<Map<string, string>>(new Map());
  const remoteStateRef = useRef<
    Map<string, { camera: boolean; mic: boolean; sharing: boolean }>
  >(new Map());
  const cameraOnRef = useRef(false);
  const micOnRef = useRef(false);
  const sharingRef = useRef(false);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(
    null,
  );
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const bump = useCallback(() => setTick((n) => n + 1), []);

  const broadcast = useCallback((payload: Signal) => {
    void channelRef.current?.send({
      type: "broadcast",
      event: "signal",
      payload,
    });
  }, []);

  const publishRemotes = useCallback(() => {
    setRemotes(
      [...remoteStreamsRef.current.entries()].map(([id, streams]) => {
        const flags = remoteStateRef.current.get(id);
        const liveVideo = streams.cam
          .getVideoTracks()
          .some((t) => t.readyState === "live" && !t.muted);
        const liveAudio = streams.cam
          .getAudioTracks()
          .some((t) => t.readyState === "live" && !t.muted);
        return {
          userId: id,
          username: namesRef.current.get(id) || "Peer",
          stream: streams.cam,
          screen:
            (flags?.sharing ?? true) &&
            streams.screen.getVideoTracks().some((t) => t.readyState === "live")
              ? streams.screen
              : null,
          connection: peersRef.current.get(id)?.pc.connectionState || "new",
          cameraOn: flags ? flags.camera : liveVideo,
          micOn: flags ? flags.mic : liveAudio,
        };
      }),
    );
  }, []);

  const broadcastMediaState = useCallback(() => {
    broadcast({
      type: "media-state",
      from: userIdRef.current,
      camera: cameraOnRef.current,
      mic: micOnRef.current,
      sharing: sharingRef.current,
    });
  }, [broadcast]);

  const applyRemoteMediaState = useCallback(
    (
      peerId: string,
      state: { camera: boolean; mic: boolean; sharing: boolean },
    ) => {
      remoteStateRef.current.set(peerId, state);
      const bucket = remoteStreamsRef.current.get(peerId);
      if (bucket && !state.camera) {
        const audioOnly = new MediaStream(bucket.cam.getAudioTracks());
        bucket.cam.getVideoTracks().forEach((track) => bucket.cam.removeTrack(track));
        remoteStreamsRef.current.set(peerId, { ...bucket, cam: audioOnly });
      }
      if (bucket && !state.sharing) {
        bucket.screen.getVideoTracks().forEach((track) => bucket.screen.removeTrack(track));
      }
      publishRemotes();
    },
    [publishRemotes],
  );

  const teardownPeer = useCallback(
    (peerId: string) => {
      const peer = peersRef.current.get(peerId);
      if (peer) {
        peer.pc.close();
        peersRef.current.delete(peerId);
      }
      remoteStreamsRef.current.delete(peerId);
      publishRemotes();
    },
    [publishRemotes],
  );

  const attachLocalTracks = useCallback(async (peer: PeerLink) => {
    const cam = cameraStreamRef.current?.getVideoTracks()[0] || null;
    const mic = cameraStreamRef.current?.getAudioTracks()[0] || null;
    const screen = screenStreamRef.current?.getVideoTracks()[0] || null;
    const camStream = cameraStreamRef.current;
    const screenStream = screenStreamRef.current;

    if (cam && camStream) {
      if (peer.cameraSender) await peer.cameraSender.replaceTrack(cam);
      else peer.cameraSender = peer.pc.addTrack(cam, camStream);
    } else if (peer.cameraSender) {
      await peer.cameraSender.replaceTrack(null);
    }

    if (mic && camStream) {
      if (peer.micSender) await peer.micSender.replaceTrack(mic);
      else peer.micSender = peer.pc.addTrack(mic, camStream);
    } else if (peer.micSender) {
      await peer.micSender.replaceTrack(null);
    }

    if (screen && screenStream) {
      if (peer.screenSender) await peer.screenSender.replaceTrack(screen);
      else peer.screenSender = peer.pc.addTrack(screen, screenStream);
    } else if (peer.screenSender) {
      await peer.screenSender.replaceTrack(null);
    }
  }, []);

  const negotiate = useCallback(
    async (peerId: string) => {
      const peer = peersRef.current.get(peerId);
      if (!peer || peer.pc.signalingState !== "stable") return;
      try {
        peer.makingOffer = true;
        const offer = await peer.pc.createOffer();
        await peer.pc.setLocalDescription(offer);
        if (peer.pc.localDescription) {
          broadcast({
            type: "offer",
            from: userIdRef.current,
            to: peerId,
            sdp: peer.pc.localDescription,
          });
        }
      } finally {
        peer.makingOffer = false;
      }
    },
    [broadcast],
  );

  const flushIce = useCallback(async (peer: PeerLink) => {
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

  const ensurePeer = useCallback(
    (peerId: string) => {
      const existing = peersRef.current.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      const peer: PeerLink = {
        pc,
        pendingIce: [],
        makingOffer: false,
        cameraSender: null,
        micSender: null,
        screenSender: null,
      };
      peersRef.current.set(peerId, peer);

      if (!remoteStreamsRef.current.has(peerId)) {
        remoteStreamsRef.current.set(peerId, {
          cam: new MediaStream(),
          screen: new MediaStream(),
        });
      }
      publishRemotes();

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        broadcast({
          type: "ice",
          from: userIdRef.current,
          to: peerId,
          candidate: event.candidate.toJSON(),
        });
      };

      pc.onnegotiationneeded = () => {
        void negotiate(peerId);
      };

      pc.ontrack = (event) => {
        const track = event.track;
        const bucket = remoteStreamsRef.current.get(peerId) || {
          cam: new MediaStream(),
          screen: new MediaStream(),
        };
        remoteStreamsRef.current.set(peerId, bucket);

        if (track.kind === "audio") {
          if (!bucket.cam.getAudioTracks().some((t) => t.id === track.id)) {
            bucket.cam.addTrack(track);
          }
        } else if (bucket.cam.getVideoTracks().length === 0) {
          bucket.cam.addTrack(track);
        } else if (!bucket.cam.getVideoTracks().some((t) => t.id === track.id)) {
          bucket.screen.getVideoTracks().forEach((old) => bucket.screen.removeTrack(old));
          bucket.screen.addTrack(track);
        }

        track.onunmute = () => {
          bump();
          publishRemotes();
        };
        track.onended = () => {
          bucket.cam.removeTrack(track);
          bucket.screen.removeTrack(track);
          publishRemotes();
        };

        bump();
        publishRemotes();
      };

      pc.onconnectionstatechange = () => {
        publishRemotes();
        if (pc.connectionState === "failed") {
          try {
            pc.restartIce();
          } catch {
            // ignore
          }
        }
      };

      void attachLocalTracks(peer);
      return peer;
    },
    [attachLocalTracks, broadcast, bump, negotiate, publishRemotes],
  );

  const connectTo = useCallback(
    (peerId: string, peerName?: string) => {
      if (!peerId || peerId === userIdRef.current) return;
      if (peerName) namesRef.current.set(peerId, peerName);
      const peer = ensurePeer(peerId);
      void attachLocalTracks(peer);
    },
    [attachLocalTracks, ensurePeer],
  );

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`room-media:${roomId}`, {
      config: {
        broadcast: { ack: true },
        presence: { key: userId },
      },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "signal" }, async ({ payload }) => {
        const msg = payload as Signal;
        if (!msg || msg.from === userId) return;

        if (msg.type === "hello") {
          namesRef.current.set(msg.from, msg.username);
          connectTo(msg.from, msg.username);
          broadcastMediaState();
          return;
        }

        if (msg.type === "media-state") {
          applyRemoteMediaState(msg.from, {
            camera: msg.camera,
            mic: msg.mic,
            sharing: msg.sharing,
          });
          return;
        }

        if (msg.type === "bye") {
          teardownPeer(msg.from);
          return;
        }

        if (msg.type === "offer" && msg.to === userId) {
          const peer = ensurePeer(msg.from);
          const polite = userId > msg.from;
          const collision =
            peer.makingOffer || peer.pc.signalingState !== "stable";
          if (collision && !polite) return;
          try {
            if (collision && polite) {
              await peer.pc.setLocalDescription({ type: "rollback" });
            }
            await peer.pc.setRemoteDescription(msg.sdp);
            await flushIce(peer);
            await attachLocalTracks(peer);
            const answer = await peer.pc.createAnswer();
            await peer.pc.setLocalDescription(answer);
            if (peer.pc.localDescription) {
              broadcast({
                type: "answer",
                from: userId,
                to: msg.from,
                sdp: peer.pc.localDescription,
              });
            }
          } catch (err) {
            console.error("Failed to answer offer", err);
          }
          return;
        }

        if (msg.type === "answer" && msg.to === userId) {
          const peer = peersRef.current.get(msg.from);
          if (!peer) return;
          try {
            if (peer.pc.signalingState === "have-local-offer") {
              await peer.pc.setRemoteDescription(msg.sdp);
              await flushIce(peer);
            }
          } catch (err) {
            console.error("Failed to apply answer", err);
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
          connectTo(id, name);
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
        broadcastMediaState();
        const state = channel.presenceState();
        for (const [presenceKey, presences] of Object.entries(state)) {
          const first = (presences as { user_id?: string; username?: string }[])[0];
          connectTo(String(first?.user_id || presenceKey), first?.username);
        }
      });

    return () => {
      broadcast({ type: "bye", from: userId });
      peersRef.current.forEach((peer) => peer.pc.close());
      peersRef.current.clear();
      remoteStreamsRef.current.clear();
      void supabase.removeChannel(channel);
    };
  }, [
    applyRemoteMediaState,
    attachLocalTracks,
    broadcast,
    broadcastMediaState,
    connectTo,
    ensurePeer,
    flushIce,
    roomId,
    teardownPeer,
    userId,
    username,
  ]);

  async function pushTracksToPeers() {
    for (const peer of peersRef.current.values()) {
      await attachLocalTracks(peer);
    }
  }

  async function toggleCamera() {
    setError(null);
    try {
      if (cameraOn) {
        cameraStreamRef.current?.getVideoTracks().forEach((t) => {
          t.stop();
          cameraStreamRef.current?.removeTrack(t);
        });
        if (!cameraStreamRef.current?.getAudioTracks().length) {
          cameraStreamRef.current = null;
        } else {
          cameraStreamRef.current = new MediaStream(
            cameraStreamRef.current.getAudioTracks(),
          );
        }
        cameraOnRef.current = false;
        setCameraOn(false);
        setLocalPreview(cameraStreamRef.current);
        await pushTracksToPeers();
        broadcastMediaState();
        return;
      }
      const cam = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 } },
        audio: false,
      });
      const stream = cameraStreamRef.current
        ? new MediaStream(cameraStreamRef.current.getAudioTracks())
        : new MediaStream();
      cam.getVideoTracks().forEach((t) => {
        t.contentHint = "motion";
        stream.addTrack(t);
      });
      cameraStreamRef.current = stream;
      cameraOnRef.current = true;
      setCameraOn(true);
      setLocalPreview(stream);
      await pushTracksToPeers();
      broadcastMediaState();
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
        micOnRef.current = false;
        setMicOn(false);
        setLocalPreview(
          cameraStreamRef.current
            ? new MediaStream(cameraStreamRef.current.getTracks())
            : null,
        );
        await pushTracksToPeers();
        broadcastMediaState();
        return;
      }
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const stream = cameraStreamRef.current
        ? new MediaStream(cameraStreamRef.current.getTracks())
        : new MediaStream();
      mic.getAudioTracks().forEach((t) => stream.addTrack(t));
      cameraStreamRef.current = stream;
      micOnRef.current = true;
      setMicOn(true);
      setLocalPreview(stream);
      await pushTracksToPeers();
      broadcastMediaState();
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
        sharingRef.current = false;
        setSharing(false);
        setLocalScreen(null);
        await pushTracksToPeers();
        broadcastMediaState();
        notifyRoom(`${username} stopped sharing`);
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: false,
      });
      stream.getVideoTracks().forEach((t) => {
        t.contentHint = "detail";
      });
      screenStreamRef.current = stream;
      sharingRef.current = true;
      setSharing(true);
      setLocalScreen(stream);
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        screenStreamRef.current = null;
        sharingRef.current = false;
        setSharing(false);
        setLocalScreen(null);
        void pushTracksToPeers();
        broadcastMediaState();
      });
      await pushTracksToPeers();
      broadcastMediaState();
      notifyRoom(`${username} started sharing their screen`);
    } catch {
      setError("Screen share was blocked or cancelled.");
    }
  }

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
          <MediaToggle
            kind="camera"
            on={cameraOn}
            onClick={() => void toggleCamera()}
          />
          <MediaToggle
            kind="mic"
            on={micOn}
            onClick={() => void toggleMic()}
          />
          <MediaToggle
            kind="screen"
            on={sharing}
            onClick={() => void toggleScreen()}
          />
        </div>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <div>
        <p className="eyebrow">People</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <VideoTile
            title={`${username} (you)`}
            stream={localPreview}
            muted
            cameraOn={cameraOn}
            micOn={micOn}
          />
          {remotes.map((remote) => (
            <VideoTile
              key={remote.userId}
              title={remote.username}
              stream={remote.stream}
              cameraOn={remote.cameraOn}
              micOn={remote.micOn}
              connection={remote.connection}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="eyebrow">Screen shares</p>
        {!localScreen && remotes.every((r) => !r.screen) ? (
          <div className="mt-3 rounded-2xl border border-dashed border-[var(--line)] px-4 py-10 text-center text-sm text-[var(--muted)]">
            No screens shared yet. Use Share screen so everyone can follow along.
          </div>
        ) : (
          <div className="mt-3 grid gap-3">
            {localScreen ? (
              <VideoTile
                title="You · screen"
                stream={localScreen}
                muted
                tall
                cameraOn
                micOn={false}
                hideStatus
              />
            ) : null}
            {remotes.map((remote) =>
              remote.screen ? (
                <VideoTile
                  key={`${remote.userId}-screen`}
                  title={`${remote.username} · screen`}
                  stream={remote.screen}
                  tall
                  cameraOn
                  micOn={false}
                  hideStatus
                />
              ) : null,
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function MediaToggle({
  kind,
  on,
  onClick,
}: {
  kind: "camera" | "mic" | "screen";
  on: boolean;
  onClick: () => void;
}) {
  const label =
    kind === "camera" ? "Camera" : kind === "mic" ? "Microphone" : "Screen";
  return (
    <button
      type="button"
      className={`media-toggle ${on ? "is-on" : "is-off"}`}
      onClick={onClick}
      aria-pressed={on}
    >
      <span className="media-toggle-kind">{label}</span>
      <span className="media-toggle-state">{on ? "On" : "Off"}</span>
    </button>
  );
}

function VideoTile({
  title,
  stream,
  muted = false,
  tall = false,
  cameraOn,
  micOn,
  connection,
  hideStatus = false,
}: {
  title: string;
  stream: MediaStream | null;
  muted?: boolean;
  tall?: boolean;
  cameraOn: boolean;
  micOn: boolean;
  connection?: string;
  hideStatus?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const showVideo = cameraOn && Boolean(stream?.getVideoTracks().length);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (video) {
      video.srcObject = showVideo ? stream : null;
      if (showVideo && stream) void video.play().catch(() => undefined);
    }
    if (audio) {
      audio.srcObject = !muted && micOn && stream ? stream : null;
      if (!muted && micOn && stream) void audio.play().catch(() => undefined);
    }
  }, [stream, showVideo, micOn, muted]);

  return (
    <div className={`screen-tile ${tall ? "min-h-64" : "min-h-44"}`}>
      {showVideo ? (
        <video ref={videoRef} autoPlay playsInline muted={muted} />
      ) : (
        <div className="flex h-full min-h-44 flex-col items-center justify-center gap-2 px-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-lg font-semibold text-white">
            {title.slice(0, 1).toUpperCase()}
          </span>
          <span className="text-sm text-white/70">Camera off</span>
        </div>
      )}
      {!muted ? <audio ref={audioRef} autoPlay /> : null}
      <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-black/70 px-2.5 py-1 text-xs text-white">
          {title}
        </span>
        {!hideStatus ? (
          <>
            <span className={`media-badge ${cameraOn ? "is-on" : "is-off"}`}>
              Cam {cameraOn ? "on" : "off"}
            </span>
            <span className={`media-badge ${micOn ? "is-on" : "is-off"}`}>
              Mic {micOn ? "on" : "off"}
            </span>
          </>
        ) : null}
        {connection && connection !== "connected" && connection !== "new" ? (
          <span className="media-badge is-off">{connection}</span>
        ) : null}
      </div>
    </div>
  );
}
