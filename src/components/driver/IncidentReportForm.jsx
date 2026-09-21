import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, Check, FileText } from "lucide-react";

// Driver incident report form — attaches a ride, description, and evidence uploads.
export default function IncidentReportForm({ driver, rides = [] }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [form, setForm] = React.useState({
    ride_id: "",
    category: "Other",
    description: "",
    anonymous: false,
    photos: [],
    audio: [],
    video: [],
  });
  const [progress, setProgress] = React.useState({});

  const completedRides = rides.filter((r) => ["completed", "cancelled"].includes(r.status));

  const uploadFiles = async (files) => {
    const urls = [];
    for (const f of files) {
      setProgress((p) => ({ ...p, [f.name]: 0 }));
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
        urls.push(file_url);
        setProgress((p) => ({ ...p, [f.name]: 100 }));
      } catch {
        setProgress((p) => ({ ...p, [f.name]: -1 }));
      }
    }
    return urls;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.description.trim()) return;
    setBusy(true);
    try {
      const sel = completedRides.find((r) => r.id === form.ride_id);
      const me = await base44.auth.me().catch(() => null);
      await base44.entities.IncidentReport.create({
        driver_id: driver?.id || me?.id || "",
        driver_name: form.anonymous ? "Anonymous" : (driver?.full_name || me?.full_name || "Driver"),
        passenger_id: "",
        passenger_name: sel ? "Ride passenger" : "",
        ride_id: form.ride_id,
        category: form.category,
        description: form.description.trim(),
        evidence_photos: form.photos.join(", "),
        evidence_audio: form.audio.join(", "),
        evidence_video: form.video.join(", "),
        anonymous: form.anonymous,
        status: "Pending",
      });
      setDone(true);
    } catch (err) {
      alert(err.message || "Could not submit report");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setForm({ ride_id: "", category: "Other", description: "", anonymous: false, photos: [], audio: [], video: [] });
    setProgress({});
    setDone(false);
    setOpen(false);
  };

  return (
    <>
      <Button variant="outline" className="rounded-full w-full" onClick={() => setOpen(true)}>
        <FileText className="w-4 h-4 mr-2" /> Report an incident
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 max-h-[90vh] overflow-y-auto">
            {done ? (
              <div className="space-y-4 text-center py-6">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 mx-auto flex items-center justify-center"><Check className="w-7 h-7 text-emerald-400" /></div>
                <h3 className="font-semibold">Incident report submitted</h3>
                <p className="text-sm text-muted-foreground">The safety team will investigate within 24 hours.</p>
                <Button className="rounded-full" onClick={reset}>Done</Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <h3 className="font-semibold">Incident report</h3>

                <div>
                  <Label className="text-xs">Related ride (optional)</Label>
                  <select className="mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm" value={form.ride_id} onChange={(e) => setForm((f) => ({ ...f, ride_id: e.target.value }))}>
                    <option value="" className="bg-card">No specific ride</option>
                    {completedRides.map((r) => (
                      <option key={r.id} value={r.id} className="bg-card">{r.pickup_address} → {r.dest_address} ({r.status})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-xs">Category</Label>
                  <select className="mt-1 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                    {["Violence", "Theft", "Verbal Abuse", "No-show", "Fraud", "Dangerous Behaviour", "Other"].map((c) => (
                      <option key={c} value={c} className="bg-card">{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-xs">What happened *</Label>
                  <Textarea className="mt-1 rounded-xl" rows={4} required value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Describe the incident in detail…" />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Evidence (photos)</Label>
                  <Input type="file" accept="image/*" multiple onChange={async (e) => { const urls = await uploadFiles([...e.target.files]); setForm((f) => ({ ...f, photos: [...f.photos, ...urls] })); }} />
                  {Object.entries(progress).map(([name, pct]) => (
                    <div key={name} className="flex items-center gap-2 text-xs">
                      <span className="truncate flex-1">{name}</span>
                      {pct === -1 ? <span className="text-destructive">failed</span> : pct < 100 ? <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div> : <Check className="w-3 h-3 text-emerald-400" />}
                    </div>
                  ))}
                  {form.photos.length > 0 && <p className="text-xs text-emerald-400">{form.photos.length} photo(s) attached</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Evidence (audio)</Label>
                  <Input type="file" accept="audio/*" multiple onChange={async (e) => { const urls = await uploadFiles([...e.target.files]); setForm((f) => ({ ...f, audio: [...f.audio, ...urls] })); }} />
                  {form.audio.length > 0 && <p className="text-xs text-emerald-400">{form.audio.length} audio file(s) attached</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Evidence (video)</Label>
                  <Input type="file" accept="video/*" multiple onChange={async (e) => { const urls = await uploadFiles([...e.target.files]); setForm((f) => ({ ...f, video: [...f.video, ...urls] })); }} />
                  {form.video.length > 0 && <p className="text-xs text-emerald-400">{form.video.length} video(s) attached</p>}
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.anonymous} onChange={(e) => setForm((f) => ({ ...f, anonymous: e.target.checked }))} className="w-4 h-4 accent-primary" />
                  <span className="text-sm">Report anonymously (your name hidden from passenger)</span>
                </label>

                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" className="rounded-full flex-1" onClick={reset} disabled={busy}>Cancel</Button>
                  <Button type="submit" className="rounded-full flex-1" disabled={busy || !form.description.trim()}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Submit report
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}