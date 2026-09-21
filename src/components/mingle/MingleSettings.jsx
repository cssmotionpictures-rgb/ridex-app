import React from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { ShieldCheck, Heart, EyeOff, MapPin, Ban, Trash2, Phone } from "lucide-react";
import * as api from "@/lib/mingle/api";
import { PREMIUM_RANGE_KM, FREE_RANGE_KM } from "@/lib/mingle/core";

export default function MingleSettings({ user, profile, onProfileChange, profilesById, onDeleted }) {
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [blocks, setBlocks] = React.useState([]);

  const loadBlocks = React.useCallback(async () => {
    const rows = await base44.entities.MingleBlock.filter({ blocker_id: user.id }).catch(() => []);
    setBlocks(rows || []);
  }, [user.id]);
  React.useEffect(() => { loadBlocks(); }, [loadBlocks]);

  const patch = async (p, msg) => {
    try {
      await api.updateProfile(profile.id, p);
      onProfileChange(p);
      if (msg) toast({ title: msg });
    } catch { toast({ title: "Change failed — try again." }); }
  };

  const pauseToggle = () => {
    const next = profile.status === "active" ? "paused" : "active";
    patch({ status: next },
      next === "paused"
        ? "Mingle paused — you're instantly hidden from discovery and alerts."
        : "Mingle resumed — you're discoverable again.");
  };

  const del = async () => {
    setConfirmDelete(false);
    await patch({ status: "deleted" });
    await api.heartbeat(user, { coords: null }).catch(() => {});
    toast({ title: "Mingle profile deleted", description: "You were removed from discovery immediately." });
    onDeleted();
  };

  const unblock = async (rowId) => {
    try {
      await base44.entities.MingleBlock.delete(rowId);
      loadBlocks();
      toast({ title: "Unblocked" });
    } catch { toast({ title: "Could not unblock — try again." }); }
  };

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <div className="rounded-3xl border border-primary/25 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /><h3 className="font-semibold text-sm">Privacy & consent</h3></div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Nearby discovery</p>
              <p className="text-[11px] text-muted-foreground">Approximate location only — your exact location is never shown to other Mingle users.</p>
            </div>
          </div>
          <Button size="sm" variant={profile.discovery_enabled ? "outline" : "default"} className="rounded-full shrink-0"
            onClick={() => patch({ discovery_enabled: !profile.discovery_enabled }, "Discovery updated.")}>
            {profile.discovery_enabled ? "On" : "Off"}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <EyeOff className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Show online status</p>
              <p className="text-[11px] text-muted-foreground">Off hides your online/recently-active status completely.</p>
            </div>
          </div>
          <Button size="sm" variant={profile.show_online_status ? "outline" : "default"} className="rounded-full shrink-0"
            onClick={() => patch({ show_online_status: !profile.show_online_status }, "Online status updated.")}>
            {profile.show_online_status ? "Shown" : "Hidden"}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Phone className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Voice & video calls</p>
              <p className="text-[11px] text-muted-foreground">Calls stay in-app; your number is never shared.</p>
            </div>
          </div>
          {profile.call_consent_at ? (
            <Button size="sm" variant="outline" className="rounded-full shrink-0" disabled>Consented</Button>
          ) : (
            <Button size="sm" className="rounded-full shrink-0"
              onClick={() => patch({ call_consent_at: new Date().toISOString() }, "Call consent saved — you can accept calls and start them after a mutual match.")}>
              Accept terms
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-primary/25 bg-card p-5 space-y-3">
        <div className="flex items-center gap-2"><Heart className="w-4 h-4 text-primary" /><h3 className="font-semibold text-sm">Mingle Plus</h3></div>
        <p className="text-xs text-muted-foreground">
          {profile.premium
            ? `Active — expanded ${PREMIUM_RANGE_KM}km discovery range.`
            : `Standard ${FREE_RANGE_KM}km discovery range. Mingle Plus (expanded range, premium visibility) activates through RideX payments in the Plus rollout — Block & Report are always free.`}
        </p>
      </div>

      <div className="rounded-3xl border border-primary/25 bg-card p-5 space-y-3">
        <div className="flex items-center gap-2"><Ban className="w-4 h-4 text-primary" /><h3 className="font-semibold text-sm">Blocked members ({blocks.length})</h3></div>
        {blocks.length === 0 && <p className="text-xs text-muted-foreground">Nobody blocked.</p>}
        {blocks.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-2">
            <p className="text-sm truncate">{profilesById[b.blocked_id]?.display_name || "Mingle member"}</p>
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => unblock(b.id)}>Unblock</Button>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 space-y-3">
        <h3 className="font-semibold text-sm">Account safety</h3>
        <Button variant="outline" className="rounded-full w-full" onClick={pauseToggle}>
          {profile.status === "active" ? "Pause Mingle" : "Resume Mingle"}
        </Button>
        <p className="text-[11px] text-muted-foreground">Pausing instantly removes you from discovery and stops proximity alerts; your existing matches are preserved.</p>
        {confirmDelete ? (
          <div className="space-y-2 rounded-2xl border border-destructive/40 p-3">
            <p className="text-xs">Delete your Mingle profile? You're removed from discovery immediately. This does not affect your RideX account or rides.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="rounded-full flex-1" onClick={() => setConfirmDelete(false)}>Keep profile</Button>
              <Button size="sm" variant="destructive" className="rounded-full flex-1" onClick={del}>Delete Mingle</Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="rounded-full w-full text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="w-4 h-4 mr-1" /> Delete Mingle profile
          </Button>
        )}
      </div>
    </div>
  );
}