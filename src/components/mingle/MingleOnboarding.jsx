import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Heart, ShieldCheck, Camera } from "lucide-react";
import { createProfile, uploadChatImage } from "@/lib/mingle/api";
import { MIN_AGE } from "@/lib/mingle/core";

const GOALS = ["dating", "friends", "networking"];

export default function MingleOnboarding({ me, onCreated }) {
  const [f, setF] = React.useState({
    display_name: "", age: "", gender: "female", seeking: "male",
    min_age: MIN_AGE, max_age: 60, interests: "", goal: "dating", bio: "", area_label: "",
  });
  const [photoUrl, setPhotoUrl] = React.useState("");
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoBusy(true);
    try { setPhotoUrl(await uploadChatImage(file)); } catch { setErr("Photo upload failed — try again."); }
    setPhotoBusy(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    const age = Number(f.age);
    if (age < MIN_AGE) { setErr("RideX Mingle is for adults only (18+)."); return; }
    if (!f.display_name.trim()) { setErr("Choose a display name."); return; }
    setBusy(true);
    try {
      const p = await createProfile(me, { ...f, photo_url: photoUrl });
      onCreated(p);
    } catch (e2) {
      setErr(e2?.message || "Could not create your profile.");
    }
    setBusy(false);
  };

  return (
    <div className="max-w-lg mx-auto rounded-3xl border border-primary/25 bg-card p-6 space-y-5 animate-fade-in">
      <div className="flex items-center gap-2">
        <Heart className="w-5 h-5 text-primary" />
        <h2 className="font-heading font-bold text-lg">Join RideX Mingle</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Adults only (18+). You choose who can discover you — your exact location, phone number and email
        are never shown to other Mingle members, and nothing is shared automatically.
      </p>

      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-secondary overflow-hidden flex items-center justify-center border border-border">
          {photoUrl ? <img src={photoUrl} alt="Profile" className="w-full h-full object-cover" /> : <Camera className="w-5 h-5 text-muted-foreground" />}
        </div>
        <div>
          <Label className="text-xs">Profile photo (optional)</Label>
          <div className="flex items-center gap-2 mt-1">
            <label className="text-xs px-3 py-1.5 rounded-full border border-border cursor-pointer hover:bg-secondary">
              {photoBusy ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "Choose photo"}
              <input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
            </label>
            {photoUrl && <button className="text-xs text-muted-foreground underline" onClick={() => setPhotoUrl("")}>remove</button>}
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label className="text-xs">Display name</Label>
          <Input className="rounded-xl mt-1" value={f.display_name} onChange={set("display_name")} placeholder="How members will see you" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Your age ({MIN_AGE}+)</Label>
            <Input className="rounded-xl mt-1" type="number" min={MIN_AGE} max={99} value={f.age} onChange={set("age")} />
          </div>
          <div>
            <Label className="text-xs">I am</Label>
            <select className="w-full h-9 rounded-xl bg-background border border-input px-2 text-sm mt-1" value={f.gender} onChange={set("gender")}>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Open to</Label>
            <select className="w-full h-9 rounded-xl bg-background border border-input px-2 text-sm mt-1" value={f.seeking} onChange={set("seeking")}>
              <option value="female">Women</option>
              <option value="male">Men</option>
              <option value="everyone">Everyone</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Min age</Label>
            <Input className="rounded-xl mt-1" type="number" min={MIN_AGE} value={f.min_age} onChange={set("min_age")} />
          </div>
          <div>
            <Label className="text-xs">Max age</Label>
            <Input className="rounded-xl mt-1" type="number" max={99} value={f.max_age} onChange={set("max_age")} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Looking for</Label>
          <select className="w-full h-9 rounded-xl bg-background border border-input px-2 text-sm mt-1" value={f.goal} onChange={set("goal")}>
            {GOALS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Interests (comma separated — shared interests raise match strength)</Label>
          <Input className="rounded-xl mt-1" value={f.interests} onChange={set("interests")} placeholder="music, food, travel" />
        </div>
        <div>
          <Label className="text-xs">Your general area (shown as text only — never a map point)</Label>
          <Input className="rounded-xl mt-1" value={f.area_label} onChange={set("area_label")} placeholder="e.g. Lagos Island" />
        </div>
        <div>
          <Label className="text-xs">Short bio</Label>
          <Input className="rounded-xl mt-1" value={f.bio} onChange={set("bio")} placeholder="One or two honest lines" />
        </div>

        <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
          <p>
            Your exact location is never shown to other Mingle users — discovery uses coarse areas only.
            You can pause or delete Mingle at any time from settings. Nothing is ever shared with your ride bookings.
          </p>
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <Button className="w-full rounded-full h-11 font-semibold" disabled={busy} type="submit">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Activate Mingle"}
        </Button>
      </form>
    </div>
  );
}