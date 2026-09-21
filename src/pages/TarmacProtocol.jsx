import React from "react";
import { base44 } from "@/api/base44Client";
import { AGENCY } from "@/lib/agency";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plane, Printer } from "lucide-react";

const empty = { artist_stage_name: "", artist_legal_name: "", entourage_size: 18, arrival_date: "", arrival_time: "", carrier_flight: "", routing: "London Heathrow (LHR) -> MMIA Lagos (LOS), Terminal 2", v1: "", v2: "", v3: "", lounge: "FAAN Presidential VIP Lounge", bag_count: 0 };

export default function TarmacProtocol() {
  const { toast } = useToast();
  const [form, setForm] = React.useState(empty);
  const [saving, setSaving] = React.useState(false);
  const [rows, setRows] = React.useState([]);

  const load = () => base44.entities.TarmacRequest.list("-created_date", 20).then(setRows).catch(() => []);
  React.useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.artist_stage_name.trim()) { toast({ title: "Enter the principal artist", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const [v1t, v1p, v1d] = form.v1.split("|");
      const [v2t, v2p, v2d] = form.v2.split("|");
      const [v3t, v3p, v3d] = form.v3.split("|");
      await base44.entities.TarmacRequest.create({
        artist_stage_name: form.artist_stage_name,
        artist_legal_name: form.artist_legal_name,
        entourage_size: Number(form.entourage_size) || 0,
        arrival_date: form.arrival_date,
        arrival_time: form.arrival_time,
        carrier_flight: form.carrier_flight,
        routing: form.routing,
        vehicle1_type: (v1t || "").trim(), vehicle1_plate: (v1p || "").trim(), vehicle1_driver: (v1d || "").trim(),
        vehicle2_type: (v2t || "").trim(), vehicle2_plate: (v2p || "").trim(), vehicle2_driver: (v2d || "").trim(),
        vehicle3_type: (v3t || "").trim(), vehicle3_plate: (v3p || "").trim(), vehicle3_driver: (v3d || "").trim(),
        lounge: form.lounge,
        bag_count: Number(form.bag_count) || 0,
        status: "submitted",
      });
      toast({ title: "Tarmac request filed", description: "Submit to FAAN Executive Protocol Unit 14 days pre-arrival." });
      setForm(empty);
      load();
    } finally { setSaving(false); }
  };

  const print = (r) => {
    const w = window.open("", "_blank");
    const legs = JSON.parse(r.legs || "[]");
    w.document.write(`<pre style="font:12px/1.5 monospace;white-space:pre-wrap;padding:24px">FAAN EXECUTIVE RUNWAY CONVOY & SPEED CLEARANCE\nTo: Director of Executive Protocol, FAAN, MMIA Lagos\n\nPrincipal: ${r.artist_stage_name} (${r.artist_legal_name})\nEntourage: ${r.entourage_size} pax\nArrival: ${r.arrival_date} ${r.arrival_time}\nFlight: ${r.carrier_flight}\nRouting: ${r.routing}\n\nV1: ${r.vehicle1_type} | ${r.vehicle1_plate} | ${r.vehicle1_driver}\nV2: ${r.vehicle2_type} | ${r.vehicle2_plate} | ${r.vehicle2_driver}\nV3: ${r.vehicle3_type} | ${r.vehicle3_plate} | ${r.vehicle3_driver}\n\nLounge: ${r.lounge}\nBags: ${r.bag_count}\n\nAuthorised sign-off: ${AGENCY.name} · ${AGENCY.phone}</pre>`);
    w.document.close(); w.print();
  };

  return (
    <div>
      <PageHeader eyebrow="VVIP Logistics" title="FAAN Tarmac Protocol & Clearance" subtitle="File the airside convoy & customs clearing request for international headliners — submit to FAAN 14 business days pre-arrival." />
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3">
          <p className="text-sm font-semibold flex items-center gap-2"><Plane className="w-4 h-4 text-primary" /> Delegation flight telemetry</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Artist stage name</Label><Input className="rounded-xl mt-1" value={form.artist_stage_name} onChange={(e) => set("artist_stage_name", e.target.value)} /></div>
            <div><Label className="text-xs">Legal passport name</Label><Input className="rounded-xl mt-1" value={form.artist_legal_name} onChange={(e) => set("artist_legal_name", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-xs">Entourage</Label><Input type="number" className="rounded-xl mt-1" value={form.entourage_size} onChange={(e) => set("entourage_size", e.target.value)} /></div>
            <div><Label className="text-xs">Arrival date</Label><Input type="date" className="rounded-xl mt-1" value={form.arrival_date} onChange={(e) => set("arrival_date", e.target.value)} /></div>
            <div><Label className="text-xs">ETA</Label><Input type="time" className="rounded-xl mt-1" value={form.arrival_time} onChange={(e) => set("arrival_time", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Carrier / flight</Label><Input className="rounded-xl mt-1" value={form.carrier_flight} onChange={(e) => set("carrier_flight", e.target.value)} placeholder="BA075 or tail N°" /></div>
            <div><Label className="text-xs">Routing</Label><Input className="rounded-xl mt-1" value={form.routing} onChange={(e) => set("routing", e.target.value)} /></div>
          </div>
          <p className="text-xs font-medium text-muted-foreground pt-1">Airside vehicles — type|plate|driver</p>
          <div><Label className="text-xs">Vehicle 1 (armoured SUV)</Label><Input className="rounded-xl mt-1" value={form.v1} onChange={(e) => set("v1", e.target.value)} placeholder="Lexus LX570 | ABC123XY | Driver" /></div>
          <div><Label className="text-xs">Vehicle 2 (armoured SUV)</Label><Input className="rounded-xl mt-1" value={form.v2} onChange={(e) => set("v2", e.target.value)} placeholder="Toyota Land Cruiser | DEF456XY | Driver" /></div>
          <div><Label className="text-xs">Vehicle 3 (luggage sprinter)</Label><Input className="rounded-xl mt-1" value={form.v3} onChange={(e) => set("v3", e.target.value)} placeholder="Mercedes Sprinter | GHI789XY | Driver" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Lounge</Label><Input className="rounded-xl mt-1" value={form.lounge} onChange={(e) => set("lounge", e.target.value)} /></div>
            <div><Label className="text-xs">Bag count</Label><Input type="number" className="rounded-xl mt-1" value={form.bag_count} onChange={(e) => set("bag_count", e.target.value)} /></div>
          </div>
          <Button className="w-full rounded-full" disabled={saving} onClick={submit}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "File tarmac request"}</Button>
          <p className="text-[11px] text-muted-foreground text-center">Routed by {AGENCY.name} · {AGENCY.phone}</p>
        </div>

        <div className="space-y-3">
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-muted-foreground text-sm"><Plane className="w-8 h-8 mx-auto mb-2 opacity-50" /> No tarmac requests filed yet.</div>
          ) : rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{r.artist_stage_name}</p>
                  <p className="text-xs text-muted-foreground">{r.arrival_date} {r.arrival_time} · {r.carrier_flight} · {r.entourage_size} pax</p>
                </div>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => print(r)}><Printer className="w-3.5 h-3.5" /> Print</Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}