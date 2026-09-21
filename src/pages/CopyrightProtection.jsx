import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ngn } from "@/lib/copyrightProtection";
import RegisterTrackDialog from "@/components/copyright/RegisterTrackDialog";
import SplitSheetDialog from "@/components/copyright/SplitSheetDialog";
import CeaseDesistDialog from "@/components/copyright/CeaseDesistDialog";
import CopyrightDocsDialog from "@/components/copyright/CopyrightDocsDialog";
import RegulatoryPortals from "@/components/shared/RegulatoryPortals";
import { Plus, ShieldCheck, FileText, Gavel, Loader2 } from "lucide-react";

export default function CopyrightProtection() {
  const [tab, setTab] = React.useState("register");
  const [regs, setRegs] = React.useState([]);
  const [splits, setSplits] = React.useState([]);
  const [cases, setCases] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [regOpen, setRegOpen] = React.useState(false);
  const [splitOpen, setSplitOpen] = React.useState(false);
  const [cdOpen, setCdOpen] = React.useState(false);
  const [doc, setDoc] = React.useState({ open: false, docType: "certificate", record: null });

  const load = async () => {
    setLoading(true);
    try {
      const [r, s, c] = await Promise.all([
        base44.entities.CopyrightRegistration.list("-created_date", 50).catch(() => []),
        base44.entities.SplitSheet.list("-created_date", 50).catch(() => []),
        base44.entities.InfringementCase.list("-created_date", 50).catch(() => []),
      ]);
      setRegs(r); setSplits(s); setCases(c);
    } catch {}
    setLoading(false);
  };
  React.useEffect(() => { load(); }, []);

  const showDoc = (record, docType) => setDoc({ open: true, docType, record });

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <PageHeader
        eyebrow="Legal & IP Division"
        title="Copyright Protection Desk"
        subtitle="Automatic copyright under the Nigerian Copyright Act 2022. Register tracks, file split sheets, and enforce against infringers — all 20% grossed-up onto the client."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex gap-1 bg-transparent p-0 mb-5 flex-wrap">
          <TabsTrigger value="register" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs"><ShieldCheck className="w-3.5 h-3.5 mr-1" /> Register Track</TabsTrigger>
          <TabsTrigger value="splits" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs"><FileText className="w-3.5 h-3.5 mr-1" /> Split Sheets</TabsTrigger>
          <TabsTrigger value="cease" className="rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs"><Gavel className="w-3.5 h-3.5 mr-1" /> Cease & Desist</TabsTrigger>
        </TabsList>

        {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : (
          <>
            <TabsContent value="register">
              <div className="flex justify-end mb-3"><Button size="sm" className="rounded-full" onClick={() => setRegOpen(true)}><Plus className="w-4 h-4" /> Register & Protect</Button></div>
              <RecordList rows={regs} cols={[["song_title","Song"],["artist_name","Artist"],["client_name","Client"],["total","Deposit", (r)=>ngn(r.total)],["status","Status",true]]} onView={(r) => showDoc(r, "certificate")} viewLabel="Certificate" onInvoice={(r) => showDoc(r, "invoice")} empty="No tracks registered yet." />
            </TabsContent>

            <TabsContent value="splits">
              <div className="flex justify-end mb-3"><Button size="sm" className="rounded-full" onClick={() => setSplitOpen(true)}><Plus className="w-4 h-4" /> File Split Sheet</Button></div>
              <RecordList rows={splits} cols={[["song_title","Song"],["studio_location","Studio"],["filed_with_mcsn","MCSN",(r)=>r.filed_with_mcsn?"Filed":"—"],["status","Status",true]]} onView={(r) => showDoc(r, "splitsheet")} viewLabel="View Sheet" empty="No split sheets filed yet." />
            </TabsContent>

            <TabsContent value="cease">
              <div className="flex justify-end mb-3"><Button size="sm" className="rounded-full" onClick={() => setCdOpen(true)}><Plus className="w-4 h-4" /> Issue Cease & Desist</Button></div>
              <RecordList rows={cases} cols={[["track_title","Track"],["infringing_party","Infringer"],["infringing_company","Company"],["status","Status",true]]} onView={(r) => showDoc(r, "ceasedesist")} viewLabel="View Notice" empty="No infringement cases yet." />
            </TabsContent>
          </>
        )}
      </Tabs>

      <RegisterTrackDialog open={regOpen} onOpenChange={setRegOpen} onCreated={(rec, t) => { setRegOpen(false); load(); showDoc(rec, t); }} />
      <SplitSheetDialog open={splitOpen} onOpenChange={setSplitOpen} onCreated={(rec, t) => { setSplitOpen(false); load(); showDoc(rec, t); }} />
      <CeaseDesistDialog open={cdOpen} onOpenChange={setCdOpen} onCreated={(rec, t) => { setCdOpen(false); load(); showDoc(rec, t); }} />
      <CopyrightDocsDialog open={doc.open} onOpenChange={(v) => setDoc((d) => ({ ...d, open: v }))} docType={doc.docType} record={doc.record} />

      <RegulatoryPortals />
    </div>
  );
}

function RecordList({ rows, cols, onView, viewLabel, onInvoice, empty }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground text-center py-10">{empty}</p>;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="rounded-2xl border border-border/60 bg-card p-3 flex flex-wrap items-center gap-2">
          {cols.map(([key, label, render]) => (
            <div key={key} className="flex-1 min-w-[110px]">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="text-sm font-medium">{typeof render === "function" ? render(r) : render === true ? <span className="px-2 py-0.5 rounded-full bg-secondary text-xs">{r[key]}</span> : r[key] || "—"}</p>
            </div>
          ))}
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => onView(r)}>{viewLabel}</Button>
            {onInvoice && <Button size="sm" variant="ghost" className="rounded-full" onClick={() => onInvoice(r)}>Invoice</Button>}
          </div>
        </div>
      ))}
    </div>
  );
}