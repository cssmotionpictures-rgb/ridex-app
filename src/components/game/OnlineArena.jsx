import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { CHARACTERS } from "@/lib/forgottenOnesData";
import { useGamePresence } from "@/hooks/useGamePresence";
import { useWebRTCCall } from "@/hooks/useWebRTCCall";
import CallPanel from "@/components/game/CallPanel";
import GiftPanel from "@/components/game/GiftPanel";
import { Users, Send, Phone, Video, X, PhoneOff, MessageSquare, Wifi, Gift, Radio, Eye } from "lucide-react";

// Live watch panel — spectator comments on a host's live battle, scoped by
// room ("live:<hostId>"). Zero-credit (entities + realtime).
function LiveWatch({ host, me, onClose }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const room = `live:${host.user_id}`;
  const endRef = useRef(null);

  useEffect(() => {
    let unsub;
    (async () => {
      try {
        const recent = await base44.entities.GameChat.list("-created_date", 50);
        setComments(recent.filter((m) => m.room === room).slice(-30).reverse());
        unsub = base44.entities.GameChat.subscribe((ev) => {
          if (ev.type === "create" && ev.data?.room === room) setComments((c) => [...c, ev.data].slice(-30));
        });
      } catch {}
    })();
    return () => { if (unsub) unsub(); };
  }, [room]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [comments]);

  const post = async () => {
    const msg = text.trim();
    if (!msg || !me?.id) return;
    setText("");
    try {
      await base44.entities.GameChat.create({
        user_id: me.id,
        user_name: me.full_name || me.email || "Seeker",
        character_name: host.character_name || "",
        message: msg,
        room,
      });
    } catch { setText(msg); }
  };

  return (
    <div className="fixed inset-0 z-[1100] bg-[#040303]/95 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#c5a059]/15 bg-black/30">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#e07466] animate-pulse" />
          <div>
            <p className="text-[9px] uppercase tracking-[0.3em] text-[#e07466] font-bold">Live Battle</p>
            <h3 className="font-bold text-[#d1a985] font-heading">{host.user_name} · {host.character_name || "Seeker"}</h3>
          </div>
        </div>
        <button onClick={onClose} className="text-[#8a6d3b] hover:text-white"><X className="w-5 h-5" /></button>
      </div>
      <div className="flex-1 overflow-y-auto noir-scrollbar px-4 py-3 space-y-2">
        {comments.length === 0 && <p className="text-[11px] text-[#8a6d3b] italic py-8 text-center">Be the first to cheer {host.user_name} on!</p>}
        {comments.map((m) => {
          const mine = m.user_id === me?.id;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <span className="text-[9px] text-[#8a6d3b] mb-0.5 px-1">{m.user_name}{m.character_name ? ` · ${m.character_name}` : ""}</span>
              <div className={`max-w-[80%] px-3 py-2 rounded-xl text-[13px] leading-snug ${mine ? "btn-noir-primary" : "bg-[#0a0706] border border-[#c5a059]/25 text-[#d1a985]"}`}>
                {m.message}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 p-3 border-t border-[#c5a059]/15 bg-black/30">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && post()}
          placeholder={`Comment on ${host.user_name}'s live battle…`}
          className="flex-1 bg-black/40 border border-[#c5a059]/25 rounded-xl px-3 py-2.5 text-[13px] text-foreground outline-none focus:border-[#c5a059]/60"
        />
        <button onClick={post} disabled={!text.trim()} className="px-4 rounded-xl btn-noir-primary font-semibold flex items-center gap-1 disabled:opacity-40">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function OnlineArena({ profile }) {
  const { online, me, onlineCount } = useGamePresence(profile);
  const call = useWebRTCCall(me);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");
  const [subTab, setSubTab] = useState("arena");
  const [giftFor, setGiftFor] = useState(null);
  const [liveHost, setLiveHost] = useState(null);
  const chatEndRef = useRef(null);

  const myChar = CHARACTERS.find((c) => c.id === (profile?.active_character_id || 1)) || CHARACTERS[0];

  useEffect(() => {
    let unsub;
    (async () => {
      try {
        const recent = await base44.entities.GameChat.list("-created_date", 50);
        setMessages(recent.filter((m) => !m.room || m.room === "").reverse());
        unsub = base44.entities.GameChat.subscribe((ev) => {
          if (ev.type === "create" && ev.data && (!ev.data.room || ev.data.room === "")) {
            setMessages((m) => [...m, ev.data].slice(-100));
          }
        });
      } catch {}
    })();
    return () => { if (unsub) unsub(); };
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (call.status === "ended" || call.status === "declined") {
      setToast(call.status === "declined" ? "Call declined" : "Call ended");
      const t = setTimeout(() => setToast(""), 2500);
      return () => clearTimeout(t);
    }
  }, [call.status]);

  const send = async () => {
    const msg = text.trim();
    if (!msg || !me?.id || sending) return;
    setSending(true);
    setText("");
    try {
      await base44.entities.GameChat.create({
        user_id: me.id,
        user_name: me.full_name || me.email || "Seeker",
        character_id: myChar.id,
        character_name: myChar.name,
        message: msg,
        room: "",
      });
    } catch { setText(msg); }
    setSending(false);
  };

  const startCall = (player, type) => {
    call.startCall({ user_id: player.user_id, user_name: player.user_name }, type);
  };

  const others = online.filter((p) => p.user_id !== me?.id);
  const liveHosts = others.filter((p) => p.status === "in_battle");
  const callActive = ["ringing", "connecting", "connected"].includes(call.status);
  const incomingCall = call.incoming;

  return (
    <div className="relative space-y-4">
      {/* Header */}
      <div className="noir-panel rounded-2xl p-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#2bb3c0]/60 to-transparent" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="w-5 h-5 text-[#5ed1da]" />
            <div>
              <h3 className="font-bold text-[#d1a985] tracking-wide">Online Arena</h3>
              <p className="text-[11px] text-[#8a6d3b]">Play with the world · chat · voice & video calls · gifts · live battles</p>
            </div>
          </div>
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-[#2bb3c0]/15 text-[#5ed1da] border border-[#2bb3c0]/30 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#5ed1da] animate-pulse" /> {onlineCount} online
          </span>
        </div>
        {/* Sub-tabs */}
        <div className="flex gap-1.5 mt-3">
          <button onClick={() => setSubTab("arena")} className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${subTab === "arena" ? "noir-tab-active" : "bg-[#0a0706] text-[#8a6d3b] border border-[#c5a059]/15"}`}>
            <MessageSquare className="w-3.5 h-3.5" /> Arena
          </button>
          <button onClick={() => setSubTab("live")} className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${subTab === "live" ? "noir-tab-active" : "bg-[#0a0706] text-[#8a6d3b] border border-[#c5a059]/15"}`}>
            <Radio className="w-3.5 h-3.5" /> Live · {liveHosts.length}
          </button>
        </div>
      </div>

      {subTab === "arena" && (
        <>
          {/* Online players */}
          <div>
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <Users className="w-4 h-4 text-[#c5a059]" />
              <h4 className="text-xs font-bold text-[#d1a985] tracking-widest uppercase">Players Online</h4>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
              {others.length === 0 && (
                <p className="text-[11px] text-[#8a6d3b] italic px-2 py-3">No other players online right now — invite a friend, or stay and chat below.</p>
              )}
              {others.map((p) => (
                <div key={p.user_id} className="noir-panel rounded-xl p-2.5 min-w-[168px] max-w-[180px] shrink-0 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold font-heading shrink-0"
                      style={{ background: `radial-gradient(circle at 50% 35%, #c5a05933, #0a0706)`, color: "#d1a985", border: "1px solid #c5a05955" }}>
                      {(p.character_name || p.user_name || "?").slice(0, 1)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-foreground truncate">{p.user_name}</p>
                      <p className="text-[9px] text-[#8a6d3b] truncate">{p.character_name || "Seeker"}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button disabled={callActive} onClick={() => startCall(p, "audio")} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold btn-noir-ghost disabled:opacity-40">
                      <Phone className="w-3.5 h-3.5" /> Call
                    </button>
                    <button disabled={callActive} onClick={() => startCall(p, "video")} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold btn-noir-ghost disabled:opacity-40">
                      <Video className="w-3.5 h-3.5" /> Video
                    </button>
                  </div>
                  <button onClick={() => setGiftFor({ user_id: p.user_id, user_name: p.user_name })} className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold btn-noir-primary">
                    <Gift className="w-3.5 h-3.5" /> Send Gift
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Global chat */}
          <div className="noir-panel rounded-2xl flex flex-col overflow-hidden" style={{ height: 340 }}>
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#c5a059]/15 bg-black/20">
              <MessageSquare className="w-4 h-4 text-[#c5a059]" />
              <h4 className="text-xs font-bold text-[#d1a985] tracking-widest uppercase">Global Chat</h4>
              <span className="ml-auto text-[9px] text-[#8a6d3b]">live · worldwide</span>
            </div>
            <div className="flex-1 overflow-y-auto noir-scrollbar px-3 py-2 space-y-2">
              {messages.length === 0 && <p className="text-[11px] text-[#8a6d3b] italic py-6 text-center">Be the first to speak to the world.</p>}
              {messages.map((m) => {
                const mine = m.user_id === me?.id;
                return (
                  <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                    <span className="text-[9px] text-[#8a6d3b] mb-0.5 px-1">{m.user_name}{m.character_name ? ` · ${m.character_name}` : ""}</span>
                    <div className={`max-w-[78%] px-2.5 py-1.5 rounded-xl text-[12px] leading-snug ${mine ? "btn-noir-primary" : "bg-[#0a0706] border border-[#c5a059]/25 text-[#d1a985]"}`}>
                      {m.message}
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2 p-2 border-t border-[#c5a059]/15 bg-black/20">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Message the arena…"
                className="flex-1 bg-black/40 border border-[#c5a059]/25 rounded-xl px-3 py-2 text-[12px] text-foreground outline-none focus:border-[#c5a059]/60"
              />
              <button onClick={send} disabled={!text.trim() || sending} className="px-3 rounded-xl btn-noir-primary font-semibold text-sm flex items-center gap-1 disabled:opacity-40">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}

      {subTab === "live" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Radio className="w-4 h-4 text-[#e07466]" />
            <h4 className="text-xs font-bold text-[#d1a985] tracking-widest uppercase">Live Battles Now</h4>
          </div>
          <p className="text-[11px] text-[#8a6d3b] italic px-1">Watch a player's live battle and send comments — they appear on the player's screen in real time.</p>
          {liveHosts.length === 0 && (
            <div className="noir-panel rounded-2xl p-6 text-center">
              <p className="text-[11px] text-[#8a6d3b]">No live battles right now. Start a battle and tap <span className="text-[#e07466] font-semibold">🔴 Go Live</span> to broadcast yours — the world can watch and cheer you on.</p>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            {liveHosts.map((p) => (
              <div key={p.user_id} className="noir-panel rounded-2xl p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold font-heading shrink-0"
                  style={{ background: "radial-gradient(circle at 50% 35%, #c0484a33, #0a0706)", color: "#e07466", border: "1px solid #c0484a55" }}>
                  {(p.character_name || p.user_name || "?").slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground truncate flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#e07466] animate-pulse" /> {p.user_name}
                  </p>
                  <p className="text-[10px] text-[#8a6d3b] truncate">{p.character_name || "Seeker"} · live now</p>
                </div>
                <button onClick={() => setLiveHost(p)} className="px-3 py-2 rounded-xl btn-noir-primary text-xs font-semibold flex items-center gap-1.5 shrink-0">
                  <Eye className="w-3.5 h-3.5" /> Watch
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active call overlay */}
      {callActive && call.room && (
        <div className="fixed inset-0 z-[1100] bg-[#040303]/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm">
            <CallPanel
              status={call.status}
              localStream={call.localStream}
              remoteStream={call.remoteStream}
              room={call.room}
              callType={call.room.call_type || "audio"}
              muted={call.muted}
              onToggleMute={call.toggleMute}
              onEnd={call.endCall}
            />
          </div>
        </div>
      )}

      {/* Incoming call */}
      {incomingCall && (
        <div className="fixed inset-0 z-[1100] bg-[#040303]/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="noir-panel rounded-2xl p-6 w-full max-w-sm text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-b from-[#c5a059]/30 to-[#0a0706] border border-[#c5a059]/50 flex items-center justify-center mb-3 animate-pulse">
              <Phone className="w-9 h-9 text-[#d1a985]" />
            </div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-[#8a6d3b]">Incoming {incomingCall.call_type} call</p>
            <h3 className="font-bold text-lg text-[#d1a985] font-heading mt-1">{incomingCall.caller_name}</h3>
            <div className="flex gap-2 mt-5">
              <button onClick={call.declineCall} className="flex-1 py-2.5 rounded-xl bg-[#c0484a] text-white font-semibold text-sm flex items-center justify-center gap-1.5">
                <PhoneOff className="w-4 h-4" /> Decline
              </button>
              <button onClick={() => call.answerCall(incomingCall.call_type)} className="flex-1 py-2.5 rounded-xl btn-noir-primary font-semibold text-sm flex items-center justify-center gap-1.5">
                <Phone className="w-4 h-4" /> Answer
              </button>
            </div>
            {call.error && <p className="text-[10px] text-[#e07466] mt-2">{call.error}</p>}
          </div>
        </div>
      )}

      {/* Gift panel */}
      {giftFor && <GiftPanel recipient={giftFor} onClose={() => setGiftFor(null)} />}

      {/* Live watch */}
      {liveHost && <LiveWatch host={liveHost} me={me} onClose={() => setLiveHost(null)} />}

      {/* Toast */}
      {toast && !callActive && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[900] px-4 py-2 rounded-full bg-[#0a0706] border border-[#c5a059]/40 text-[12px] text-[#d1a985] shadow-lg">
          {toast}
        </div>
      )}

      {call.error && !callActive && !incomingCall && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[900] px-4 py-2 rounded-full bg-[#c0484a]/20 border border-[#c0484a]/50 text-[12px] text-[#e07466] shadow-lg max-w-[90vw]">
          {call.error}
        </div>
      )}
    </div>
  );
}