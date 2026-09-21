import React, { useEffect, useRef } from "react";
import { PhoneOff, Mic, MicOff, Video, VideoOff, Phone } from "lucide-react";

// Active in-app call panel: local + remote video, mute, camera toggle, end.
export default function CallPanel({ status, localStream, remoteStream, room, callType, muted, onToggleMute, onEnd }) {
  const localRef = useRef(null);
  const remoteRef = useRef(null);

  useEffect(() => {
    if (localRef.current && localStream) localRef.current.srcObject = localStream;
  }, [localStream]);
  useEffect(() => {
    if (remoteRef.current && remoteStream) remoteRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  const isVideo = callType === "video";
  const statusLabel = {
    ringing: "Ringing…",
    connecting: "Connecting…",
    connected: "Connected",
    ended: "Call ended",
    declined: "Declined",
  }[status] || status;

  return (
    <div className="noir-panel rounded-2xl p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#c5a059]/60 to-transparent" />
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#2bb3c0] opacity-60 animate-ping" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#2bb3c0]" />
          </span>
          <span className="text-sm font-bold text-[#d1a985]">{statusLabel}</span>
        </div>
        <span className="text-[10px] text-[#8a6d3b]">{isVideo ? "Video call" : "Voice call"}</span>
      </div>

      <div className="relative rounded-xl overflow-hidden bg-black/60 mb-3" style={{ aspectRatio: isVideo ? "4/3" : "1/1" }}>
        {isVideo ? (
          <>
            <video ref={remoteRef} autoPlay playsInline className="w-full h-full object-cover" />
            {localStream && (
              <video ref={localRef} autoPlay playsInline muted className="absolute bottom-2 right-2 w-1/3 rounded-lg border border-[#c5a059]/40 shadow-lg" />
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="w-20 h-20 rounded-full bg-gradient-to-b from-[#c5a059]/30 to-[#0a0706] border border-[#c5a059]/50 flex items-center justify-center">
              <Phone className="w-9 h-9 text-[#d1a985]" />
            </div>
            <p className="text-xs text-[#8a6d3b]">{room?.callee_name || room?.caller_name || "Calling…"}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-2">
        <button onClick={onToggleMute} className={`p-3 rounded-full border ${muted ? "bg-[#c0484a]/20 border-[#c0484a]/50 text-[#e07466]" : "bg-[#0a0706] border-[#c5a059]/35 text-[#d1a985]"}`}>
          {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>
        <button onClick={onEnd} className="p-3 rounded-full bg-[#c0484a] text-white border border-[#c0484a] shadow-lg">
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}