import React from "react";
import { Mic2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { money } from "@/lib/pricing";
import { useToast } from "@/components/ui/use-toast";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import { base44 } from "@/api/base44Client";

function slotPriceFor(event) {
  const vip = Number(event.ticket_vip_price || 0);
  const artists = (event.artist_lineup || "").split(",").map((a) => a.trim()).filter(Boolean);
  const isFestival = event.event_type === "festival" || (artists.length >= 5 && vip >= 200000) || vip >= 400000;
  return isFestival ? 5000000
    : vip >= 250000 ? 3000000
    : vip >= 150000 ? 2000000
    : vip >= 80000 ? 1000000
    : 500000;
}

export default function BookPerformanceSlot({ event, user }) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pay, setPay] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [artistName, setArtistName] = React.useState(user?.full_name || "");
  const [setTime, setSetTime] = React.useState("");
  const [duration, setDuration] = React.useState(45);
  const [stage, setStage] = React.useState("Open Mic Stage");

  const price = slotPriceFor(event);

  const submit = async () => {
    if (!artistName.trim()) { toast({ title: "Enter your stage name", variant: "destructive" }); return; }
    if (!setTime) { toast({ title: "Pick your set time", variant: "destructive" }); return; }
    setBusy(true);
    setPay(true);
  };

  const onPaid = async () => {
    try {
      const slot = await base44.entities.PerformanceSlot.create({
        event_id: event.id,
        event_title: event.title,
        artist_name: artistName.trim(),
        set_time: setTime,
        duration_minutes: Number(duration) || 45,
        stage: stage || "Open Mic Stage",
        slot_price: price,
        slot_order: 99,
        status: "confirmed",
      });
      toast({ title: "You're on the lineup!", description: `Performing at ${event.title} — ${stage} — auto-confirmed` });
      setOpen(false);
      setPay(false);
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <>
      <div className="rounded-2xl bg-gradient-to-br from-primary/15 via-accent/10 to-card border border-primary/30 p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center shrink-0">
            <Mic2 className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">Are you an upcoming artist?</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Book a performance slot at this event and get on the lineup.</p>
          </div>
          <Button size="sm" className="rounded-full" onClick={() => setOpen(true)}>Perform here</Button>
        </div>
      </div>

      <Dialog open={open && !pay} onOpenChange={(o) => setOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Perform at {event.title}</DialogTitle>
            <DialogDescription>Secure your set slot — payment confirms your spot on the lineup.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs">Stage / Artist name</Label>
              <Input value={artistName} onChange={(e) => setArtistName(e.target.value)} placeholder="Your stage name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Set time</Label>
                <Input type="datetime-local" value={setTime} onChange={(e) => setSetTime(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Duration (min)</Label>
                <Input type="number" min={15} max={90} value={duration} onChange={(e) => setDuration(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Stage</Label>
              <Input value={stage} onChange={(e) => setStage(e.target.value)} placeholder="e.g. Open Mic Stage" />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-secondary border border-border px-3 py-2">
              <span className="text-xs text-muted-foreground">Slot fee</span>
              <span className="font-extrabold text-primary">{money(price)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="rounded-full" onClick={submit} disabled={busy}>Continue to payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CheckoutDialog
        open={pay}
        onOpenChange={(o) => { if (!o) { setPay(false); setOpen(false); } }}
        amount={price}
        service="booking"
        description={`Performance slot · ${artistName} · ${event.title}`}
        commission={Math.round(price * 0.2)}
        onPaid={onPaid}
        allowCash={false}
      />
    </>
  );
}