import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { TIERS } from "@/lib/businessBlueprints";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Send, MailCheck, AlertTriangle } from "lucide-react";

function nairaToNum(s) { return Number(String(s).replace(/[₦,\s]/g, "")) || 0; }

// Guided funding-request form for a single Wealth Lab capital tier.
// Submits a LoanApplication record directly through the app — no backend
// function or integration credits needed (entity create is credit-free).
export default function LoanApplicationForm({ tier, open, onClose }) {
  const amount = nairaToNum(tier?.capital);
  const [form, setForm] = useState({
    business_name: "",
    business_type: tier?.businesses?.[0]?.name || "",
    amount_requested: amount,
    applicant_name: "",
    email: "",
    phone: "",
    bvn: "",
    has_cac: false,
    funding_source: "",
    business_plan_summary: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [delivering, setDelivering] = useState(false);
  const [delivery, setDelivery] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // The form always follows the selected tier: opening the apply dialog (or
  // switching tiers) brings THAT tier's loan amount and business types.
  useEffect(() => {
    if (!open) return;
    setForm({
      business_name: "",
      business_type: tier?.businesses?.[0]?.name || "",
      amount_requested: nairaToNum(tier?.capital),
      applicant_name: "",
      email: "",
      phone: "",
      bvn: "",
      has_cac: false,
      funding_source: "",
      business_plan_summary: "",
    });
    setDone(false);
    setError("");
    setDelivering(false);
    setDelivery(null);
  }, [open, tier]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.business_name || !form.applicant_name || !form.email) {
      setError("Business name, applicant name and email are required.");
      return;
    }
    setSubmitting(true); setError("");
    try {
      // The stored tier follows the amount actually applied for — a ₦20m
      // request is recorded under the ₦20m tier, never the tier last viewed.
      const requested = Number(form.amount_requested) || 0;
      const matchedTier = TIERS.find((t) => nairaToNum(t.capital) === requested);
      const created = await base44.entities.LoanApplication.create({
        tier: matchedTier?.capital || tier?.capital || "",
        ...form,
        amount_requested: Number(form.amount_requested) || 0,
        email: String(form.email).toLowerCase().trim(),
      });
      setDone(true);
      // AUTOMATIC LENDER DELIVERY — match a real funding source, find its
      // official application email and send the full proposal there.
      if (created?.id) {
        setDelivering(true);
        try {
          const res = await base44.functions.invoke("loan-application-email", {
            action: "send",
            id: created.id,
          });
          setDelivery(res?.data || res);
        } catch (err) {
          setDelivery({ ok: false, error: err?.message || "Delivery step failed" });
        } finally {
          setDelivering(false);
        }
      }
    } catch (err) {
      setError(err?.message || "Could not submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Apply for funding · {tier?.capital}</DialogTitle>
          <DialogDescription>
            Submit a funding request for this capital tier. A record is created in the app and an admin reviews it — you'll see the status under your receipts.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="py-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="font-bold text-lg">Application submitted</p>
            <p className="text-sm text-muted-foreground mt-1">Your funding request for {tier?.capital} has been received. You can track its status under Receipts → Loan Applications.</p>
            <div className="mt-4 rounded-xl border border-border/60 bg-secondary/40 px-3 py-2.5 text-left">
              {delivering ? (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  Matching your request to a real lender and emailing your proposal automatically…
                </p>
              ) : delivery?.ok ? (
                <p className="text-xs text-emerald-400 flex items-start gap-2">
                  <MailCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Proposal emailed to the matched lender ({delivery.email}). Delivery to the lender's inbox is confirmed by our email system — keep your phone and email reachable for their reply.</span>
                </p>
              ) : (
                <p className="text-xs text-amber-400 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Proposal saved, but the automatic lender email didn't go out{delivery?.error ? ` — ${delivery.error}` : ""}. It's flagged for manual delivery by the team.</span>
                </p>
              )}
            </div>
            <Button className="mt-5" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Business / venture name *</Label>
                <Input value={form.business_name} onChange={(e) => set("business_name", e.target.value)} placeholder="e.g. Ada POS Hub" />
              </div>
              <div>
                <Label>Business type</Label>
                <select value={form.business_type} onChange={(e) => set("business_type", e.target.value)} className="w-full h-9 rounded-md border border-input bg-input px-3 text-sm">
                  {(tier?.businesses || []).map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Amount requested (₦) *</Label>
                <Input type="number" value={form.amount_requested} onChange={(e) => set("amount_requested", e.target.value)} />
              </div>
              <div>
                <Label>Preferred funding source</Label>
                <Input value={form.funding_source} onChange={(e) => set("funding_source", e.target.value)} placeholder="e.g. Microfinance bank, BOI, Cooperative" />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Your name *</Label>
                <Input value={form.applicant_name} onChange={(e) => set("applicant_name", e.target.value)} placeholder="Full name" />
              </div>
              <div>
                <Label>Email *</Label>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@email.com" />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="080..." />
              </div>
              <div>
                <Label>BVN (optional)</Label>
                <Input value={form.bvn} onChange={(e) => set("bvn", e.target.value)} placeholder="Bank Verification Number" />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.has_cac} onChange={(e) => set("has_cac", e.target.checked)} className="w-4 h-4 accent-primary" />
              My business is CAC-registered
            </label>

            <div>
              <Label>Business plan / use of funds</Label>
              <Textarea rows={4} value={form.business_plan_summary} onChange={(e) => set("business_plan_summary", e.target.value)} placeholder="One paragraph: what you sell, your market, and exactly how the loan will be deployed and repaid." />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 justify-end pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Submit application
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}