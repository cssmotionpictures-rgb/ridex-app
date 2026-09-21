import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Image } from "@/components/ui/image";
import { ChevronLeft, Send, Phone, Video, Flag, Ban, Car, Camera, CheckCheck, CalendarCheck, Loader2 } from "lucide-react";
import * as api from "@/lib/mingle/api";
import { mergeMessages, messageRateOk, onlineStatusOf } from "@/lib/mingle/core";
import MeetupPanel from "./MeetupPanel";

const REACTIONS = ["❤️", "👍", "😂", "😮"];

export default function ChatView({ user, profile, match, partner, partnerPresence, onBack, onCall }) {
  const { toast } = useToast();
  const [msgs, setMsgs] = React.useState([]);
  const [text, setText] = React.useState("");
  const [showMeetup, setShowMeetup] = React.useState(false);
  const [reportOpen, setReportOpen] = React.useState(false);
  const [reportCat, setReportCat] = React.useState("HARASSMENT");
  const [reportNote, setReportNote] = React.useState("");
  const [confirmBlock, setConfirmBlock] = React.useState(false);
  const sentAts = React.useRef([]);
  const fileRef = React.useRef(null);
  const bottomRef = React.useRef(null);
  const active = match.status === "ACTIVE";
  const partnerSt = partner ? onlineStatusOf(partner, partnerPresence) : null;

  React.useEffect(() => {
    let alive = true;
    api.loadMessages(match.id).then((rows) => {
      if (!alive) return;
      setMsgs(mergeMessages([], rows));
      api.markMessagesRead(rows, user).catch(() => {});
    });
    const unsub = api.subscribeMessages((ev) => {
      if (ev?.data?.match_id !== match.id) return;
      setMsgs((prev) => mergeMessages(prev, [ev.data]));
      if (ev.data.sender_id !== user.id) api.markMessagesRead([ev.data], user).catch(() => {});
    });
    return () => { alive = false; try { unsub(); } catch {} };
  }, [match.id, user.id]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    if (!active) { toast({ title: "This conversation is closed." }); return; }
    if (!messageRateOk(sentAts.current)) { toast({ title: "You're sending very fast — give it a moment." }); return; }
    sentAts.current = [...sentAts.current.slice(-30), Date.now()];
    setText("");
    const clientId = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const saved = await api.sendMessage(match, user, { body, clientId });
      setMsgs((prev) => mergeMessages(prev, [saved]));
    } catch (e) {
      toast({ title: "Message not sent", description: e?.message || "Try again." });
    }
  };

  const attachImage = async (file) => {
    if (!file) return;
    try {
      const url = await api.uploadChatImage(file);
      const saved = await api.sendMessage(match, user, { body: "", type: "image", attachmentUrl: url });
      setMsgs((prev) => mergeMessages(prev, [saved]));
    } catch (e) {
      toast({ title: "Image not sent", description: e?.message || "Try again." });
    }
  };

  const react = async (m, emoji) => {
    try { await api.reactToMessage(m, user, emoji); } catch { /* non-critical */ }
  };

  const submitReport = async () => {
    try {
      await api.reportUser(user, { targetId: partner.user_id, category: reportCat, context: "chat", detail: reportNote });
      toast({ title: "Report submitted", description: "Our moderation team will review it. You stay safe — reporting is confidential." });
    } catch { toast({ title: "Report failed", description: "Try again." }); }
    setReportOpen(false); setReportNote("");
  };

  const doBlock = async () => {
    setConfirmBlock(false);
    try {
      await api.blockUser(user, partner.user_id);
      toast({ title: "Blocked", description: "All communication between you is stopped immediately." });
      onBack();
    } catch { toast({ title: "Block failed", description: "Try again." }); }
  };

  return (
    <div className="relative rounded-3xl border border-primary/25 bg-card overflow-hidden flex flex-col" style={{ height: "min(70vh, 640px)" }}>
      {/* header */}
      <div className="flex items-center gap-3 p-4 border-b border-border/60">
        <button onClick={onBack} className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground"><ChevronLeft className="w-5 h-5" /></button>
        <div className="w-10 h-10 rounded-2xl bg-secondary overflow-hidden border border-border flex items-center justify-center shrink-0">
          {partner?.photo_url ? <img src={partner.photo_url} alt="" className="w-full h-full object-cover" /> : "💜"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{partner?.display_name || "Mingle member"}</p>
          <p className="text-[11px] text-muted-foreground">
            {active
              ? partnerSt === "ONLINE" ? "🟢 Online" : partnerSt === "RECENTLY_ACTIVE" ? "🟣 Recently active" : partnerSt === "OFFLINE" ? "⚪ Offline" : "⚪ Status hidden"
              : match.status === "BLOCKED" ? "Blocked — communication disabled" : "Unmatched — communication disabled"}
          </p>
        </div>
        {active && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="rounded-full" title="Voice call" onClick={() => onCall(partner, "audio")}><Phone className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="rounded-full" title="Video call" onClick={() => onCall(partner, "video")}><Video className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="rounded-full" title="Report" onClick={() => setReportOpen(true)}><Flag className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" className="rounded-full" title="Block" onClick={() => setConfirmBlock(true)}><Ban className="w-4 h-4" /></Button>
          </div>
        )}
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgs.length === 0 && (
          <p className="text-center text-xs text-muted-foreground pt-8">
            You matched 💜 — say hello. Chat, voice and video stay private inside RideX; your number is never shared.
          </p>
        )}
        {msgs.map((m) => {
          const mine = m.sender_id === user.id;
          const reactions = (() => { try { return JSON.parse(m.reactions_json || "{}"); } catch { return {}; } })();
          const shown = Object.entries(reactions).filter(([, v]) => v);
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${mine ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                {m.type === "image" && m.attachment_url ? (
                  <div className="w-44 h-44 rounded-xl overflow-hidden">
                    <Image src={m.attachment_url} alt="shared" className="w-full h-full" fittingType="fit" />
                  </div>
                ) : (
                  <p className="text-sm break-words">{m.body}</p>
                )}
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[10px] opacity-60">{new Date(m.created_at || m.created_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  {mine && m.read_at && <CheckCheck className="w-3 h-3 opacity-60" />}
                </div>
                {shown.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {shown.map(([uid, e], i) => <span key={i} className="text-sm bg-black/20 rounded-full px-1.5">{e}</span>)}
                  </div>
                )}
              </div>
              {active && (
                <div className="flex flex-col justify-center gap-0.5 pl-1">
                  {REACTIONS.map((e) => (
                    <button key={e} className="text-[10px] hover:scale-110 transition-transform" onClick={() => react(m, e)}>{e}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* meetup + ride */}
      {active && (
        <div className="border-t border-border/60 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-full flex-1" onClick={() => setShowMeetup((v) => !v)}>
              <CalendarCheck className="w-3.5 h-3.5 mr-1" /> {showMeetup ? "Hide meetup planner" : "Plan a meetup"}
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-full flex-1">
              <Link to="/ride"><Car className="w-3.5 h-3.5 mr-1" /> Get a RideX</Link>
            </Button>
          </div>
          {showMeetup && <MeetupPanel user={user} match={match} partner={partner} />}
        </div>
      )}

      {/* composer */}
      {active ? (
        <div className="border-t border-border/60 p-3 flex items-center gap-2">
          <button className="p-2 rounded-full hover:bg-secondary text-muted-foreground" title="Send an image" onClick={() => fileRef.current?.click()}>
            <Camera className="w-4 h-4" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { attachImage(e.target.files?.[0]); e.target.value = ""; }} />
          <Input
            className="rounded-full"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Message…"
          />
          <Button size="icon" className="rounded-full shrink-0" onClick={send}><Send className="w-4 h-4" /></Button>
        </div>
      ) : (
        <div className="border-t border-border/60 p-3 text-center text-xs text-muted-foreground">
          This conversation is closed. New messages are disabled.
        </div>
      )}

      {/* report dialog */}
      {reportOpen && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4 z-20" onClick={() => setReportOpen(false)}>
          <div className="rounded-3xl bg-card border border-border p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">Report {partner?.display_name || "member"}</p>
            <select className="w-full h-9 rounded-xl bg-background border border-input px-2 text-sm" value={reportCat} onChange={(e) => setReportCat(e.target.value)}>
              {api.REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
            </select>
            <Input className="rounded-xl" placeholder="What happened? (optional)" value={reportNote} onChange={(e) => setReportNote(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-full flex-1" onClick={() => setReportOpen(false)}>Cancel</Button>
              <Button className="rounded-full flex-1" onClick={submitReport}><Loader2 className="hidden" />Submit report</Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Blocking and reporting are always free — safety is never paywalled.</p>
          </div>
        </div>
      )}

      {/* block confirm */}
      {confirmBlock && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4 z-20" onClick={() => setConfirmBlock(false)}>
          <div className="rounded-3xl bg-card border border-border p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">Block {partner?.display_name || "this member"}?</p>
            <p className="text-xs text-muted-foreground">They immediately disappear from your discovery and all communication stops in both directions.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-full flex-1" onClick={() => setConfirmBlock(false)}>Cancel</Button>
              <Button variant="destructive" className="rounded-full flex-1" onClick={doBlock}>Block</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}