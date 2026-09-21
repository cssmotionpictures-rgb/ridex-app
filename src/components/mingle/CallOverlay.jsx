import React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Phone, Video, PhoneOff, Mic, MicOff, VideoOff, Flag, Ban, Loader2 } from "lucide-react";

// CALL OVERLAY — in-app voice/video over WebRTC. No phone numbers are ever
// used or revealed; blocking during a call terminates it immediately.
export default function CallOverlay({ call, onBlock }) {
  const { toast } = useToast();
  const localRef = React.useRef(null);
  const remoteRef = React.useRef(null);
  const [camOn, setCamOn] = React.useState(true);
  const [elapsed, setElapsed] = React.useState(0);
  const activeRoom = call.room;

  React.useEffect(() => {
    if (localRef.current && call.localStream) localRef.current.srcObject = call.localStream;
    if (remoteRef.current && call.remoteStream) remoteRef.current.srcObject = call.remoteStream;
  }, [call.localStream, call.remoteStream]);

  React.useEffect(() => {
    if (call.status !== "connected") { setElapsed(0); return; }
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [call.status]);

  // Incoming call — recipient chooses ACCEPT or DECLINE
  if (call.incoming && !activeRoom) {
    const inc = call.incoming;
    return (
      <div className="fixed inset-0 z-[900] bg-black/80 flex items-center justify-center p-6">
        <div className="rounded-3xl bg-card border border-primary/40 p-6 w-full max-w-sm text-center space-y-4 animate-fade-in">
          <div className="text-4xl">{inc.call_type === "video" ? "📹" : "📞"}</div>
          <p className="font-heading font-bold text-lg">Incoming RideX Mingle {inc.call_type === "video" ? "video" : "voice"} call</p>
          <p className="text-sm text-muted-foreground">{inc.caller_name || "A matched member"}</p>
          <p className="text-[11px] text-muted-foreground">Calls are private between matched users. You can decline, block or report at any time.</p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="rounded-full h-11" onClick={call.declineCall}><PhoneOff className="w-4 h-4 mr-1" /> DECLINE</Button>
            <Button className="rounded-full h-11 font-semibold" onClick={() => call.answerCall()}>
              {inc.call_type === "video" ? <Video className="w-4 h-4 mr-1" /> : <Phone className="w-4 h-4 mr-1" />} ACCEPT
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!["ringing", "connecting", "connected"].includes(call.status)) return null;
  const isVideo = activeRoom?.call_type === "video" || call.incoming?.call_type === "video";

  return (
    <div className="fixed inset-0 z-[900] bg-black/90 flex flex-col">
      <div className="p-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-white">
          {call.status === "ringing" ? "Ringing…" : call.status === "connecting" ? "Connecting…" : `Connected · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="rounded-full text-white" title="Report after the call from chat"
            onClick={() => toast({ title: "You can report from the chat after the call." })}>
            <Flag className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full text-white" title="Block and end call"
            onClick={async () => { await call.endCall(); onBlock?.(); }}>
            <Ban className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 relative">
        <video ref={remoteRef} autoPlay playsInline className="w-full h-full object-cover bg-black" />
        {isVideo && (
          <video ref={localRef} autoPlay playsInline muted className="absolute bottom-4 right-4 w-28 h-40 rounded-2xl border border-white/30 object-cover bg-black" />
        )}
        {!isVideo && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-2">
              <div className="text-5xl">📞</div>
              <p className="text-white font-semibold">{activeRoom?.callee_name || "Mingle call"}</p>
              <p className="text-xs text-white/60">In-app voice — numbers are never shared</p>
            </div>
          </div>
        )}
        {call.status !== "connected" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}
      </div>

      <div className="p-6 flex items-center justify-center gap-4">
        <Button variant="outline" size="icon" className="rounded-full w-12 h-12" onClick={call.toggleMute} title={call.muted ? "Unmute" : "Mute"}>
          {call.muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </Button>
        <Button variant="destructive" size="icon" className="rounded-full w-14 h-14" onClick={call.endCall} title="End call">
          <PhoneOff className="w-6 h-6" />
        </Button>
        {isVideo && (
          <Button variant="outline" size="icon" className="rounded-full w-12 h-12"
            onClick={() => {
              const next = !camOn; setCamOn(next);
              call.localStream?.getVideoTracks?.().forEach((t) => (t.enabled = next));
            }}
            title={camOn ? "Camera off" : "Camera on"}>
            {camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </Button>
        )}
      </div>
      {call.error && <p className="text-center text-xs text-destructive pb-4">{call.error}</p>}
    </div>
  );
}