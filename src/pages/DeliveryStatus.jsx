import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Landmark, Users, Circle } from "lucide-react";

// EMAIL DELIVERY DASHBOARD — live status of every automatic outbound email
// (lender loan proposals + influencer submission deliveries). Failed sends
// are highlighted with their error and a one-tap manual resend.
const STATUS_UI = {
  sent: { label: "Delivered", cls: "bg-emerald-500/10 text-emerald-400", Icon: CheckCircle2 },
  failed: { label: "Failed", cls: "bg-destructive/15 text-destructive", Icon: XCircle },
  not_sent: { label: "Not sent", cls: "bg-secondary text-muted-foreground", Icon: Circle },
};

function when(iso) {
  try {
    return iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  } catch {
    return "";
  }
}

export default function DeliveryStatus() {
  const { toast } = useToast();
  const [loans, setLoans] = React.useState([]);
  const [matches, setMatches] = React.useState([]);
  const [loaded, setLoaded] = React.useState(false);
  const [filter, setFilter] = React.useState("all");
  const [resending, setResending] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      const [l, m] = await Promise.all([
        base44.entities.LoanApplication.list("-created_date", 100).catch(() => []),
        base44.entities.InfluencerMatch.list("-created_date", 100).catch(() => []),
      ]);
      setLoans(l || []);
      setMatches(m || []);
    } finally {
      setLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const rows = React.useMemo(() => {
    const loanRows = (loans || []).map((a) => ({
      key: `loan-${a.id}`,
      type: "lender",
      id: a.id,
      title: a.business_name || a.tier || "Loan application",
      who: a.applicant_name || "",
      to: a.delivery_email || "",
      status: a.delivery_status || "not_sent",
      error: a.delivery_error || "",
      at: a.delivered_at || a.created_date,
      detail: a.funding_source || "Auto-matched source",
    }));
    const matchRows = (matches || []).map((m) => ({
      key: `inf-${m.id}`,
      type: "influencer",
      id: m.id,
      title: m.submission_title || "Submission",
      who: m.influencer_name || "",
      to: m.delivery_email || "",
      status: m.delivery_status || (m.auto_notified ? "sent" : "not_sent"),
      error: m.delivery_error || "",
      at: m.delivered_at || m.created_date,
      detail: m.artist_name || "",
    }));
    const all = [...matchRows, ...loanRows];
    // failures first, then most recent
    const rank = (s) => (s === "failed" ? 0 : s === "sent" ? 1 : 2);
    return all.sort(
      (a, b) => rank(a.status) - rank(b.status) || String(b.at || "").localeCompare(String(a.at || ""))
    );
  }, [loans, matches]);

  const counts = React.useMemo(
    () => ({
      sent: rows.filter((r) => r.status === "sent").length,
      failed: rows.filter((r) => r.status === "failed").length,
      notSent: rows.filter((r) => r.status === "not_sent").length,
      lender: rows.filter((r) => r.type === "lender").length,
      influencer: rows.filter((r) => r.type === "influencer").length,
    }),
    [rows]
  );

  const filtered = rows.filter((r) =>
    filter === "all" ? true : filter === "failed" ? r.status === "failed" : r.type === filter
  );

  const resend = async (r) => {
    setResending(r.key);
    try {
      let d;
      if (r.type === "lender") {
        const res = await base44.functions.invoke("loan-application-email", {
          action: "send",
          id: r.id,
          force: true,
        });
        d = res.data || res;
      } else {
        const res = await base44.functions.invoke("auto-match-influencers", {
          action: "resend",
          match_id: r.id,
        });
        d = res.data || res;
      }
      if (d?.ok) {
        toast({ title: "Delivered", description: `Resent to ${d.email || r.to || "the recipient"}` });
      } else {
        throw new Error(d?.error || "Resend failed");
      }
      await load();
    } catch (e) {
      toast({ title: "Resend failed", description: e.message, variant: "destructive" });
      await load();
    } finally {
      setResending(null);
    }
  };

  const chips = [
    ["all", `All ${rows.length}`],
    ["failed", `Failed ${counts.failed}`],
    ["lender", `Lenders ${counts.lender}`],
    ["influencer", `Influencers ${counts.influencer}`],
  ];

  return (
    <div>
      <PageHeader
        eyebrow="✉️ Deliveries"
        title="Email Delivery Dashboard"
        subtitle="Live status of every automatic outbound email — lender loan proposals and influencer submission deliveries. Failed sends are highlighted with the exact reason; fix the address (or add it to the manual lender directory) and resend with one tap."
      />

      {/* Summary + filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {chips.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-semibold border transition",
              filter === key
                ? key === "failed"
                  ? "bg-destructive/15 text-destructive border-destructive/50"
                  : "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border/60 hover:border-primary/50"
            )}
          >
            {label}
          </button>
        ))}
        <span className="text-[11px] text-muted-foreground ml-auto">
          {counts.sent} delivered · {counts.failed} failed · {counts.notSent} not sent
        </span>
      </div>

      {!loaded ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-6 text-sm text-muted-foreground">
          {filter === "failed"
            ? "No failed deliveries — every automatic email on record went through."
            : "No outbound deliveries recorded yet. Loan proposals and influencer submissions appear here the moment they're sent."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const S = STATUS_UI[r.status] || STATUS_UI.not_sent;
            return (
              <div
                key={r.key}
                className={cn(
                  "rounded-xl border p-3 sm:p-4",
                  r.status === "failed" ? "border-destructive/60 bg-destructive/5" : "border-border/60 bg-card"
                )}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={cn(
                      "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                      r.type === "lender" ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent"
                    )}
                  >
                    {r.type === "lender" ? <Landmark className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold truncate">{r.title}</p>
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold", S.cls)}>
                        <S.Icon className="w-3 h-3" /> {S.label}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {r.type === "lender" ? "Lender proposal" : "Influencer delivery"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {r.type === "lender" ? `To lender for ${r.who || "applicant"}` : `To ${r.who || "influencer"}`}
                      {r.detail ? ` · ${r.detail}` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">
                      {r.to ? `→ ${r.to}` : "→ no address on record"} {r.at ? `· ${when(r.at)}` : ""}
                    </p>
                    {r.status === "failed" && r.error && (
                      <p className="text-[11px] text-destructive mt-1.5 leading-relaxed">⚠ {r.error}</p>
                    )}
                  </div>
                  {(r.status === "failed" || r.status === "not_sent") && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10"
                      disabled={resending === r.key}
                      onClick={() => resend(r)}
                    >
                      {resending === r.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Resend
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}