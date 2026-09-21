import { useEffect, useRef, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// WebRTC peer-to-peer voice/video calling, signaled through a CallRoom entity
// (offer/answer/ICE exchanged via realtime subscription). Single-writer-per-field
// (caller writes caller_ice + offer; callee writes callee_ice + answer) avoids races.
export function useWebRTCCall(me) {
  const [status, setStatus] = useState("idle"); // idle | ringing | connecting | connected | ended | declined
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [room, setRoom] = useState(null);
  const [incoming, setIncoming] = useState(null);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);

  const pcRef = useRef(null);
  const myIceRef = useRef([]);
  const addedIceRef = useRef(new Set());
  const roomRef = useRef(null);
  const unsubRef = useRef(null);
  const localStreamRef = useRef(null);
  const incomingRef = useRef(null);

  const stopMedia = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
  };

  const cleanup = useCallback(() => {
    if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
    if (unsubRef.current) { try { unsubRef.current(); } catch {} unsubRef.current = null; }
    myIceRef.current = [];
    addedIceRef.current = new Set();
    roomRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setRoom(null);
  }, []);

  const addIceFrom = (iceStr, isCaller) => {
    if (!iceStr || !pcRef.current) return;
    try {
      const arr = JSON.parse(iceStr);
      arr.forEach((c) => {
        const key = JSON.stringify(c);
        if (!addedIceRef.current.has(key)) {
          addedIceRef.current.add(key);
          pcRef.current?.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }
      });
    } catch { /* ignore */ }
  };

  const setupPc = (stream, isCaller) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => setRemoteStream(e.streams[0]);
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        myIceRef.current.push(e.candidate.toJSON());
        if (roomRef.current) {
          const field = isCaller ? "caller_ice" : "callee_ice";
          base44.entities.CallRoom.update(roomRef.current.id, { [field]: JSON.stringify(myIceRef.current) }).catch(() => {});
        }
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("connected");
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") { setStatus("ended"); }
    };
  };

  // Global subscribe: routes events to active-call signaling or incoming-call detection.
  useEffect(() => {
    if (!me?.id) return;
    const unsub = base44.entities.CallRoom.subscribe((ev) => {
      const data = ev.data || {};
      const active = roomRef.current;
      if (active && ev.id === active.id) {
        if (data.status === "declined") { setStatus("declined"); stopMedia(); cleanup(); return; }
        if (data.status === "ended") { setStatus("ended"); stopMedia(); cleanup(); return; }
        // caller learns answer + callee ICE; callee learns caller ICE
        if (data.answer_sdp && pcRef.current && !pcRef.current.currentRemoteDescription) {
          try { pcRef.current.setRemoteDescription(JSON.parse(data.answer_sdp)); setStatus("connecting"); } catch {}
        }
        addIceFrom(data.caller_ice, true);
        addIceFrom(data.callee_ice, false);
        return;
      }
      // incoming: a ringing room where I'm the callee and I'm not already in a call
      if (!active && data.callee_id === me.id && data.status === "ringing" && !incomingRef.current) {
        incomingRef.current = { id: ev.id, ...data };
        setIncoming(incomingRef.current);
      }
      if (incomingRef.current && ev.id === incomingRef.current.id && (data.status === "ended" || data.status === "declined")) {
        incomingRef.current = null;
        setIncoming(null);
      }
    });
    return () => { try { unsub(); } catch {} };
  }, [me?.id]);

  const startCall = async (callee, callType = "audio") => {
    if (!me?.id) return;
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: callType === "video" });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setupPc(stream, true);
      const offer = await pcRef.current.createOffer();
      await pcRef.current.setLocalDescription(offer);
      const r = await base44.entities.CallRoom.create({
        caller_id: me.id,
        caller_name: me.name || "Seeker",
        callee_id: callee.user_id,
        callee_name: callee.user_name,
        status: "ringing",
        call_type: callType,
        offer_sdp: JSON.stringify(offer),
        caller_ice: "",
        callee_ice: "",
      });
      roomRef.current = r;
      setRoom(r);
      setStatus("ringing");
    } catch (err) {
      setError(err.message || "Call failed");
      stopMedia();
      cleanup();
    }
  };

  const answerCall = async (callType = "audio") => {
    const inc = incomingRef.current;
    if (!inc) return;
    try {
      setError("");
      incomingRef.current = null;
      setIncoming(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: inc.call_type === "video" });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setupPc(stream, false);
      await pcRef.current.setRemoteDescription(JSON.parse(inc.offer_sdp));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      roomRef.current = { id: inc.id };
      setRoom(inc);
      await base44.entities.CallRoom.update(inc.id, { status: "answered", answer_sdp: JSON.stringify(answer) });
      setStatus("connecting");
    } catch (err) {
      setError(err.message || "Call failed");
      stopMedia();
      cleanup();
    }
  };

  const declineCall = async () => {
    if (incomingRef.current) {
      await base44.entities.CallRoom.update(incomingRef.current.id, { status: "declined" }).catch(() => {});
      incomingRef.current = null;
      setIncoming(null);
    }
  };

  const endCall = async () => {
    if (roomRef.current) await base44.entities.CallRoom.update(roomRef.current.id, { status: "ended" }).catch(() => {});
    setStatus("ended");
    stopMedia();
    cleanup();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const next = !muted;
      setMuted(next);
      localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !next));
    }
  };

  return { status, localStream, remoteStream, room, incoming, error, muted, startCall, answerCall, declineCall, endCall, toggleMute };
}