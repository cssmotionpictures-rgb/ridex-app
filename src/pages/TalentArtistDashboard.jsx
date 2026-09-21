import React from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import MastersZipPanel from "@/components/studio/MastersZipPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, CheckCircle2, Clock, RotateCw, Ban, Star, ShieldCheck } from "lucide-react";
import { money } from "@/lib/pricing";
import { TALENT } from "@/lib/talentPricing";

export default function TalentArtistDashboard() {
  const { toast } = useToast();
  const [user, setUser] = React.useState(null);
  const [profile, setProfile] = React.useState(null);
  const [bookings, setBookings] = React.useState([]);
  const [earnings, setEarnings] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({ stage_name: "", talent_type: "musician", tier: "emerging", location: "", country: "Nigeria", bio: "" });

  React.useEffect(() => {
    base44.auth.me().then((u) => {
      setUser(u);
      if (u) {
        base44.entities.TalentArtist.filter({ user_id: u.id }).then((list) => {
          if (list[0]) {
            setProfile(list[0]);
            Promise.all([
              base44.entities.TalentBooking.filter({ artist_id: list[0].id }, "-event_date", 100),
              base44.entities.TalentEarning.filter({ artist_id: list[0].id }, "-created_date", 100),
            ]).then(([bk, er]) => {
              // 24-hour auto-confirm sweep: pending bookings older than 24h are auto-confirmed.
              const stale = bk.filter((x) => x.status === "pending" && (Date.now() - new Date(x.created_date).getTime()) > 24 * 60 * 60 * 1000);
              stale.forEach((s) => base44.entities.TalentBooking.update(s.id, { status: "confirmed" }).catch(() => {}));
              setBookings(stale.length ? bk.map((x) => (stale.find((s) => s.id === x.id) ? { ...x, status: "confirmed" } : x)) : bk);
              setEarnings(er);
            }).finally(() => setLoading(false));
          } else setLoading(false);
        }).catch(() => setLoading(false));
      } else setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const tierOptions = TALENT[form.talent_type] || [];

  const createProfile = async () => {
    if (!form.stage_name) { toast({ title: "Stage name required", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const tierInfo = tierOptions.find((t) => t.tier === form.tier) || tierOptions[tierOptions.length - 1];
      const p = await base44.entities.TalentArtist.create({
        user_id: user.id, full_name: user.full_name || "", stage_name: form.stage_name,
        talent_type: form.talent_type, tier: tierInfo.tier, tier_label: tierInfo.label,
        booking_price: tierInfo.price, location: form.location, country: form.country, bio: form.bio,
        auto_accept_enabled: true, status: "active",
      });
      setProfile(p); setCreating(false);
      toast({ title: "Artist profile created", description: `Booking fee set to ${money(tierInfo.price)}` });
    } catch (e) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const confirmBooking = async (b) => {
    setBusy(true);
    try {
      await base44.entities.TalentBooking.update(b.id, { status: "confirmed" });
      setBookings((prev) => prev.map((x) => x.id === b.id ? { ...x, status: "confirmed" } : x));
      toast({ title: "Booking confirmed" });
    } catch (e) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  // Reschedule = propose a new date. No penalty (artists may only reschedule, not reject).
  const rescheduleBooking = async (b) => {
    const nd = window.prompt("Propose a new date (YYYY-MM-DD):", b.event_date);
    if (!nd) return;
    setBusy(true);
    try {
      await base44.entities.TalentBooking.update(b.id, { event_date: nd });
      setBookings((prev) => prev.map((x) => x.id === b.id ? { ...x, event_date: nd } : x));
      await base44.entities.TalentArtist.update(profile.id, { reschedule_count: (profile.reschedule_count || 0) + 1 });
      setProfile((p) => ({ ...p, reschedule_count: (p.reschedule_count || 0) + 1 }));
      toast({ title: "Rescheduled", description: "Client notified. No penalty applied." });
    } catch (e) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  // Decline = reputation penalty + auto-reassign to a same-tier replacement (or refund if none).
  const declineBooking = async (b) => {
    if (!window.confirm("Declining applies a reputation penalty and auto-reassigns the client to a replacement artist. Continue?")) return;
    setBusy(true);
    try {
      const res = await base44.functions.invoke("reassign-talent-booking", { booking_id: b.id });
      if (res?.data?.replaced) {
        toast({ title: "Replacement found", description: `Reassigned to ${res.data.replacement_artist}. Reputation penalty applied.` });
      } else {
        toast({ title: "No replacement available", description: "Booking cancelled, client refunded. Penalty applied.", variant: "destructive" });
      }
      const [bk, er] = await Promise.all([
        base44.entities.TalentBooking.filter({ artist_id: profile.id }, "-event_date", 100),
        base44.entities.TalentEarning.filter({ artist_id: profile.id }, "-created_date", 100),
      ]);
      setBookings(bk); setEarnings(er);
      setProfile(await base44.entities.TalentArtist.get(profile.id));
    } catch (e) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const toggleAutoAccept = async () => {
    setBusy(true);
    try {
      await base44.entities.TalentArtist.update(profile.id, { auto_accept_enabled: !profile.auto_accept_enabled });
      setProfile({ ...profile, auto_accept_enabled: !profile.auto_accept_enabled });
    } catch (e) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const pendingPay = earnings.filter((e) => e.status === "pending").reduce((t, e) => t + e.amount, 0);
  const paidOut = earnings.filter((e) => e.status === "paid").reduce((t, e) => t + e.amount, 0);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  if (!profile && !creating) {
    return (
      <div>
        <MastersZipPanel />
        <PageHeader eyebrow="Artist Dashboard" title="Create your talent profile" subtitle="List yourself for direct bookings. Your tier sets your fee — clients pay upfront and the booking auto-submits to you." />
        <Button className="rounded-full" onClick={() => setCreating(true)}>Create artist profile</Button>
      </div>
    );
  }

  if (creating) {
    return (
      <div>
      <MastersZipPanel />
      <div className="max-w-lg">
        <PageHeader eyebrow="New Artist Profile" title="Set up your booking" />
        <div className="space-y-3">
          <div><Label className="text-xs">Stage name</Label><Input className="rounded-xl mt-1" value={form.stage_name} onChange={(e) => setForm({ ...form, stage_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Talent type</Label>
              <Select value={form.talent_type} onValueChange={(v) => setForm({ ...form, talent_type: v, tier: TALENT[v][TALENT[v].length - 1].tier })}>
                <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(TALENT).map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tier</Label>
              <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v })}>
                <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{tierOptions.map((t) => <SelectItem key={t.tier} value={t.tier}>{t.label} · {money(t.price)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Location</Label><Input className="rounded-xl mt-1" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Lagos" /></div>
            <div><Label className="text-xs">Country</Label><Input className="rounded-xl mt-1" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
          </div>
          <div><Label className="text-xs">Bio</Label><Textarea className="rounded-xl mt-1" rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></div>
          <Button className="w-full rounded-full" disabled={busy} onClick={createProfile}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create profile"}</Button>
        </div>
      </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Artist Dashboard"
        title={profile.stage_name}
        subtitle={`${profile.talent_type} · ${profile.tier_label || profile.tier}`}
        action={<div className="flex items-center gap-2">{profile.premium_placement && <span className="inline-flex items-center gap-1 text-xs rounded-full bg-primary/15 text-primary px-3 py-1"><ShieldCheck className="w-3 h-3" /> Premium</span>}<Button variant="outline" className="rounded-full" onClick={toggleAutoAccept} disabled={busy}>{profile.auto_accept_enabled ? "Auto-accept: ON" : "Auto-accept: OFF"}</Button></div>}
      />
      <MastersZipPanel />
      <div className="grid sm:grid-cols-4 gap-3 mb-6">
        <div className="rounded-2xl border border-border/60 bg-card p-4"><p className="text-xs text-muted-foreground">Pending payout</p><p className="text-xl font-bold text-amber-400">{money(pendingPay)}</p></div>
        <div className="rounded-2xl border border-border/60 bg-card p-4"><p className="text-xs text-muted-foreground">Paid out</p><p className="text-xl font-bold text-emerald-400">{money(paidOut)}</p></div>
        <div className="rounded-2xl border border-border/60 bg-card p-4"><p className="text-xs text-muted-foreground">Total bookings</p><p className="text-xl font-bold">{profile.total_bookings || 0}</p></div>
        <div className="rounded-2xl border border-border/60 bg-card p-4"><p className="text-xs text-muted-foreground flex items-center gap-1"><Star className="w-3 h-3" /> Acceptance rate</p><p className="text-xl font-bold">{Math.round(profile.acceptance_rate ?? 100)}%</p></div>
      </div>
      <p className="text-xs uppercase text-muted-foreground mb-2">Incoming bookings</p>
      {bookings.length === 0 ? (
        <p className="text-muted-foreground">No bookings yet. <Link to="/talent" className="text-primary underline">View your public profile</Link></p>
      ) : (
        <div className="space-y-2">
          {bookings.map((b) => (
            <div key={b.id} className="rounded-xl border border-border/60 bg-card p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{b.client_name || "Client"} · {b.event_type}</p>
                <p className="text-xs text-muted-foreground">{b.event_date}{b.event_time ? " " + b.event_time : ""} · {b.duration_hours}h · {money(b.price)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs capitalize flex items-center gap-1">
                  {b.status === "confirmed" || b.status === "completed" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Clock className="w-4 h-4 text-amber-400" />}
                  {b.status}
                </span>
                {b.status === "pending" && (
                  <div className="flex gap-1">
                    <Button size="sm" className="rounded-full" disabled={busy} onClick={() => confirmBooking(b)}>Confirm</Button>
                    <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => rescheduleBooking(b)} title="Propose a new date — no penalty"><RotateCw className="w-3 h-3" /></Button>
                    <Button size="sm" variant="outline" className="rounded-full text-destructive border-destructive/40" disabled={busy} onClick={() => declineBooking(b)} title="Decline — penalty + auto-replacement"><Ban className="w-3 h-3" /></Button>
                  </div>
                )}
                {b.status === "confirmed" && (
                  <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={() => rescheduleBooking(b)} title="Reschedule — no penalty, no rejection">Reschedule</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}