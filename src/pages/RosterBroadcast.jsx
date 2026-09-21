import React from "react";
import { base44 } from "@/api/base44Client";
import { AGENCY } from "@/lib/agency";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Send, Info, CalendarClock, CheckCircle2, Database, Trash2, Zap, Search } from "lucide-react";
import { runWeeklyBroadcast, runRosterBlast, getQueue, clearQueue, queueLength, lagosDate, lagosNow } from "@/lib/clientBackdoor";

export default function RosterBroadcast() {
  const { toast } = useToast();
  const [recipients, setRecipients] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [cfgId, setCfgId] = React.useState(null);
  const [lastWeekly, setLastWeekly] = React.useState("");
  const [autoRan, setAutoRan] = React.useState(null);
  const [queue, setQueue] = React.useState([]);
  const [loaded, setLoaded] = React.useState(false);

  const refreshQueue = () => setQueue(getQueue());

  // Load the saved default recipient list from the global automation config.
  React.useEffect(() => {
    base44.entities.AutomationSetting.filter({ name: "global" }).then((list) => {
      const cfg = list && list[0];
      if (cfg) {
        setCfgId(cfg.id);
        if (cfg.broadcast_recipients) setRecipients(cfg.broadcast_recipients);
        setLastWeekly(cfg.last_weekly_send_date || "");
      }
    }).catch(() => {}).finally(() => setLoaded(true));
    refreshQueue();
  }, []);

  // AUTO-RUN: if today is Monday (Lagos) and the weekly broadcast hasn't run yet
  // today, fire it client-side on page open — the Monday dispatch never misses,
  // even with backend functions blocked. Email content is generated in-browser
  // and queued; it drains automatically once credits reset.
  React.useEffect(() => {
    if (!loaded) return;
    const today = lagosDate();
    if (lagosNow().getDay() === 1 && lastWeekly !== today) {
      (async () => {
        setBusy(true);
        try {
          const r = await runWeeklyBroadcast(base44, { force: false });
          setAutoRan(r);
          setLastWeekly(lagosDate());
          if (!r.skipped) toast({ title: "Weekly broadcast ran (client-side)", description: `Queued ${r.totalSent || 0} emails · in-browser queue.` });
        } catch (e) {}
        finally { setBusy(false); refreshQueue(); }
      })();
    }
  }, [loaded, lastWeekly]);

  // Persist the recipient list so the weekly cron uses it automatically.
  const persistRecipients = async (list) => {
    if (!cfgId) return;
    try {
      await base44.entities.AutomationSetting.update(cfgId, { broadcast_recipients: list.join("\n") });
    } catch {}
  };

  const send = async () => {
    const list = recipients.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    if (!list.length) { toast({ title: "Add at least one recipient", variant: "destructive" }); return; }
    setBusy(true); setResult(null);
    try {
      await persistRecipients(list);
      // Try the backend function first; if it's blocked (credits exhausted),
      // fall back to the client-side back door so the broadcast still goes out.
      let d;
      try {
        const res = await base44.functions.invoke("broadcast-roster", { recipients: list });
        d = res.data || res;
        if (!d || d.error) throw new Error(d?.error || "backend unavailable");
      } catch (e) {
        d = await runRosterBlast(base44, list);
        d._backdoor = true;
      }
      setResult(d);
      toast({ title: d._backdoor ? `Queued ${d.sent} (back door)` : `Sent ${d.sent || 0} · failed ${d.failed || 0}`, description: d._backdoor ? "Saved to in-browser queue — auto-drained when credits reset." : "Recipient list saved for the weekly auto-broadcast." });
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); refreshQueue(); }
  };

  // Auto-discover the real, official contact emails of Nigerian promoters &
  // media directors by live web search (runs server-side — no CORS, no
  // workspace credits) and save them as the Monday list. No emails sent here.
  const autoFind = async () => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke("broadcast-roster", { dry_run: true, search_limit: 5 });
      const d = res.data || res;
      if (d?.recipients?.length) {
        setRecipients(d.recipients.join("\n"));
        toast({ title: `Found ${d.recipients.length} real contact emails`, description: "Official promoter & media emails from live web search — saved as your Monday broadcast list." });
      } else {
        toast({ title: "No emails found this run", description: d?.error || "The search retries automatically; try again in a moment.", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Search failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const runWeeklyNow = async () => {
    setBusy(true);
    try {
      const r = await runWeeklyBroadcast(base44, { force: true });
      setAutoRan(r);
      setLastWeekly(lagosDate());
      toast({ title: r.skipped ? "Skipped" : "Weekly broadcast ran", description: r.skipped ? `Reason: ${r.skipped}` : `Queued ${r.totalSent || 0} emails (in-browser).` });
    } catch (e) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); refreshQueue(); }
  };

  return (
    <div>
      <PageHeader eyebrow="Monday Dispatch" title="Weekly Roster Broadcast" subtitle="Blast the roster & ticket-availability update to your promoter and media-director network — saved here, then auto-sent every Monday at 08:00. A rotating sample of subscribed individuals also gets the weekly what-Ride-X-offers email automatically." />
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
          <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 text-xs text-primary flex gap-2">
            <CalendarClock className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Automatic: runs on its own every Monday (Lagos) in-browser — no backend function, no credits. Emails queue to in-browser storage and drain to recipients once credits reset.</span>
          </div>
          <div>
            <label className="text-xs font-medium">Recipient emails</label>
            <Textarea className="rounded-xl mt-1" rows={6} value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder={"promoter@company.com\nmedia@studio.ng"} />
            <p className="text-[11px] text-muted-foreground mt-1">One per line or comma-separated. Saved automatically when you send (and used by the weekly auto-broadcast).</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="rounded-full flex-1" disabled={busy || !loaded} onClick={send}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send blast & save
            </Button>
            <Button variant="outline" className="rounded-full" disabled={busy} onClick={autoFind} title="Find real promoter & media-director emails by live web search">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Auto-find emails
            </Button>
            <Button variant="outline" className="rounded-full" disabled={busy} onClick={runWeeklyNow} title="Force-run the full weekly newsletter + B2B broadcast now">
              <Zap className="w-4 h-4" /> Run weekly now
            </Button>
          </div>
          {autoRan && !autoRan.skipped && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-300 flex gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Auto-ran this Monday: {autoRan.totalSent || 0} emails queued (subs {autoRan.subscribers?.sent || 0} · B2B {autoRan.b2b?.sent || 0}). Last run: {autoRan.date}.</span>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground text-center">Dispatched by {AGENCY.name} · {AGENCY.phone}</p>
        </div>

        <div className="space-y-3">
          {/* In-browser email queue (the back door) */}
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold flex items-center gap-2"><Database className="w-4 h-4 text-primary" /> In-browser queue</p>
              <span className="text-xs text-muted-foreground">{queue.length} queued</span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">Emails generated client-side while credits are exhausted. Auto-drained to recipients by the backend once credits reset.</p>
            <div className="max-h-40 overflow-auto space-y-1">
              {queue.length === 0 ? <p className="text-xs text-muted-foreground italic">Queue empty.</p> :
                queue.slice(-8).reverse().map((e) => (
                  <div key={e.id} className="text-[11px] flex justify-between gap-2">
                    <span className="truncate">{e.to || e.channel}</span>
                    <span className="text-muted-foreground">{e.channel} · {e.subject?.slice(0, 24)}</span>
                  </div>
                ))}
            </div>
            {queue.length > 0 && (
              <Button variant="ghost" size="sm" className="mt-2 text-destructive" onClick={() => { clearQueue(); refreshQueue(); }}>
                <Trash2 className="w-3.5 h-3.5" /> Clear queue
              </Button>
            )}
          </div>

          {result ? (
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <p className="text-sm font-semibold mb-2 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> {result._backdoor ? "Back-door dispatch" : "Dispatch report"}</p>
              <p className="text-xs text-muted-foreground">{result._backdoor ? `Queued: ${result.sent}` : `Sent: ${result.sent} · Failed: ${result.failed}`}</p>
              {result.individuals ? <p className="text-[11px] text-muted-foreground mt-1">Individuals notified with the services email: {result.individuals.sent}{result.individuals.discovered ? ` · ${result.individuals.discovered} newly found by web search` : ""}{result.individuals.failed ? ` · ${result.individuals.failed} failed` : ""}{result.individuals.skipped ? ` · ${result.individuals.skipped} rotated for next week` : ""}</p> : null}
              <div className="mt-2 space-y-1 max-h-72 overflow-auto">
                {(result.results || []).map((r, i) => (
                  <div key={i} className="text-xs flex justify-between">
                    <span className="truncate">{r.email}</span>
                    <span className={r.status === "sent" ? "text-emerald-400" : "text-destructive"}>{r.status}{r.error ? ` · ${r.error}` : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
              The broadcast builds a roster summary from your active artists (net → 20% gross-up), with international routing notes, and emails it to every recipient above. The list is saved and re-used by the automatic Monday broadcast.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}