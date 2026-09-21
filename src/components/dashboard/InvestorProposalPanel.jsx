import React from "react";
import { Loader2, Mail, Send } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

// Investor outreach, triggered straight from the dashboard — sends the
// professional Ride X business proposal to the admin-managed investor list
// (the funding directory) in one click. Admin-only; capped at 50 per run.
export default function InvestorProposalPanel({ user }) {
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [emails, setEmails] = React.useState("");
  const { toast } = useToast();

  if (!user || user.role !== "admin") return null;

  const send = async () => {
    setBusy(true);
    setResult(null);
    const list = emails.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean);
    try {
      const res = await base44.functions.invoke("investor-proposal-blast", { emails: list });
      const d = res?.data || res;
      setResult(d);
      toast({
        title: d?.ok ? "Investor proposals sent" : "Some proposals failed",
        description: `${d?.sent ?? 0} delivered · ${d?.failed ?? 0} failed${d?.skipped ? ` · ${d.skipped} held for the next run` : ""}.`,
      });
    } catch (e) {
      toast({ title: "Could not send proposals", description: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-6 mb-8">
      <div className="flex items-center gap-4">
        <div className="size-12 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
          <Mail className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Investor outreach</p>
          <p className="text-lg font-extrabold">Send the Ride X business proposal</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Emails the professional investment proposal to your investor list (the funding directory) — up to 50 contacts per run.
          </p>
        </div>
        <Button className="rounded-full font-semibold shrink-0" disabled={busy} onClick={send}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send proposals
        </Button>
      </div>
      <Textarea
        className="mt-4 bg-secondary/60 border-border/60 text-sm"
        rows={2}
        value={emails}
        onChange={(e) => setEmails(e.target.value)}
        placeholder="Optional — paste extra investor emails (comma or newline separated). Your funding directory is always included automatically."
      />
      {result && (
        <div className={`mt-4 rounded-2xl px-4 py-3 text-xs ${result.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
          {result.sent} proposal{result.sent === 1 ? "" : "s"} delivered · {result.failed} failed · {result.total} investors on the list
          {(result.failures || []).length > 0 && (
            <span className="block text-[11px] opacity-80 mt-1">
              Could not reach: {result.failures.map((f) => f.email).join(", ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}