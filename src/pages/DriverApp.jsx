import React from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import ServiceMap from "@/components/shared/ServiceMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/pricing";
import { Power, Phone, Send, Check, X, Bell, MapPin, Wallet, Star, Ban, MessageCircle, ShieldAlert } from "lucide-react";
import DriverSosButton from "@/components/driver/DriverSosButton";

const CANCEL_REASONS = [
  "Passenger didn't show up",
  "Couldn't reach the pickup location",
  "Passenger asked to cancel",
  "Traffic / route blocked",
  "Vehicle broke down",
  "Unsafe situation",
  "Changed my mind",
];

export default function DriverApp() {
  const nav = useNavigate();
  const [me, setMe] = React.useState(null);
  const [driver, setDriver] = React.useState(null);
  const [rides, setRides] = React.useState([]);
  const [reviews, setReviews] = React.useState([]);
  const [activeRide, setActiveRide] = React.useState(null);
  const [messages, setMessages] = React.useState([]);
  const [draft, setDraft] = React.useState("");
  const [knownIncoming, setKnownIncoming] = React.useState([]);
  const [unread, setUnread] = React.useState({});
  const [cancelTarget, setCancelTarget] = React.useState(null);
  const [cancelReason, setCancelReason] = React.useState("");
  const [cancelNote, setCancelNote] = React.useState("");
  const [cancelBusy, setCancelBusy] = React.useState(false);
  const [pinInput, setPinInput] = React.useState({});
  const beepRef = React.useRef(null);
  const lastPosRef = React.useRef(null);
  const ridesRef = React.useRef(rides); ridesRef.current = rides;
  const activeRideRef = React.useRef(activeRide); activeRideRef.current = activeRide;

  const ping = React.useCallback(() => {
    try {
      const ctx = beepRef.current || (beepRef.current = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; o.type = "sine";
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      o.start(); o.stop(ctx.currentTime + 0.6);
    } catch {}
  }, []);

  React.useEffect(() => {
    base44.auth.me().then(async (u) => {
      setMe(u);
      const list = await base44.entities.Driver.filter({ created_by_id: u.id }).catch(() => []);
      if (!list.length) { nav("/driver-signup"); return; }
      setDriver(list[0]);
      const mine = await base44.entities.Ride.filter({ driver_id: list[0].id }, "-created_date", 100).catch(() => []);
      setRides(mine);
      const revs = await base44.entities.DriverReview.filter({ driver_id: list[0].id }, "-created_date", 20).catch(() => []);
      setReviews(revs);
    }).catch(() => nav("/login?next=/driver-app"));
  }, []);

  // Live-reflect admin approval: unlock the driver app the moment is_approved flips to true.
  React.useEffect(() => {
    if (!driver) return;
    const u = base44.entities.Driver.subscribe((ev) => {
      if ((ev.type === "update" || ev.type === "create") && ev.data?.id === driver.id) {
        setDriver(ev.data);
      }
    });
    return () => u && u();
  }, [driver?.id]);

  React.useEffect(() => {
    const u = base44.entities.Ride.subscribe((ev) => {
      if (!driver) return;
      if (ev.type === "create" || ev.type === "update") {
        const r = ev.data;
        if (r.driver_id !== driver.id) return;
        setRides((prev) => {
          const exists = prev.find((x) => x.id === r.id);
          const next = exists ? prev.map((x) => (x.id === r.id ? r : x)) : [r, ...prev];
          return next;
        });
        if (r.status === "driver_assigned" && !knownIncoming.includes(r.id)) {
          setKnownIncoming((k) => [...k, r.id]);
          ping();
        }
      }
    });
    return () => u && u();
  }, [driver, knownIncoming, ping]);

  React.useEffect(() => {
    if (!activeRide) return;
    const load = async () => {
      const m = await base44.entities.ChatMessage.filter({ ride_id: activeRide.id }, "created_date", 200).catch(() => []);
      setMessages(m);
    };
    load();
    const u = base44.entities.ChatMessage.subscribe((ev) => {
      if (ev.data?.ride_id === activeRide.id) setMessages((prev) => [...prev, ev.data]);
    });
    return () => u && u();
  }, [activeRide]);

  // Real-time passenger messages: count unread + beep for any of this driver's rides.
  React.useEffect(() => {
    if (!driver) return;
    const u = base44.entities.ChatMessage.subscribe((ev) => {
      if (ev.type !== "create") return;
      const m = ev.data;
      if (!m || m.sender !== "customer") return;
      if (!ridesRef.current.some((r) => r.id === m.ride_id)) return;
      if (activeRideRef.current?.id === m.ride_id) return;
      setUnread((p) => ({ ...p, [m.ride_id]: (p[m.ride_id] || 0) + 1 }));
      ping();
    });
    return () => u && u();
  }, [driver, ping]);

  // Live GPS: only pushes a new position when the driver actually moves (≥~20m), throttled to 8s.
  React.useEffect(() => {
    if (!driver || !driver.is_online) return;
    if (!navigator.geolocation?.watchPosition) return;
    let lastTs = 0;
    const watch = navigator.geolocation.watchPosition((pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      const last = lastPosRef.current;
      const moved = !last || Math.abs(lat - last[0]) > 0.0002 || Math.abs(lng - last[1]) > 0.0002;
      const now = Date.now();
      if (!moved || now - lastTs < 8000) return;
      lastTs = now;
      lastPosRef.current = [lat, lng];
      base44.entities.Driver.update(driver.id, { lat, lng }).then(setDriver).catch(() => {});
    }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    return () => navigator.geolocation.clearWatch(watch);
  }, [driver?.is_online, driver?.id]);

  if (!me) return <p className="text-muted-foreground">Loading…</p>;
  if (!driver) return <p className="text-muted-foreground">Loading driver profile…</p>;
  if (!driver.is_approved) {
    return (
      <div>
        <PageHeader eyebrow="Driver app" title="Awaiting approval" />
        <div className="max-w-md rounded-3xl border border-border/60 bg-card p-8 text-center space-y-3">
          <Bell className="w-12 h-12 text-primary mx-auto" />
          <p className="font-semibold">Your account is pending admin approval</p>
          <p className="text-sm text-muted-foreground">You'll be able to go online and receive ride pings once an admin approves your profile.</p>
        </div>
      </div>
    );
  }

  const incoming = rides.filter((r) => r.status === "driver_assigned");
  const active = rides.filter((r) => ["arriving", "in_progress"].includes(r.status));
  const history = rides.filter((r) => ["completed", "cancelled"].includes(r.status));
  const earnings = rides.filter((r) => r.status === "completed").reduce((s, r) => s + (r.accepted_amount || 0), 0);
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + (r.rating || 5), 0) / reviews.length : driver.rating || 5;

  const goOnline = async (online) => {
    let lat = driver.lat, lng = driver.lng;
    if (online && !lat) {
      const pos = await new Promise((res) => navigator.geolocation?.getCurrentPosition((p) => res(p), () => res(null)));
      if (pos) { lat = pos.coords.latitude; lng = pos.coords.longitude; lastPosRef.current = [lat, lng]; }
    }
    if (!online) lastPosRef.current = null;
    const updated = await base44.entities.Driver.update(driver.id, { is_online: online, lat, lng });
    setDriver(updated);
  };

  const openChat = (r) => { setActiveRide(r); setUnread((p) => ({ ...p, [r.id]: 0 })); };

  const accept = async (r) => {
    const updated = await base44.entities.Ride.update(r.id, { status: "arriving" });
    setRides((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
  };
  const reject = async (r) => {
    await base44.entities.Ride.update(r.id, { status: "searching", driver_id: "", driver_name: "", driver_vehicle: "" });
    setRides((prev) => prev.filter((x) => x.id !== r.id));
  };
  const startTrip = async (r) => {
    const updated = await base44.entities.Ride.update(r.id, { status: "in_progress" });
    setRides((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
  };
  const verifyPin = async (r) => {
    if (r.ride_pin) {
      const entered = pinInput[r.id] || "";
      if (entered.length !== 4 || entered !== String(r.ride_pin)) {
        alert("Incorrect passenger PIN. Ask the passenger for their 4-digit ride PIN before starting the trip.");
        return;
      }
    }
    const updated = await base44.entities.Ride.update(r.id, { status: "in_progress" });
    setRides((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
    setPinInput((p) => { const n = { ...p }; delete n[r.id]; return n; });
  };
  const complete = async (r) => {
    const updated = await base44.entities.Ride.update(r.id, { status: "completed" });
    setRides((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
    const fare = r.accepted_amount || 0;
    const rate = typeof driver.commission_rate === "number" ? driver.commission_rate : 0.15;
    const net = Math.round(fare * (1 - rate) * 100) / 100;
    await base44.entities.Driver.update(driver.id, { total_earnings: (driver.total_earnings || 0) + net }).then(setDriver).catch(() => {});
    await base44.entities.Transaction.create({
      amount: fare,
      commission: Math.round(fare * rate * 100) / 100,
      service: "ride",
      description: `Ride ${r.id.slice(0, 6)} · ${driver.full_name}`,
      reference_id: r.id,
      method: "ridex_card",
      status: "paid",
    }).catch(() => {});
    base44.functions.invoke("record-ride-commission", { ride_id: r.id }).catch(() => {});
  };

  const send = async (e) => {
    e.preventDefault();
    if (!draft.trim() || !activeRide) return;
    const m = await base44.entities.ChatMessage.create({ ride_id: activeRide.id, sender: "driver", text: draft.trim() });
    setMessages((prev) => [...prev, m]);
    setDraft("");
  };

  const rideMarkers = (r) => {
    const m = [];
    if (Number.isFinite(r.pickup_lat) && Number.isFinite(r.pickup_lng)) m.push({ position: [r.pickup_lat, r.pickup_lng], kind: "pickup", label: "Pickup" });
    if (Number.isFinite(r.dest_lat) && Number.isFinite(r.dest_lng)) m.push({ position: [r.dest_lat, r.dest_lng], kind: "destination", label: "Destination" });
    if (driver && Number.isFinite(driver.lat) && Number.isFinite(driver.lng)) m.push({ position: [driver.lat, driver.lng], kind: "driver", label: "You" });
    return m;
  };
  const rideRoute = (r) => (Number.isFinite(r.pickup_lat) && Number.isFinite(r.dest_lat)) ? [[r.pickup_lat, r.pickup_lng], [r.dest_lat, r.dest_lng]] : [];

  const openCancel = (r) => { setCancelTarget(r); setCancelReason(""); setCancelNote(""); };
  const closeCancel = () => { setCancelTarget(null); setCancelReason(""); setCancelNote(""); };
  const confirmCancel = async () => {
    if (!cancelTarget || !cancelReason) return;
    setCancelBusy(true);
    try {
      const reason = cancelReason + (cancelNote.trim() ? ` — ${cancelNote.trim()}` : "");
      const updated = await base44.entities.Ride.update(cancelTarget.id, { status: "cancelled", cancellation_reason: reason });
      setRides((prev) => prev.map((x) => (x.id === cancelTarget.id ? updated : x)));
      if (activeRide?.id === cancelTarget.id) setActiveRide(null);
      closeCancel();
    } catch (e) {
      alert(e.message || "Could not cancel ride");
    } finally {
      setCancelBusy(false);
    }
  };

  const callBtn = (r, full = false) => {
    const cls = full ? "h-9 flex-1 text-sm" : "h-8 px-3 text-xs";
    if (r.customer_phone) {
      return (
        <a href={`tel:${r.customer_phone}`} className={`inline-flex items-center justify-center gap-1 rounded-full border border-input hover:bg-accent ${cls}`}>
          <Phone className="w-4 h-4" /> Call
        </a>
      );
    }
    return (
      <Button size={full ? "default" : "sm"} variant="outline" className={`rounded-full ${full ? "flex-1" : ""}`} disabled title="No passenger phone on file">
        <Phone className="w-4 h-4 mr-1" /> Call
      </Button>
    );
  };

  const chatBtn = (r) => (
    <button onClick={() => openChat(r)} className="relative inline-flex items-center justify-center gap-1 rounded-full h-8 px-3 text-xs border border-input hover:bg-accent">
      <MessageCircle className="w-4 h-4" /> Chat
      {unread[r.id] ? (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{unread[r.id]}</span>
      ) : null}
    </button>
  );

  return (
    <div>
      <PageHeader
        eyebrow="Driver app"
        title={`Hi, ${driver.full_name?.split(" ")[0] || "driver"}`}
        subtitle="Go online to receive ride pings. Accept a ride to start earning."
        action={
          <Button
            className={`rounded-full ${driver.is_online ? "bg-emerald-500 text-white hover:bg-emerald-500/90" : ""}`}
            onClick={() => goOnline(!driver.is_online)}
          >
            <Power className="w-4 h-4 mr-2" /> {driver.is_online ? "Online" : "Go offline"}
          </Button>
        }
      />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Stat icon={Wallet} label="Today's earnings" value={money(earnings)} />
        <Stat icon={Star} label="Rating" value={`${avgRating.toFixed(1)} ★`} />
        <Stat icon={MapPin} label="Status" value={driver.is_online ? "Online · ready" : "Offline"} />
      </div>

      <div className="mb-6 rounded-3xl border border-destructive/30 bg-destructive/5 p-4 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-1">
          <p className="font-semibold text-destructive flex items-center gap-2"><ShieldAlert className="w-5 h-5" /> Driver emergency SOS</p>
          <p className="text-xs text-muted-foreground mt-0.5">Always available. One tap alerts admin & emergency contacts with live GPS + panic mode.</p>
        </div>
        <div className="w-full sm:w-64"><DriverSosButton driver={driver} ride={active[0] || null} /></div>
      </div>

      {incoming.length > 0 && (
        <div className="mb-6 rounded-3xl border border-primary/40 bg-primary/5 p-5 space-y-3">
          <p className="font-semibold flex items-center gap-2 text-primary"><Bell className="w-4 h-4 animate-pulse" /> New ride request{incoming.length > 1 ? "s" : ""}!</p>
          {incoming.map((r) => (
            <div key={r.id} className="rounded-2xl bg-card p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.pickup_address} → {r.dest_address}</p>
                  <p className="text-xs text-muted-foreground">{(r.distance_km || 0).toFixed(1)} km · {money(r.accepted_amount)} · {r.ride_type}</p>
                </div>
                {chatBtn(r)}
                {callBtn(r)}
              </div>
              <ServiceMap height="170px" markers={rideMarkers(r)} route={rideRoute(r)} />
              <div className="flex gap-2">
                <Button size="sm" className="rounded-full bg-emerald-500 text-white hover:bg-emerald-500/90 flex-1" onClick={() => accept(r)}><Check className="w-4 h-4 mr-1" /> Accept</Button>
                <Button size="sm" variant="outline" className="rounded-full flex-1" onClick={() => reject(r)}><X className="w-4 h-4 mr-1" /> Decline</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-6">
        <div className="space-y-5">
          <div className="rounded-3xl border border-border/60 bg-card p-5">
            <h3 className="font-semibold mb-3">Active rides</h3>
            {active.length === 0 && <p className="text-sm text-muted-foreground">No active rides. Go online to receive requests.</p>}
            {active.map((r) => (
              <div key={r.id} className="rounded-2xl bg-secondary/40 p-4 mb-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.pickup_address} → {r.dest_address}</p>
                    <p className="text-xs text-muted-foreground">{money(r.accepted_amount)} · <StatusBadge status={r.status} /></p>
                  </div>
                  <div className="flex gap-2">
                    {chatBtn(r)}
                    {callBtn(r)}
                  </div>
                </div>
                <ServiceMap height="220px" markers={rideMarkers(r)} route={rideRoute(r)} />
                {r.status === "arriving" && r.ride_pin && (
                  <div className="flex gap-2 mb-2">
                    <Input className="rounded-xl flex-1 tracking-[0.4em] font-mono text-center" inputMode="numeric" maxLength={4} placeholder="Enter passenger PIN" value={pinInput[r.id] || ""} onChange={(e) => setPinInput((p) => ({ ...p, [r.id]: e.target.value.replace(/\D/g, "") }))} />
                  </div>
                )}
                <div className="flex gap-2">
                  {r.status === "arriving" && <Button size="sm" className="rounded-full flex-1" disabled={!!r.ride_pin && (pinInput[r.id] || "").length !== 4} onClick={() => verifyPin(r)}>Start trip</Button>}
                  {r.status === "in_progress" && <Button size="sm" className="rounded-full flex-1 bg-emerald-500 text-white hover:bg-emerald-500/90" onClick={() => complete(r)}>Complete trip</Button>}
                  <Button size="sm" variant="outline" className="rounded-full flex-1 text-destructive hover:text-destructive" onClick={() => openCancel(r)}><Ban className="w-4 h-4 mr-1" /> Cancel ride</Button>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-border/60 bg-card p-5">
            <h3 className="font-semibold mb-3">Ride history</h3>
            {history.length === 0 && <p className="text-sm text-muted-foreground">No completed rides yet.</p>}
            {history.slice(0, 8).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 py-2 border-t border-border/40 first:border-0">
                <div className="min-w-0">
                  <p className="text-sm truncate">{r.pickup_address} → {r.dest_address}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.created_date).toLocaleDateString()}
                    {r.status === "cancelled" && r.cancellation_reason ? ` · ${r.cancellation_reason}` : ""}
                  </p>
                </div>
                <span className="text-sm font-medium">{r.status === "cancelled" ? <StatusBadge status="cancelled" /> : money(r.accepted_amount)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-border/60 bg-card p-5">
          <h3 className="font-semibold mb-3">{activeRide ? `Chat — ${activeRide.pickup_address} → ${activeRide.dest_address}` : "Passenger chat"}</h3>
          {!activeRide ? (
            <p className="text-sm text-muted-foreground">Select a ride and tap Chat to message your passenger. New messages show a badge.</p>
          ) : (
            <>
              <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
                {messages.map((m, i) => (
                  <div key={i} className={`text-sm px-3 py-2 rounded-2xl max-w-[85%] ${m.sender === "driver" ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary"}`}>{m.text}</div>
                ))}
                {messages.length === 0 && <p className="text-xs text-muted-foreground">No messages yet.</p>}
              </div>
              <form className="flex gap-2" onSubmit={send}>
                <Input className="rounded-xl" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message passenger" />
                <Button type="submit" size="icon" className="rounded-xl"><Send className="w-4 h-4" /></Button>
              </form>
              <div className="flex gap-2 mt-3">
                <Button variant="outline" size="sm" className="rounded-full flex-1" onClick={() => setActiveRide(null)}>Close</Button>
                {activeRide.customer_phone ? (
                  <a href={`tel:${activeRide.customer_phone}`} className="inline-flex items-center justify-center gap-1 rounded-full border border-input px-3 h-8 text-xs hover:bg-accent flex-1">
                    <Phone className="w-4 h-4" /> Call passenger
                  </a>
                ) : (
                  <Button variant="outline" size="sm" className="rounded-full flex-1" disabled title="No passenger phone on file"><Phone className="w-4 h-4 mr-1" /> Call passenger</Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-destructive" />
              <h3 className="font-semibold">Cancel this ride?</h3>
            </div>
            <p className="text-sm text-muted-foreground">{cancelTarget.pickup_address} → {cancelTarget.dest_address}</p>
            <div>
              <Label className="text-xs">Reason for cancellation</Label>
              <select
                className="mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              >
                <option value="" disabled className="bg-card">Select a reason…</option>
                {CANCEL_REASONS.map((r) => <option key={r} value={r} className="bg-card">{r}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Details (optional)</Label>
              <Textarea className="mt-1 rounded-xl" rows={3} value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} placeholder="Add a note for the records…" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-full flex-1" onClick={closeCancel} disabled={cancelBusy}>Keep ride</Button>
              <Button variant="destructive" className="rounded-full flex-1" onClick={confirmCancel} disabled={cancelBusy || !cancelReason}>{cancelBusy ? "Cancelling…" : "Confirm cancel"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="w-3.5 h-3.5" /> {label}</div>
      <p className="text-xl font-extrabold mt-1">{value}</p>
    </div>
  );
}