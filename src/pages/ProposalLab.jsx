import React from "react";
import PageHeader from "@/components/shared/PageHeader";
import { COMPANIES, COUNTRIES } from "@/lib/companyDirectory";
import CompanyCard from "@/components/proposals/CompanyCard";
import ProposalModal from "@/components/proposals/ProposalModal";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 60;
const STATUS_KEY = "ridex_proposal_status";
const SENDER_KEY = "ridex_proposal_sender";

export default function ProposalLab() {
  const [search, setSearch] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [active, setActive] = React.useState(null);
  const [statusMap, setStatusMap] = React.useState(() => { try { return JSON.parse(localStorage.getItem(STATUS_KEY) || "{}"); } catch { return {}; } });
  const [sender, setSender] = React.useState(() => { try { return JSON.parse(localStorage.getItem(SENDER_KEY) || "{}"); } catch { return {}; } });

  const saveStatus = (name, st) => {
    const next = { ...statusMap, [name]: st };
    setStatusMap(next);
    try { localStorage.setItem(STATUS_KEY, JSON.stringify(next)); } catch {}
  };
  const saveSender = (patch) => {
    const next = { ...sender, ...patch };
    setSender(next);
    try { localStorage.setItem(SENDER_KEY, JSON.stringify(next)); } catch {}
  };

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase();
    return COMPANIES.filter((c) =>
      (!q || c.name.toLowerCase().includes(q) || c.sector.toLowerCase().includes(q)) &&
      (!country || c.country === country)
    );
  }, [search, country]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  React.useEffect(() => { setPage(0); }, [search, country]);

  return (
    <div>
      <PageHeader
        eyebrow="RIDE X Partnerships"
        title="Proposal Lab"
        subtitle="Tailored partnership proposals auto-generated per company by sector. Zero credits — everything runs on-device. Open each company's official contact page to send."
        action={<span className="text-xs text-muted-foreground bg-secondary px-3 py-1.5 rounded-full">{COMPANIES.length} companies · 60/page</span>}
      />

      <div className="grid sm:grid-cols-3 gap-2 mb-4">
        <input value={sender.name || ""} onChange={(e) => saveSender({ name: e.target.value })} placeholder="Your name" className="bg-secondary text-sm rounded-lg px-3 py-2 border border-border/60" />
        <input value={sender.email || ""} onChange={(e) => saveSender({ email: e.target.value })} placeholder="Your email" className="bg-secondary text-sm rounded-lg px-3 py-2 border border-border/60" />
        <input value={sender.phone || ""} onChange={(e) => saveSender({ phone: e.target.value })} placeholder="Your phone" className="bg-secondary text-sm rounded-lg px-3 py-2 border border-border/60" />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company or sector…" className="w-full pl-9 pr-3 py-2 rounded-xl bg-secondary text-sm border border-border focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className="bg-secondary text-sm rounded-xl px-3 py-2 border border-border/60">
          <option value="">All countries</option>
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <p className="text-xs text-muted-foreground mb-3">{filtered.length} matches · page {safePage + 1} of {totalPages}</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {pageItems.map((c) => (
          <CompanyCard
            key={c.name}
            company={c}
            status={statusMap[c.name]}
            onOpen={() => { if (!statusMap[c.name]) saveStatus(c.name, "ready"); setActive(c); }}
          />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-secondary text-sm disabled:opacity-40"><ChevronLeft className="w-4 h-4" /> Prev</button>
          <span className="text-xs text-muted-foreground">{safePage + 1} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-secondary text-sm disabled:opacity-40">Next <ChevronRight className="w-4 h-4" /></button>
        </div>
      )}

      {active && (
        <ProposalModal
          company={active}
          sender={sender}
          status={statusMap[active.name]}
          onStatus={(st) => saveStatus(active.name, st)}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}