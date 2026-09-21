import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Zap, Mail, Sparkles, CreditCard, Film, CheckCircle2 } from "lucide-react";

// Integration Bypass — when monthly credits (InvokeLLM / SendEmail / web lookups) run out,
// these one-tap actions force-complete the workflow LOCALLY (direct entity write, no
// integration call), so the app keeps working 100% until credits refresh.
export default function AdminBypass() {
  const [busy, setBusy] = React.useState(null);
  const [ff, setFf] = React.useState({ application_id: "", score: "9.6" });
  const [evt, setEvt] = React.useState({ title: "", artist_lineup: "", city: "Lagos", event_date: "" });
  const [cardId, setCardId] = React.useState("");
  const [invoiceId, setInvoiceId] = React.useState("");
  const [subId, setSubId] = React.useState("");

  const run = async (flow, payload, label) => {
    setBusy(flow);
    try {
      const res = await base44.functions.invoke("integration-bypass", { flow, payload });
      const data = res?.data || res;
      toast({ title: `${label} — bypassed`, description: `Done locally. ${JSON.stringify(data).slice(0, 120)}` });
    } catch (e) {
      toast({ title: `${label} failed`, description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const card = (icon, title, desc, children) => (
    <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/15 text-primary p-2 shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm">Integration Bypass Backdoor</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            When monthly integration credits run out, use these to complete workflows locally —
            no LLM / email / web-lookup call is made. Records are written directly to their final state.
          </p>
        </div>
      </div>

      {card(
        <Sparkles className="w-5 h-5" />,
        "Free Feature — approve without A&R scoring",
        "Skips the InvokeLLM A&R score. Sets the application to approved with a manual score.",
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
          <div className="sm:col-span-2">
            <Label className="text-xs">Application ID</Label>
            <Input value={ff.application_id} onChange={(e) => setFf({ ...ff, application_id: e.target.value })} placeholder="FreeFeatureApplication id" />
          </div>
          <div>
            <Label className="text-xs">Score</Label>
            <Input value={ff.score} onChange={(e) => setFf({ ...ff, score: e.target.value })} />
          </div>
          <div className="sm:col-span-3">
            <Button className="rounded-full w-full" disabled={busy === "free_feature" || !ff.application_id} onClick={() => run("free_feature", { application_id: ff.application_id, score: parseFloat(ff.score) || 9.6 }, "Free Feature")}>
              {busy === "free_feature" ? "Working…" : "Force approve"}
            </Button>
          </div>
        </div>
      )}

      {card(
        <CheckCircle2 className="w-5 h-5" />,
        "Curator submissions — accept without email",
        "Accepts pending curator submissions without the SendEmail notification call.",
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Single submission ID (leave blank to accept ALL pending)</Label>
            <Input value={subId} onChange={(e) => setSubId(e.target.value)} placeholder="submission id or blank for all" />
          </div>
          <Button className="rounded-full w-full" disabled={busy === "curator_accept"} onClick={() => run("curator_accept", subId ? { submission_id: subId } : {}, "Curator accept")}>
            {busy === "curator_accept" ? "Working…" : "Accept (skip email)"}
          </Button>
        </div>
      )}

      {card(
        <Film className="w-5 h-5" />,
        "Auto-Find Events — list manually",
        "Creates an event directly, skipping the LLM/web scan that burns credits.",
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div><Label className="text-xs">Title</Label><Input value={evt.title} onChange={(e) => setEvt({ ...evt, title: e.target.value })} placeholder="Concert title" /></div>
          <div><Label className="text-xs">Artists</Label><Input value={evt.artist_lineup} onChange={(e) => setEvt({ ...evt, artist_lineup: e.target.value })} placeholder="Lineup" /></div>
          <div><Label className="text-xs">City</Label><Input value={evt.city} onChange={(e) => setEvt({ ...evt, city: e.target.value })} /></div>
          <div><Label className="text-xs">Date (ISO)</Label><Input value={evt.event_date} onChange={(e) => setEvt({ ...evt, event_date: e.target.value })} placeholder="YYYY-MM-DDTHH:MM" /></div>
          <div className="sm:col-span-2">
            <Button className="rounded-full w-full" disabled={busy === "auto_find_events" || !evt.title} onClick={() => run("auto_find_events", evt, "Auto-Find Events")}>
              {busy === "auto_find_events" ? "Working…" : "List event now"}
            </Button>
          </div>
        </div>
      )}

      {card(
        <CreditCard className="w-5 h-5" />,
        "Ride X Card — issue without email",
        "Marks the card issued, skipping the registration email call.",
        <div className="space-y-2">
          <div><Label className="text-xs">Card ID</Label><Input value={cardId} onChange={(e) => setCardId(e.target.value)} placeholder="RideXCard id" /></div>
          <Button className="rounded-full w-full" disabled={busy === "card_issue" || !cardId} onClick={() => run("card_issue", { card_id: cardId }, "Ride X Card")}>
            {busy === "card_issue" ? "Working…" : "Mark issued"}
          </Button>
        </div>
      )}

      {card(
        <Mail className="w-5 h-5" />,
        "Invoice — mark emailed (no send)",
        "Marks the invoice/receipt as emailed without the SendEmail call.",
        <div className="space-y-2">
          <div><Label className="text-xs">Invoice ID</Label><Input value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} placeholder="Invoice id" /></div>
          <Button className="rounded-full w-full" disabled={busy === "receipt_emailed" || !invoiceId} onClick={() => run("receipt_emailed", { invoice_id: invoiceId }, "Receipt emailed")}>
            {busy === "receipt_emailed" ? "Working…" : "Mark emailed"}
          </Button>
        </div>
      )}

      {card(
        <Zap className="w-5 h-5" />,
        "Queen chat — canned reply",
        "Returns a holding reply without calling InvokeLLM, so the assistant never errors.",
        <Button className="rounded-full w-full" disabled={busy === "queen_reply"} onClick={() => run("queen_reply", {}, "Queen reply")}>
          {busy === "queen_reply" ? "Working…" : "Get canned reply"}
        </Button>
      )}
    </div>
  );
}