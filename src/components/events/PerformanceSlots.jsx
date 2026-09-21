import React from "react";
import { base44 } from "@/api/base44Client";
import { Clock, Loader2, Mic2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/pricing";
import { useToast } from "@/components/ui/use-toast";
import CheckoutDialog from "@/components/shared/CheckoutDialog";

export default function PerformanceSlots({ event, user }) {
  const { toast } = useToast();
  const [slots, setSlots] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [booking, setBooking] = React.useState(null); // slot being booked
  const [busy, setBusy] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState({}); // slot_id -> confirmed

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await base44.entities.PerformanceSlot.filter({ event_id: event.id }, "slot_order", 50);
        if (alive) setSlots(rows);
      } catch (e) { /* ignore */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [event.id]);

  const onPaid = async (tx) => {
    if (!booking) return;
    setBusy(true);
    try {
      await base44.entities.PerformanceSlot.update(booking.id, {
        status: "confirmed",
      });
      setConfirmed((m) => ({ ...m, [booking.id]: true }));
      setSlots((rows) => rows.map((s) => (s.id === booking.id ? { ...s, status: "confirmed" } : s)));
      toast({ title: "Slot secured", description: `${booking.artist_name} confirmed for ${event.title}` });
    } catch (e) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
      setBooking(null);
    }
  };

  if (loading) return (
    <div className="rounded-2xl bg-card border border-border p-4 flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading performance schedule…
    </div>
  );

  if (!slots.length) return null;

  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <h3 className="font-semibold mb-3 flex items-center gap-2"><Mic2 className="w-4 h-4 text-primary" /> Performance schedule</h3>
      <p className="text-xs text-muted-foreground mb-3">Promoters can secure an artist's set slot directly — payment is handled securely by Ride X.</p>
      <div className="space-y-2">
        {slots.map((s) => {
          const set = s.set_time ? new Date(s.set_time) : null;
          const isConfirmed = s.status === "confirmed" || confirmed[s.id];
          return (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-2xl bg-secondary border border-border">
              <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                {s.slot_order || 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{s.artist_name}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {set ? set.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "TBD"} · {s.duration_minutes || 45} min · {s.stage || "Main Stage"}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-extrabold text-primary text-sm">{money(s.slot_price || 500000)}</p>
                {isConfirmed ? (
                  <span className="text-[11px] text-emerald-400 flex items-center gap-1 justify-end"><ShieldCheck className="w-3 h-3" /> Secured</span>
                ) : (
                  <Button
                    size="sm"
                    className="rounded-full h-7 mt-1 text-xs px-3"
                    disabled={!user || busy}
                    onClick={() => setBooking(s)}
                  >
                    Secure slot
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <CheckoutDialog
        open={!!booking}
        onOpenChange={(o) => { if (!o) setBooking(null); }}
        amount={booking?.slot_price || 0}
        service="booking"
        description={`Performance slot · ${booking?.artist_name || ""} · ${event.title}`}
        referenceId={booking?.id || ""}
        commission={Math.round((booking?.slot_price || 0) * 0.2)}
        onPaid={onPaid}
        allowCash={false}
      />
    </div>
  );
}