import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, X, Send, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { queenReply } from "@/lib/inBrowserLLM";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const GREETING = "I'm Ride X Queen, how may I be of service?";

// Ensure voices are loaded before we try to speak (Chrome loads them async)
function ensureVoices() {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return resolve([]);
    let v = window.speechSynthesis.getVoices();
    if (v.length) return resolve(v);
    const handler = () => {
      v = window.speechSynthesis.getVoices();
      resolve(v);
    };
    window.speechSynthesis.addEventListener("voiceschanged", handler, { once: true });
    setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve(window.speechSynthesis.getVoices());
    }, 800);
  });
}

const SUGGESTIONS = [
  "How do I book a ride?",
  "Where do I see my event tickets?",
  "How do I book an artist?",
  "A video won't play, help",
  "How do payments work?",
];

export default function RideXQueen() {
  const [open, setOpen] = React.useState(false);
  const [greeted, setGreeted] = React.useState(false);
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const scrollRef = React.useRef(null);

  const speakGreeting = React.useCallback(async () => {
    if (greeted || typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      const voices = await ensureVoices();
      const u = new SpeechSynthesisUtterance(GREETING);
      u.lang = "en-US";
      u.rate = 0.96;
      u.pitch = 1.08;
      const preferred =
        voices.find((v) => /en-US|en_US/i.test(v.lang) && /female|samantha|zira|google|aria|jenny/i.test(v.name)) ||
        voices.find((v) => /en/i.test(v.lang));
      if (preferred) u.voice = preferred;
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(u);
      setGreeted(true);
    } catch {}
  }, [greeted]);

  // Warm up voices so the first greeting has a female voice ready
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    ensureVoices();
  }, []);

  const handleOpen = () => {
    setOpen(true);
    // The click is a user gesture, which unlocks audio playback — speak right away
    speakGreeting();
  };

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    let reply = "";
    try {
      const res = await base44.functions.invoke("queen-chat", { message: content, history: messages });
      reply = res?.data?.reply || "";
    } catch {
      // Backend down (integration credits exhausted) — use the keyless in-browser LLM.
      reply = "";
    }
    if (!reply) {
      try { reply = await queenReply(content, messages); }
      catch { reply = "Sorry, I couldn't reach the server. Please try again in a moment."; }
    }
    setMessages([...next, { role: "assistant", content: reply }]);
    setBusy(false);
  };

  return (
    <>
      {/* Floating launcher */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            onClick={handleOpen}
            aria-label="Open Ride X Queen assistant"
            className="fixed z-[600] bottom-5 right-5 h-14 w-14 rounded-full bg-gradient-to-br from-primary to-amber-500 text-primary-foreground shadow-2xl shadow-primary/30 flex items-center justify-center"
          >
            <Crown className="w-7 h-7" />
            <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-background" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed z-[600] bottom-0 right-0 sm:bottom-5 sm:right-5 w-full sm:w-[380px] h-[80vh] sm:h-[560px] sm:max-h-[80vh] glass rounded-t-3xl sm:rounded-3xl border border-border/70 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-border/60 bg-gradient-to-r from-primary/15 to-transparent">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-amber-500 text-primary-foreground flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="font-heading font-bold text-sm leading-tight">Ride X Queen</p>
                <p className="text-[11px] text-emerald-400 flex items-center gap-1 leading-tight">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Online
                </p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close assistant" className="ml-auto text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
              {messages.length === 0 && (
                <div className="text-center py-6">
                  <div className="mx-auto mb-3 h-14 w-14 rounded-full bg-gradient-to-br from-primary to-amber-500 text-primary-foreground flex items-center justify-center">
                    <Sparkles className="w-7 h-7" />
                  </div>
                  <p className="font-heading font-semibold text-sm">Hey there, I'm Ride X Queen 👑</p>
                  <p className="text-xs text-muted-foreground mt-1">Your personal guide to the whole Ride X app. Ask me anything!</p>
                  <div className="mt-4 flex flex-col gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="text-left text-xs px-3 py-2 rounded-full border border-border/70 hover:border-primary/50 hover:bg-primary/10 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-secondary text-secondary-foreground rounded-bl-md"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {busy && (
                <div className="flex justify-start">
                  <div className="bg-secondary px-3.5 py-3 rounded-2xl rounded-bl-md flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "120ms" }} />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "240ms" }} />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border/60 flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                placeholder="Ask Queen anything…"
                disabled={busy}
                className="rounded-full"
              />
              <Button size="icon" className="rounded-full shrink-0" disabled={busy || !input.trim()} onClick={() => send()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}