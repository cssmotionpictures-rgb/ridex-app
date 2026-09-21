import React from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import PageHeader from "@/components/shared/PageHeader";
import ServiceMap from "@/components/shared/ServiceMap";
import StatusBadge from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { interpolate, money } from "@/lib/pricing";
import { Camera, Download, Loader2, Star, Flag, CheckCircle2, ShieldCheck } from "lucide-react";

const STEPS = ["pending", "driver_assigned", "pickup", "in_transit", "arriving_soon", "delivered"];

export default function DeliveryTracking() {
  const id = new URLSearchParams(window.location.search).get("id");
  const [req, setReq] = React.useState(null);
  const [progress, setProgress] = React.useState(0);
  const [uploading, setUploading] = React.useState(false);
  const [rating, setRating] = React.useState(5);
  const [review, setReview] = React.useState("");
  const [reviewed, setReviewed] = React.useState(false);
  const [codeInput, setCodeInput] = React.useState("");
  const [codeBusy, setCodeBusy] = React.useState(false);
  const [codeError, setCodeError] = React.useState("");
  const [missing, setMissing] = React.useState(false);
  const lastNotified = React.useRef("");

  React.useEffect(() => {
    if (id) base44.entities.LogisticsRequest.get(id).then(setReq).catch(() => setMissing(true));
    else setMissing(true);
  }, [id]);

  React.useEffect(() => {
    if (!req || req.status === "delivered") return;
    const t = setInterval(() => setProgress((p) => Math.min(1, p + 0.02)), 5000);
    return () => clearInterval(t);
  }, [req]);

  React.useEffect(() => {
    if (!req || progress === 0) return;
    const idx = Math.min(STEPS.length - 2, 1 + Math.floor(progress * 4.2));
    const status = STEPS[idx];
    const from = [req.pickup_lat, req.pickup_lng];
    const to = [req.delivery_lat, req.delivery_lng];
    const pos = interpolate(from, to, progress);
    base44.entities.LogisticsRequest.update(req.id, { status, driver_lat: pos[0], driver_lng: pos[1] }).then(setReq);
    if (status !== lastNotified.current) {
      lastNotified.current = status;
      base44.functions.invoke("notify-logistics-milestone", { logistics_id: req.id, status }).catch(() => {});
    }
  }, [progress]);

  const uploadProof = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    const updated = await base44.entities.LogisticsRequest.update(req.id, { proof_photo_url: file_url });
    setReq(updated);
    setUploading(false);
  };

  const confirmDelivery = async () => {
    setCodeError("");
    if (!req?.delivery_code) { setCodeError("No delivery code was generated for this package."); return; }
    if (codeInput.trim() !== String(req.delivery_code)) {
      setCodeError("Incorrect code. Ask the receiver for the 6-digit code emailed to them.");
      return;
    }
    setCodeBusy(true);
    try {
      const updated = await base44.entities.LogisticsRequest.update(req.id, { status: "delivered" });
      setReq(updated);
      base44.functions.invoke("notify-logistics-milestone", { logistics_id: req.id, status: "delivered" }).catch(() => {});
    } catch (e) {
      setCodeError(e.message || "Could not confirm delivery");
    } finally {
      setCodeBusy(false);
    }
  };

  const submitReview = async () => {
    await base44.entities.DriverReview.create({ logistics_id: id, service: "logistics", courier_name: req.driver_name || "", rating, review, customer_name: req.pickup_address || "" });
    setReviewed(true);
  };

  const complain = async () => {
    await base44.entities.DriverReview.create({ logistics_id: id, service: "logistics", courier_name: req.driver_name || "", rating, review: review || "Customer reported an issue with this courier.", customer_name: req.pickup_address || "", complaint: true }).catch(() => {});
    const subject = `Complaint about courier ${req.driver_name || ""}`;
    const message = `Delivery ${id}: ${review || "Customer reported an issue with this courier."}`;
    await base44.entities.SupportTicket.create({ subject, message, service: "logistics", customer_email: "" });
    alert("Complaint sent to RIDE X support. We'll review and get back to you.");
    setReviewed(true);
  };

  if (missing) return (
    <div className="text-center py-20 space-y-3">
      <p className="text-muted-foreground">No delivery selected. Create a logistics request to track a package.</p>
      <Button asChild className="rounded-full"><Link to="/logistics">Send a package</Link></Button>
    </div>
  );
  if (!req) return <p className="text-muted-foreground">Loading tracking…</p>;

  const from = [req.pickup_lat, req.pickup_lng];
  const to = [req.delivery_lat, req.delivery_lng];
  const driver = req.driver_lat ? [req.driver_lat, req.driver_lng] : from;
  const minsLeft = Math.max(0, Math.round((req.eta_minutes || 60) * (1 - progress)));
  const stepIndex = STEPS.indexOf(req.status);

  return (
    <div>
      <PageHeader
        eyebrow={`Tracking ${req.tracking_number || ""}`}
        title={req.status === "delivered" ? "Delivered" : `Arriving in ~${minsLeft} min`}
        subtitle={`${req.pickup_address} → ${req.delivery_address}`}
        action={<StatusBadge status={req.status} />}
      />

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6">
        <ServiceMap
          height="560px"
          markers={[
            { position: from, kind: "pickup", label: "Pickup" },
            { position: to, kind: "destination", label: "Delivery" },
            { position: driver, kind: "driver", label: req.driver_name },
          ]}
          route={[from, to]}
        />

        <div className="space-y-5">
          <div className="rounded-3xl border border-border/60 bg-card p-6">
            <p className="font-semibold mb-4">Delivery progress</p>
            <ol className="space-y-3">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full ${i <= stepIndex ? "bg-primary" : "bg-secondary"}`} />
                  <span className={`text-sm capitalize ${i <= stepIndex ? "text-foreground" : "text-muted-foreground"}`}>
                    {s.replace(/_/g, " ")}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {(req.status === "in_transit" || req.status === "arriving_soon") && (
            <div className="rounded-3xl border border-primary/40 bg-primary/5 p-6 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <h3 className="font-semibold">Package confirmation</h3>
              </div>
              <p className="text-sm text-muted-foreground">A 6-digit code was emailed to {req.receiver_email || "the receiver"}. The receiver gives this code to the driver, who enters it here to confirm delivery.</p>
              <div className="flex gap-2">
                <Input
                  className="rounded-xl tracking-[0.4em] text-center text-lg font-mono"
                  maxLength={6}
                  inputMode="numeric"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••••"
                />
                <Button className="rounded-full" disabled={codeInput.length !== 6 || codeBusy} onClick={confirmDelivery}>
                  {codeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />} Confirm
                </Button>
              </div>
              {codeError && <p className="text-xs text-destructive">{codeError}</p>}
            </div>
          )}

          <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-3">
            <p className="text-sm"><span className="text-muted-foreground">Courier:</span> {req.driver_name}</p>
            <p className="text-sm"><span className="text-muted-foreground">Package:</span> {req.package_description || "—"} · {req.weight_kg}kg · {req.dimensions}</p>
            <p className="text-sm"><span className="text-muted-foreground">Paid:</span> {money(req.amount)}</p>
            {req.proof_photo_url && (
              <img src={req.proof_photo_url} alt="Proof of delivery" className="rounded-2xl w-full object-cover max-h-48" />
            )}
            <label className="block">
              <input type="file" accept="image/*" className="hidden" onChange={uploadProof} />
              <span className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full border border-border cursor-pointer hover:bg-secondary">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Capture proof of delivery
              </span>
            </label>
            <Button variant="outline" className="rounded-full w-full" onClick={() => window.print()}>
              <Download className="w-4 h-4 mr-2" /> Download receipt
            </Button>
          </div>

          {req.status === "delivered" && (
            <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-4">
              <h3 className="font-semibold">Rate your courier</h3>
              {reviewed ? (
                <p className="text-sm text-emerald-400 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Thanks for your feedback!</p>
              ) : (
                <>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" onClick={() => setRating(n)}>
                        <Star className={`w-6 h-6 ${n <= rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                      </button>
                    ))}
                  </div>
                  <Label className="text-xs">Review</Label>
                  <Input className="rounded-xl" value={review} onChange={(e) => setReview(e.target.value)} placeholder="How was your delivery?" />
                  <div className="flex gap-2">
                    <Button className="rounded-full flex-1" onClick={submitReview}>Submit review</Button>
                    <Button variant="outline" className="rounded-full" onClick={complain}><Flag className="w-4 h-4 mr-1" /> Report courier</Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}