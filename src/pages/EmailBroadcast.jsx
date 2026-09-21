import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Send, Users, Upload, Building2, List, CalendarClock } from "lucide-react";

const COUNTRIES = [
  "Nigeria - Lagos", "Nigeria - Abuja", "Nigeria - Other",
  "Ghana", "Kenya", "South Africa",
  "United States", "United Kingdom", "Other",
];

export default function EmailBroadcast() {
  const { toast } = useToast();
  const [tab, setTab] = React.useState("broadcast");
  const [busy, setBusy] = React.useState(false);

  // broadcast
  const [bCountry, setBCountry] = React.useState("");
  const [bSubject, setBSubject] = React.useState("");
  const [bHtml, setBHtml] = React.useState("");
  // b2b
  const [bizCountry, setBizCountry] = React.useState("");
  const [bizSubject, setBizSubject] = React.useState("");
  const [bizHtml, setBizHtml] = React.useState("");
  const [importEmails, setImportEmails] = React.useState("");
  const [importCountry, setImportCountry] = React.useState("");
  // list
  const [listCountry, setListCountry] = React.useState("");
  const [subscribers, setSubscribers] = React.useState([]);

  const run = async (action, payload, doneMsg) => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke("email-broadcast-admin", { action, ...payload });
      const d = res.data || res;
      if (d.error) { toast({ title: d.error, variant: "destructive" }); return; }
      if (action === "list") setSubscribers(d.subscribers || []);
      else toast({ title: doneMsg(d) });
    } catch (e) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const sendBroadcast = () => run("broadcast", { country: bCountry, subject: bSubject, html: bHtml }, (d) => `Sent ${d.sent} · failed ${d.failed}`);
  const sendB2b = () => run("b2b", { country: bizCountry, subject: bizSubject, html: bizHtml }, (d) => `Sent ${d.sent} · failed ${d.failed}`);
  const doImport = () => run("import", { emails: importEmails, country: importCountry }, (d) => `Imported ${d.imported} business emails`);
  const doList = () => run("list", { country: listCountry }, (d) => `${d.total} subscribers`);

  const sendWeekly = async () => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke("email-weekly", {});
      const d = res.data || res;
      if (d.error) toast({ title: d.error, variant: "destructive" });
      else toast({ title: `Weekly send: ${d.sent} sent · ${d.failed} failed` });
    } catch (e) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const tabs = [
    { id: "broadcast", label: "Broadcast", icon: Send },
    { id: "b2b", label: "B2B Outreach", icon: Building2 },
    { id: "import", label: "Import B2B", icon: Upload },
    { id: "list", label: "Subscribers", icon: List },
  ];

  return (
    <div>
      <PageHeader eyebrow="Country Targeting" title="Email Broadcast" subtitle="Send targeted broadcasts by country, run B2B outreach, and manage subscribers. The weekly country-targeted newsletter fires automatically every Monday 09:00 (Lagos)." action={
        <Button className="rounded-full" disabled={busy} onClick={sendWeekly}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />} Run weekly now
        </Button>
      } />

      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-5">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`shrink-0 px-4 py-2 rounded-full text-xs font-medium border ${tab === t.id ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground"}`}>
            <t.icon className="w-3.5 h-3.5 inline mr-1" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "broadcast" && (
        <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3 max-w-xl">
          <p className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Targeted broadcast to subscribers</p>
          <select value={bCountry} onChange={(e) => setBCountry(e.target.value)} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="">All countries…</option>
            {COUNTRIES.map((c) => <option key={c} value={c} className="bg-card">{c}</option>)}
          </select>
          <Input value={bSubject} onChange={(e) => setBSubject(e.target.value)} placeholder="Subject" className="rounded-xl" />
          <Textarea value={bHtml} onChange={(e) => setBHtml(e.target.value)} rows={6} placeholder="<p>Your HTML message…</p>" className="rounded-xl" />
          <Button className="rounded-full" disabled={busy || !bSubject || !bHtml} onClick={sendBroadcast}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send broadcast
          </Button>
        </div>
      )}

      {tab === "b2b" && (
        <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3 max-w-xl">
          <p className="text-sm font-semibold flex items-center gap-2"><Building2 className="w-4 h-4 text-primary" /> B2B outreach to business contacts</p>
          <select value={bizCountry} onChange={(e) => setBizCountry(e.target.value)} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="">All countries…</option>
            {COUNTRIES.map((c) => <option key={c} value={c} className="bg-card">{c}</option>)}
          </select>
          <Input value={bizSubject} onChange={(e) => setBizSubject(e.target.value)} placeholder="Subject" className="rounded-xl" />
          <Textarea value={bizHtml} onChange={(e) => setBizHtml(e.target.value)} rows={6} placeholder="<p>Your B2B HTML message…</p>" className="rounded-xl" />
          <Button className="rounded-full" disabled={busy || !bizSubject || !bizHtml} onClick={sendB2b}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send B2B outreach
          </Button>
        </div>
      )}

      {tab === "import" && (
        <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3 max-w-xl">
          <p className="text-sm font-semibold flex items-center gap-2"><Upload className="w-4 h-4 text-primary" /> Import business emails (B2B, consent-based)</p>
          <select value={importCountry} onChange={(e) => setImportCountry(e.target.value)} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="">Select country…</option>
            {COUNTRIES.map((c) => <option key={c} value={c} className="bg-card">{c}</option>)}
          </select>
          <Textarea value={importEmails} onChange={(e) => setImportEmails(e.target.value)} rows={6} placeholder={"contact@company.com\ninfo@business.org"} className="rounded-xl" />
          <Button className="rounded-full" disabled={busy || !importEmails || !importCountry} onClick={doImport}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Import
          </Button>
        </div>
      )}

      {tab === "list" && (
        <div className="rounded-2xl border border-border/60 bg-card p-5 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <select value={listCountry} onChange={(e) => setListCountry(e.target.value)} className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">All countries…</option>
              {COUNTRIES.map((c) => <option key={c} value={c} className="bg-card">{c}</option>)}
            </select>
            <Button className="rounded-full" disabled={busy} onClick={doList}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <List className="w-4 h-4" />} Load subscribers
            </Button>
          </div>
          <div className="space-y-1 max-h-96 overflow-auto">
            {subscribers.map((s, i) => (
              <div key={i} className="text-xs flex justify-between gap-2 py-1 border-b border-border/30">
                <span className="truncate">{s.email}</span>
                <span className="text-muted-foreground shrink-0">{s.country} {s.opted_out ? "· out" : ""}</span>
              </div>
            ))}
            {!subscribers.length && <p className="text-xs text-muted-foreground">No subscribers loaded yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}