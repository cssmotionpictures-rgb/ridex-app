import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, Upload, AlertCircle } from "lucide-react";
import VerifiedBadge from "./VerifiedBadge";

export default function VerificationCard() {
  const [me, setMe] = React.useState(null);
  const [verification, setVerification] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [idDoc, setIdDoc] = React.useState(null);
  const [selfie, setSelfie] = React.useState(null);

  const load = React.useCallback(async () => {
    const u = await base44.auth.me().catch(() => null);
    setMe(u);
    const list = await base44.entities.Verification.list("-created_date", 1).catch(() => []);
    setVerification(list[0] || null);
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const upload = async (file, setter) => {
    if (!file) return;
    setBusy(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setter(file_url);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!idDoc || !selfie) return;
    setBusy(true);
    try {
      const v = await base44.entities.Verification.create({
        user_name: me?.full_name || "",
        user_email: me?.email || "",
        id_document_url: idDoc,
        selfie_url: selfie,
        status: "pending",
      });
      setVerification(v);
      setIdDoc(null);
      setSelfie(null);
    } finally {
      setBusy(false);
    }
  };

  const approved = verification?.status === "approved";

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold flex items-center gap-2">Identity verification <VerifiedBadge approved={approved} /></h3>
          <p className="text-xs text-muted-foreground mt-1">Upload a valid ID and a selfie to get a Verified badge. Admin reviews submissions.</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : verification ? (
        <div className="rounded-2xl bg-secondary/50 p-4 space-y-1 text-sm">
          <p>Status: <span className={`font-semibold ${verification.status === "approved" ? "text-emerald-300" : verification.status === "rejected" ? "text-destructive" : "text-amber-300"}`}>{verification.status}</span></p>
          {verification.status === "rejected" && verification.rejection_reason && (
            <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {verification.rejection_reason}</p>
          )}
          {verification.status === "rejected" && (
            <Button size="sm" className="rounded-full mt-2" onClick={() => setVerification(null)}>Resubmit</Button>
          )}
          {verification.status === "approved" && (
            <p className="text-xs text-emerald-300 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> You're verified — other users will see your badge.</p>
          )}
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Government-issued ID</Label>
              <label className="mt-1 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-6 cursor-pointer hover:bg-secondary/40 text-sm text-muted-foreground">
                <Upload className="w-4 h-4" /> {idDoc ? "ID uploaded ✓" : "Tap to upload"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], setIdDoc)} />
              </label>
            </div>
            <div>
              <Label className="text-xs">Selfie</Label>
              <label className="mt-1 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-6 cursor-pointer hover:bg-secondary/40 text-sm text-muted-foreground">
                <Upload className="w-4 h-4" /> {selfie ? "Selfie uploaded ✓" : "Tap to upload"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0], setSelfie)} />
              </label>
            </div>
          </div>
          <Button className="rounded-full w-full" onClick={submit} disabled={busy || !idDoc || !selfie}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Submit for review
          </Button>
        </>
      )}
    </div>
  );
}