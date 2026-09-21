import React from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import CheckoutDialog from "@/components/shared/CheckoutDialog";
import { FREE_FEATURE_TIERS, FREE_FEATURE_TERMS, freeFeatureCertificateHtml, freeFeatureFee } from "@/lib/studioFeatures";
import { money } from "@/lib/pricing";
import { Loader2, Printer, CheckCircle2, XCircle, Sparkles } from "lucide-react";

const EMPTY = { artist_name: "", email: "", song_title: "", genre: "", music_url: "", social_handle: "", ncc_certificate_number: "", mcsn_catalog_number: "", feature_tier: "macro", terms_accepted: false };

const printCert = (r) => {
  const html = freeFeatureCertificateHtml(r);
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>Free Feature Approval</title><style>body{margin:0;background:#fff}</style></head><body>${html}</body></html>`);
  w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
};

export default function FreeFeatureDialog({ open, onOpenChange, onApproved }) {
  const [form, setForm] = React.useState(EMPTY);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [appId, setAppId] = React.useState(null);
  const [checkout, setCheckout] = React.useState(false);
  const [cert, setCert] = React.useState(null);
  const [scoring, setScoring] = React.useState(false);

  React.useEffect(() => { if (open) { setForm(EMPTY); setErr(""); setAppId(null); setCheckout(false); setCert(null); setScoring(false); } }, [open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const startPayment = async () => {
    if (!form.artist_name.trim() || !form.song_title.trim() || !form.music_url.trim()) {
      setErr("Artist name, song title and music link are required.");
      return;
    }
    if (!form.ncc_certificate_number.trim() && !form.mcsn_catalog_number.trim()) {
      setErr("Provide your NCC Certificate Number or MCSN Catalog Number to prove composition ownership.");
      return;
    }
    if (!form.terms_accepted) { setErr("You must accept the terms & conditions to apply."); return; }
    setBusy(true);
    try {
      const fee = freeFeatureFee(form.feature_tier);
      const rec = await base44.entities.FreeFeatureApplication.create({
        artist_name: form.artist_name.trim(),
        email: form.email.trim(),
        song_title: form.song_title.trim(),
        genre: form.genre.trim(),
        music_url: form.music_url.trim(),
        social_handle: form.social_handle.trim(),
        ncc_certificate_number: form.ncc_certificate_number.trim(),
        mcsn_catalog_number: form.mcsn_catalog_number.trim(),
        feature_tier: form.feature_tier,
        terms_accepted: true,
        application_fee: fee,
        currency: "NGN",
        payment_status: "pending",
        status: "pending",
      });
      setAppId(rec.id);
      setBusy(false);
      setCheckout(true);
    } catch (e) { setBusy(false); setErr(e.message || "Could not start application"); }
  };

  const onPaid = async (tx) => {
    setCheckout(false);
    setScoring(true);
    try {
      // The algorithmic A&R score runs on the auto-approve engine (server-side), never client-side.
      await base44.functions.invoke("auto-approve-free-feature", {
        application_id: appId,
        transaction_id: tx?.id || "",
        paystack_reference: tx?.paystack_reference || tx?.reference || "",
      });
      const fresh = await base44.entities.FreeFeatureApplication.get(appId);
      setScoring(false);
      setCert(fresh);
      onApproved?.(fresh);
    } catch (e) {
      setScoring(false);
      setErr(e.message || "Payment succeeded but the score result failed — contact support.");
    }
  };

  return (
    <>
      <Dialog open={open && !checkout && !cert} onOpenChange={(v) => !v && onOpenChange(false)}>
        <DialogContent className="sm:max-w-lg rounded-3xl max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Apply for a Free Feature</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Artist name</Label><Input className="rounded-xl mt-1" value={form.artist_name} onChange={(e) => set("artist_name", e.target.value)} placeholder="Your stage name" /></div>
              <div><Label className="text-xs">Contact email</Label><Input type="email" className="rounded-xl mt-1" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@email.com" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Song title</Label><Input className="rounded-xl mt-1" value={form.song_title} onChange={(e) => set("song_title", e.target.value)} placeholder="Track name" /></div>
              <div><Label className="text-xs">Genre</Label><Input className="rounded-xl mt-1" value={form.genre} onChange={(e) => set("genre", e.target.value)} placeholder="Afrobeats / Hip-Hop" /></div>
            </div>
            <div><Label className="text-xs">Music link (Audiomack / Spotify / YouTube / Boomplay)</Label><Input className="rounded-xl mt-1" value={form.music_url} onChange={(e) => set("music_url", e.target.value)} placeholder="https://…" /></div>
            <div><Label className="text-xs">Social handle (optional)</Label><Input className="rounded-xl mt-1" value={form.social_handle} onChange={(e) => set("social_handle", e.target.value)} placeholder="@yourhandle" /></div>

            <div className="rounded-2xl bg-secondary/40 p-3 space-y-2">
              <p className="text-[11px] text-muted-foreground">Copyright fixation proof — provide at least one to verify you own 100% of the composition.</p>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">NCC Certificate #</Label><Input className="rounded-xl mt-1" value={form.ncc_certificate_number} onChange={(e) => set("ncc_certificate_number", e.target.value)} placeholder="NCC reg. number" /></div>
                <div><Label className="text-xs">MCSN Catalog #</Label><Input className="rounded-xl mt-1" value={form.mcsn_catalog_number} onChange={(e) => set("mcsn_catalog_number", e.target.value)} placeholder="MCSN catalog no." /></div>
              </div>
            </div>

            <div>
              <Label className="text-xs">Feature tier (sets your processing fee)</Label>
              <Select value={form.feature_tier} onValueChange={(v) => set("feature_tier", v)}>
                <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREE_FEATURE_TIERS.map((t) => (
                    <SelectItem key={t.key} value={t.key}>{t.label} — {money(t.fee)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">Macro ₦100k → Mid ₦60k → Micro ₦30k → Nano ₦15k. Higher tier, bigger feature.</p>
            </div>

            <div className="rounded-2xl bg-secondary p-4 space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Terms & conditions</p>
              <ul className="space-y-1 text-[11px] text-muted-foreground">
                {FREE_FEATURE_TERMS.map((t, i) => <li key={i} className="flex gap-1.5"><span className="text-primary">•</span><span>{t}</span></li>)}
              </ul>
              <label className="flex items-start gap-2 pt-1 cursor-pointer">
                <Checkbox checked={form.terms_accepted} onCheckedChange={(v) => set("terms_accepted", !!v)} className="mt-0.5" />
                <span className="text-xs">I accept the terms & conditions and confirm my music is original and meets the quality bar.</span>
              </label>
            </div>

            <div className="rounded-2xl border border-primary/40 bg-primary/10 p-3 flex justify-between items-center">
              <span className="text-sm">Non-refundable processing fee · {FREE_FEATURE_TIERS.find((t) => t.key === form.feature_tier)?.label}</span>
              <span className="font-bold text-primary">{money(freeFeatureFee(form.feature_tier))}</span>
            </div>

            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button className="w-full rounded-full h-11 font-semibold" disabled={busy} onClick={startPayment}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `Apply & Pay ${money(freeFeatureFee(form.feature_tier))}`}
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">Algorithmic A&R score on payment — 9.5/10 or higher auto-approves the free feature. Fee is non-refundable.</p>
          </div>
        </DialogContent>
      </Dialog>

      <CheckoutDialog
        open={checkout}
        onOpenChange={(v) => { if (!v) setCheckout(false); }}
        amount={freeFeatureFee(form.feature_tier)}
        service="free_feature"
        description={`Free Feature Application — ${form.artist_name} / ${form.song_title}`}
        referenceId={appId}
        commission={freeFeatureFee(form.feature_tier)}
        allowCash={false}
        onPaid={onPaid}
      />

      <Dialog open={scoring} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-sm rounded-3xl text-center" >
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="font-semibold">Scoring your submission…</p>
          <p className="text-xs text-muted-foreground mt-1">Our A&R algorithm is vetting your track against the quality matrix. This takes a few seconds.</p>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cert} onOpenChange={(v) => !v && onOpenChange(false)}>
        <DialogContent className="sm:max-w-2xl rounded-3xl max-h-[92dvh] overflow-y-auto">
          {cert?.status === "approved" ? (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Application Accepted!</DialogTitle></DialogHeader>
              <div className="text-center py-3 space-y-1">
                <p className="text-3xl font-extrabold text-primary">{cert?.quality_score != null ? Number(cert.quality_score).toFixed(1) : "9.5+"}<span className="text-base text-muted-foreground">/10</span></p>
                <p className="text-sm text-muted-foreground">Your track cleared the algorithmic A&R vetting matrix. Your free feature has been granted. The A&R desk will contact you at <span className="text-foreground font-medium">{cert?.email || "your email"}</span>.</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-white text-black overflow-hidden" dangerouslySetInnerHTML={{ __html: freeFeatureCertificateHtml(cert) }} />
              <Button className="rounded-full w-full" onClick={() => printCert(cert)}><Printer className="w-4 h-4" /> Print Acceptance Certificate</Button>
            </>
          ) : (
            <>
              <DialogHeader><DialogTitle className="flex items-center gap-2"><XCircle className="w-4 h-4 text-destructive" /> Application Declined</DialogTitle></DialogHeader>
              <div className="text-center py-8 space-y-3">
                <XCircle className="w-14 h-14 text-destructive mx-auto" />
                <p className="text-3xl font-extrabold text-destructive">{cert?.quality_score != null ? Number(cert.quality_score).toFixed(1) : "—"}<span className="text-base text-muted-foreground">/10</span></p>
                <p className="font-semibold">Below the 9.5 auto-approve threshold.</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">Your track did not clear the algorithmic A&R vetting matrix this time. The {money(freeFeatureFee(cert?.feature_tier))} fee is non-refundable and has been captured. Polish your submission and try again with your next track.</p>
                <Button className="rounded-full" onClick={() => onOpenChange(false)}>Close</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}