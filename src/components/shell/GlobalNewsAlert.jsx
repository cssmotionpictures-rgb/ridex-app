import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { X, AlertTriangle, Radio } from "lucide-react";
import { getBreakingNews } from "@/lib/newsAlerts";

// App-wide breaking-news alert bar. Shows the freshest headline from the
// zero-credit RSS radar (BBC / Al Jazeera / Sky) directly under the app shell
// header. Dismissible per session; refreshes every 5 minutes.
export default function GlobalNewsAlert() {
  const [item, setItem] = useState(null);
  const [show, setShow] = useState(false);
  const seen = useRef(new Set());

  useEffect(() => {
    const DISMISS_KEY = "ridex_news_dismiss";
    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;

    const tick = async () => {
      try {
        const data = await getBreakingNews();
        const fresh = data?.items || [];
        if (!fresh.length) return;
        // newest headline we haven't shown yet
        const top = fresh.find((it) => !seen.current.has(it.link || it.title)) || fresh[0];
        if (!top) return;
        seen.current.add(top.link || top.title);
        setItem(top);
        setShow(true);
      } catch (e) { /* silent */ }
    };
    tick();
    const id = setInterval(tick, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const dismiss = () => {
    setShow(false);
    sessionStorage.setItem("ridex_news_dismiss", "1");
  };

  if (!show || !item) return null;

  const isBreaking = item.breaking || /breaking|urgent|just in/i.test(item.title || "");

  return (
    <div className={`sticky top-16 z-[450] border-b ${isBreaking ? "border-red-500/40 bg-red-500/10" : "border-primary/30 bg-primary/5"}`}>
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2 text-xs">
        <span className={`shrink-0 inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full text-white ${isBreaking ? "bg-red-500" : "bg-primary text-primary-foreground"}`}>
          {isBreaking ? <AlertTriangle className="w-3 h-3" /> : <Radio className="w-3 h-3" />}
          {isBreaking ? "BREAKING" : "NEWS"}
        </span>
        <Link to="/sports" className="min-w-0 flex-1 flex items-center gap-2 hover:underline">
          <span className="truncate font-medium text-foreground">{item.title}</span>
          <span className="shrink-0 text-muted-foreground hidden sm:inline">— {item.source}</span>
        </Link>
        <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 p-1 rounded-full hover:bg-background/60 text-muted-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}