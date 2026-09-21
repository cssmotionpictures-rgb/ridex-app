import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { SAMPLE_MATRIX, SAMPLE_COHORTS, grossUpClear, clearMoney, cohortLabel } from "@/lib/sampleClearance";
import SampleClearanceDialog from "@/components/sample/SampleClearanceDialog";
import ClearanceDocumentsDialog from "@/components/sample/ClearanceDocumentsDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Disc3, Loader2, Landmark } from "lucide-react";

export default function SampleClearance() {
  const [artists, setArtists] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [cohort, setCohort] = React.useState("nigeria_historical");
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(null);
  const [request, setRequest] = React.useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await base44.entities.SampleClearanceArtist.list("sort_order", 300);
      setArtists(list.length ? list : SAMPLE_MATRIX.map((a, i) => ({ ...a, id: a.name, gross_fee: a.net * 1.2, status: "active", sort_order: i })));
    } catch {
      setArtists(SAMPLE_MATRIX.map((a, i) => ({ ...a, id: a.name, gross_fee: a.net * 1.2, status: "active", sort_order: i })));
    }
    setLoading(false);
  };
  React.useEffect(() => { load(); }, []);

  const filtered = artists
    .filter((a) => a.cohort === cohort && a.status !== "inactive")
    .filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <PageHeader
        eyebrow="Copyright Clearance Desk"
        title="Sample Clearance Matrix"
        subtitle="500-artist clearance ledger — master + composition two-tier licensing, 1960s public-domain assets flagged. Every quote 20% grossed-up onto the client."
      />

      <div className="relative mb-5">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search original artists…" className="rounded-full pl-9" />
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {SAMPLE_COHORTS.map((c) => (
          <button key={c.key} onClick={() => setCohort(c.key)} className={`px-4 py-1.5 rounded-full text-xs font-medium ${cohort === c.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
            {c.label.split("(")[0].trim()}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((a) => {
            const net = a.net_fee || a.net;
            const cur = a.currency || "USD";
            const g = grossUpClear(net);
            return (
              <div key={a.id || a.name} className="rounded-2xl border border-border/60 bg-card p-4 card-lift">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center"><Disc3 className="w-4 h-4 text-primary" /></div>
                    <div>
                      <p className="font-semibold leading-tight">{a.name}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{a.era}</p>
                    </div>
                  </div>
                  {a.public_domain && <span className="text-[9px] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-medium flex items-center gap-1"><Landmark className="w-2.5 h-2.5" />PD</span>}
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground space-y-0.5">
                  <p><span className="text-foreground/70">Master:</span> {a.master_controller || a.master}</p>
                  <p><span className="text-foreground/70">Publisher:</span> {a.publishing_admin || a.publisher}</p>
                </div>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Net clearance</span><span>{clearMoney(net, cur)}</span></div>
                  <div className="flex justify-between font-semibold"><span>Promoter gross</span><span className="text-primary">{clearMoney(g.gross, cur)}</span></div>
                </div>
                <Button size="sm" className="rounded-full w-full mt-3" onClick={() => setActive(a)}>Clear Sample</Button>
              </div>
            );
          })}
        </div>
      )}

      <SampleClearanceDialog
        open={!!active}
        onOpenChange={(v) => !v && setActive(null)}
        artist={active}
        onCreated={(rec) => { setActive(null); setRequest(rec); }}
      />
      <ClearanceDocumentsDialog open={!!request} onOpenChange={(v) => !v && setRequest(null)} request={request} />
    </div>
  );
}