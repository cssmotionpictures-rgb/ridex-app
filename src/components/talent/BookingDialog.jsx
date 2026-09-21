import React from "react";
import { money } from "@/lib/pricing";
import { splitTalentPrice, talentPriceFor } from "@/lib/talentPricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { XCircle, FileText, CheckCircle2 } from "lucide-react";

const EVENT_TYPES = [
  { key: "concert", label: "Concert / Live show" },
  { key: "wedding", label: "Wedding" },
  { key: "corporate", label: "Corporate event" },
  { key: "birthday", label: "Birthday party" },
  { key: "film", label: "Film / Video shoot" },
  { key: "appearance", label: "Guest appearance" },
  { key: "club", label: "Club / Party" },
  { key: "other", label: "Other" },
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const RIDERS = [
  { key: "flights", label: "Flights", desc: "I will fund the exact flight allocations" },
  { key: "hotel", label: "5-star hotel", desc: "I will book & pay the hotel block + per diems" },
  { key: "security", label: "VVIP security", desc: "I will provide armed convoys & MOPOL" },
  { key: "technical", label: "Technical production", desc: "I will rent the sound/stage/lighting spec" },
];

export default function BookingDialog({ open, artist, onClose, onConfirm }) {
  const [eventType, setEventType] = React.useState("concert");
  const [promoterCompany, setPromoterCompany] = React.useState("");
  const [venue, setVenue] = React.useState("");
  const [attendance, setAttendance] = React.useState("");
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [duration, setDuration] = React.useState(1);
  const [details, setDetails] = React.useState("");
  const [riders, setRiders] = React.useState({ flights: false, hotel: false, security: false, technical: false });
  const [err, setErr] = React.useState("");

  if (!open || !artist) return null;
  const avail = (artist.availability_days || "0,1,2,3,4,5,6").split(",").map(Number);
  const weekdayOk = date ? avail.includes(new Date(date + "T00:00:00").getDay()) : true;
  const price = talentPriceFor(artist);
  const { artist: artistEarn, platform } = splitTalentPrice(price);
  const allRiders = RIDERS.every((r) => riders[r.key]);

  const toggleRider = (k) => setRiders((p) => ({ ...p, [k]: !p[k] }));

  const submit = () => {
    if (!promoterCompany.trim()) { setErr("Enter the event owner / promoter company"); return; }
    if (!venue.trim()) { setErr("Enter the venue & city"); return; }
    if (!date) { setErr("Pick a date"); return; }
    if (!weekdayOk) { setErr(`Available only on: ${avail.map((d) => DAY_NAMES[d]).join(", ")}`); return; }
    if (!time) { setErr("Pick a time"); return; }
    if (!allRiders) { setErr("You must commit to funding all four logistics riders to proceed"); return; }
    const fullDetails = [
      `Venue: ${venue}`,
      attendance ? `Expected attendance: ${attendance}` : null,
      details ? `Brief: ${details}` : null,
    ].filter(Boolean).join("\n");
    onConfirm({
      event_type: eventType,
      event_date: date,
      event_time: time,
      duration_hours: Number(duration) || 1,
      project_details: fullDetails,
      promoter_company: promoterCompany.trim(),
      rider_committed: true,
    });
  };

  return (
    <div className="fixed inset-0 z-[600] bg-black/80 flex items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-md bg-card rounded-2xl p-5 space-y-3 my-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Book {artist.stage_name || artist.full_name}</p>
            <p className="text-[11px] text-primary flex items-center gap-1 mt-0.5"><FileText className="w-3 h-3" /> Booking Offer Sheet (LOI)</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><XCircle className="w-5 h-5" /></button>
        </div>
        <div className="rounded-xl bg-secondary p-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Performance fee (escrow-held)</span>
          <span className="font-bold">{money(price)}</span>
        </div>

        <div>
          <Label className="text-xs">Event owner / promoter company</Label>
          <Input className="rounded-xl mt-1" value={promoterCompany} onChange={(e) => { setPromoterCompany(e.target.value); setErr(""); }} placeholder="e.g. Flytime Promotions Ltd" />
        </div>

        <div>
          <Label className="text-xs">Event type</Label>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>{EVENT_TYPES.map((e) => <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Venue & city</Label>
          <Input className="rounded-xl mt-1" value={venue} onChange={(e) => { setVenue(e.target.value); setErr(""); }} placeholder="e.g. Eko Hotel, Victoria Island, Lagos" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Expected attendance</Label>
            <Input className="rounded-xl mt-1" value={attendance} onChange={(e) => setAttendance(e.target.value)} placeholder="e.g. 5,000" />
          </div>
          <div>
            <Label className="text-xs">Duration (hrs)</Label>
            <Input type="number" min="1" className="rounded-xl mt-1" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" className="rounded-xl mt-1" value={date} onChange={(e) => { setDate(e.target.value); setErr(""); }} />
          </div>
          <div>
            <Label className="text-xs">Time</Label>
            <Input type="time" className="rounded-xl mt-1" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>

        <div>
          <Label className="text-xs">Additional brief</Label>
          <Textarea className="rounded-xl mt-1" rows={2} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Special requests, set length, brand integration…" />
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide">Logistics rider commitment</p>
          <p className="text-[11px] text-muted-foreground">All logistics are 100% paid by the event owner. Tick each to confirm you will fund it — breach voids the contract & forfeits the deposit.</p>
          {RIDERS.map((r) => (
            <button key={r.key} type="button" onClick={() => toggleRider(r.key)} className="w-full flex items-start gap-2 text-left">
              <span className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${riders[r.key] ? "bg-primary border-primary text-primary-foreground" : "border-border"}`}>
                {riders[r.key] && <CheckCircle2 className="w-3 h-3" />}
              </span>
              <span>
                <span className="block text-xs font-medium">{r.label}</span>
                <span className="block text-[11px] text-muted-foreground">{r.desc}</span>
              </span>
            </button>
          ))}
        </div>

        {artist.availability_days && artist.availability_days !== "0,1,2,3,4,5,6" && (
          <p className="text-xs text-muted-foreground">Available: {avail.map((d) => DAY_NAMES[d]).join(", ")}</p>
        )}
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="text-xs text-muted-foreground flex justify-between">
          <span>Artist (Net) · {money(artistEarn)}</span>
          <span>Agency 20% gross-up · {money(platform)}</span>
        </div>
        <Button className="w-full rounded-full" onClick={submit}>Submit Offer &amp; Pay {money(price)}</Button>
        <p className="text-[11px] text-muted-foreground text-center">50% non-refundable deposit secures the date · balance 7 days pre-event</p>
      </div>
    </div>
  );
}