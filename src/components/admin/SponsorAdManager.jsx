import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Pause, Play, Megaphone, TrendingUp, Eye, Mail, Send, CheckCircle2, XCircle, Settings2 } from "lucide-react";

const PLACEMENTS = ["any", "arcade", "movies", "music"];

export default function SponsorAdManager() {
  const [ads, setAds] = useState([]);
  const [leads, setLeads] = useState([]);
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ name: "", sponsor: "", industry: "", video_url: "", thumbnail_url: "", price_per_play: 50, budget: 10000, placement: "any" });
  const [leadForm, setLeadForm] = useState({ name: "", email: "", company: "", location: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [adList, leadList, ruleList] = await Promise.all([
        base44.entities.SponsorAd.list("-created_date", 200),
        base44.entities.SponsorLead.list("-created_date", 200),
        base44.entities.SponsorRule.list("-created_date", 5),
      ]);
      setAds(adList || []);
      setLeads(leadList || []);
      setRules(ruleList?.[0] || null);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Rules (singleton SponsorRule record) ──
  const saveRules = async () => {
    if (!rules) return;
    setSaving(true);
    try { await base44.entities.SponsorRule.update(rules.id, rules); } catch {}
    setSaving(false);
  };
  const ensureRules = async () => {
    if (rules) return rules;
    const created = await base44.entities.SponsorRule.create({
      min_budget: 5000, min_price: 25, allowed_industries: "food, fashion, events, tech, music, sports", auto_approve: true,
    });
    setRules(created);
    return created;
  };

  // ── Auto-approval check ──
  const evaluate = (r, price, budget, industry) => {
    if (!r || r.auto_approve === false) return false;
    const okBudget = Number(budget) >= (Number(r.min_budget) || 0);
    const okPrice = Number(price) >= (Number(r.min_price) || 0);
    const allowed = (r.allowed_industries || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const okIndustry = !allowed.length || allowed.some((a) => (industry || "").toLowerCase().includes(a));
    return okBudget && okPrice && okIndustry;
  };

  const addAd = async () => {
    if (!form.name || !form.video_url) return;
    setSaving(true);
    const r = await ensureRules();
    const auto = evaluate(r, form.price_per_play, form.budget, form.industry);
    try {
      await base44.entities.SponsorAd.create({
        name: form.name,
        sponsor: form.sponsor || "Unknown",
        industry: form.industry || "general",
        video_url: form.video_url,
        thumbnail_url: form.thumbnail_url || "",
        price_per_play: Number(form.price_per_play) || 50,
        budget: Number(form.budget) || 10000,
        remaining_budget: Number(form.budget) || 10000,
        placement: form.placement || "any",
        auto_approved: auto,
        plays: 0,
        revenue: 0,
        status: auto ? "active" : "pending",
      });
      setForm({ name: "", sponsor: "", industry: "", video_url: "", thumbnail_url: "", price_per_play: 50, budget: 10000, placement: "any" });
      load();
    } catch {}
    setSaving(false);
  };

  const setStatus = (a, status) => base44.entities.SponsorAd.update(a.id, { status }).then(load);
  const toggle = (a) => setStatus(a, a.status === "active" ? "paused" : "active");
  const remove = async (a) => { if (!confirm(`Delete "${a.name}"?`)) return; await base44.entities.SponsorAd.delete(a.id); load(); };

  const addLead = async () => {
    if (!leadForm.name || !leadForm.email) return;
    setSaving(true);
    try {
      await base44.entities.SponsorLead.create({
        name: leadForm.name, email: leadForm.email, company: leadForm.company || "Unknown", location: leadForm.location || "Nigeria", status: "pending",
      });
      setLeadForm({ name: "", email: "", company: "", location: "" });
      load();
    } catch {}
    setSaving(false);
  };
  const removeLead = async (l) => { await base44.entities.SponsorLead.delete(l.id); load(); };

  const sendEmails = async () => {
    setSending(true);
    try {
      const res = await base44.functions.invoke("send-sponsor-emails", {});
      const data = res?.data || res;
      alert(`Sent: ${data?.sent ?? 0} · Failed: ${data?.failed ?? 0}\n\nNote: emails only deliver to addresses that are registered app users, unless an external email provider is enabled on a paid plan.`);
      load();
    } catch (e) { alert("Send failed: " + (e?.message || "error")); }
    setSending(false);
  };

  const totalRevenue = ads.reduce((s, a) => s + (a.revenue || 0), 0);
  const totalPlays = ads.reduce((s, a) => s + (a.plays || 0), 0);
  const activeAds = ads.filter((a) => a.status === "active").length;

  const statusBadge = (s) => {
    const cls = s === "active" ? "bg-green-500/15 text-green-400" : s === "pending" ? "bg-amber-500/15 text-amber-400" : s === "rejected" ? "bg-red-500/15 text-red-400" : s === "expired" ? "bg-secondary text-muted-foreground" : "bg-secondary text-muted-foreground";
    return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cls}`}>{(s || "active").toUpperCase()}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
        <p className="text-xs text-muted-foreground">Sponsor ads play as real video creatives in the Arcade, Movies &amp; Music ad gates — you keep 100% of revenue, no AdMob. Set auto-approval rules below; ads that meet them go live instantly.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Sponsor revenue</p>
          <p className="text-2xl font-extrabold mt-1">₦{totalRevenue.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Eye className="w-3 h-3" /> Total plays</p>
          <p className="text-2xl font-extrabold mt-1">{totalPlays.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Megaphone className="w-3 h-3" /> Active ads</p>
          <p className="text-2xl font-extrabold mt-1">{activeAds}</p>
        </div>
      </div>

      {/* Auto-approval rules */}
      <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Settings2 className="w-4 h-4 text-primary" /> Auto-approval rules</h3>
        {!rules ? (
          <Button variant="outline" className="rounded-full" disabled={saving} onClick={async () => { await ensureRules(); }}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Create default rules</Button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Input type="number" placeholder="Min budget (₦)" value={rules.min_budget ?? 5000} onChange={(e) => setRules({ ...rules, min_budget: Number(e.target.value) })} />
            <Input type="number" placeholder="Min price/play (₦)" value={rules.min_price ?? 25} onChange={(e) => setRules({ ...rules, min_price: Number(e.target.value) })} />
            <Input className="col-span-2" placeholder="Allowed industries (comma separated)" value={rules.allowed_industries ?? ""} onChange={(e) => setRules({ ...rules, allowed_industries: e.target.value })} />
            <label className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={!!rules.auto_approve} onChange={(e) => setRules({ ...rules, auto_approve: e.target.checked })} />
              Auto-approve ads that meet all rules (otherwise they're held as Pending)
            </label>
            <Button className="rounded-full col-span-2" disabled={saving} onClick={saveRules}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Save rules</Button>
          </div>
        )}
      </div>

      {/* Add ad */}
      <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Plus className="w-4 h-4 text-primary" /> Add sponsor ad</h3>
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="Ad name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Sponsor name" value={form.sponsor} onChange={(e) => setForm({ ...form, sponsor: e.target.value })} />
          <Input placeholder="Industry (e.g. food, fashion)" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          <select className="rounded-xl bg-secondary border border-border px-3 text-sm h-10" value={form.placement} onChange={(e) => setForm({ ...form, placement: e.target.value })}>
            {PLACEMENTS.map((p) => <option key={p} value={p}>Placement: {p}</option>)}
          </select>
          <Input className="col-span-2" placeholder="Video URL (direct MP4)" value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} />
          <Input placeholder="Thumbnail URL (optional)" value={form.thumbnail_url} onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })} />
          <Input type="number" placeholder="Price per play (₦)" value={form.price_per_play} onChange={(e) => setForm({ ...form, price_per_play: e.target.value })} />
          <Input type="number" placeholder="Total budget (₦)" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
        </div>
        <Button className="rounded-full" disabled={saving || !form.name || !form.video_url} onClick={addAd}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add ad (auto-approves if rules met)
        </Button>
      </div>

      {/* Ad list */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : ads.length === 0 ? (
        <p className="text-center text-muted-foreground py-10">No sponsor ads yet.</p>
      ) : (
        <div className="space-y-2">
          {ads.map((a) => (
            <div key={a.id} className="rounded-2xl border border-border/60 bg-card p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[150px]">
                <p className="font-semibold flex items-center gap-2">{a.name} {a.auto_approved && <span className="text-[9px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded-full">AUTO</span>}</p>
                <p className="text-xs text-muted-foreground">{a.sponsor} · {a.industry || "general"} · {a.placement || "any"}</p>
              </div>
              <div className="text-xs text-muted-foreground flex gap-3 flex-wrap">
                <span>▶ {a.plays || 0}</span>
                <span className="text-primary">₦{(a.revenue || 0).toLocaleString()}</span>
                <span>₦{(a.remaining_budget ?? a.budget ?? 0).toLocaleString()} left</span>
              </div>
              {statusBadge(a.status)}
              <div className="flex gap-1.5">
                {a.status === "pending" && <Button size="sm" variant="outline" className="rounded-full h-8 px-3 text-xs" onClick={() => setStatus(a, "active")}><CheckCircle2 className="w-3.5 h-3.5" /> Approve</Button>}
                {a.status === "pending" && <Button size="sm" variant="outline" className="rounded-full h-8 px-3 text-xs text-destructive" onClick={() => setStatus(a, "rejected")}><XCircle className="w-3.5 h-3.5" /> Reject</Button>}
                {(a.status === "active" || a.status === "paused") && <Button size="sm" variant="outline" className="rounded-full h-8 px-3 text-xs" onClick={() => toggle(a)}>{a.status === "active" ? <><Pause className="w-3.5 h-3.5" /> Pause</> : <><Play className="w-3.5 h-3.5" /> Activate</>}</Button>}
                <Button size="sm" variant="ghost" className="rounded-full h-8 px-2 text-destructive" onClick={() => remove(a)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sponsor leads + email */}
      <div className="rounded-3xl border border-border/60 bg-card p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> Sponsor leads &amp; outreach</h3>
        <p className="text-xs text-muted-foreground">Add sponsor leads and send a personalised sponsorship request. Emails <b>only deliver to registered app users</b> unless an external email provider is enabled on a paid plan — unregistered addresses will show as failed.</p>
        <div className="grid grid-cols-2 gap-3">
          <Input placeholder="Name" value={leadForm.name} onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })} />
          <Input placeholder="Email" value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} />
          <Input placeholder="Company" value={leadForm.company} onChange={(e) => setLeadForm({ ...leadForm, company: e.target.value })} />
          <Input placeholder="Location" value={leadForm.location} onChange={(e) => setLeadForm({ ...leadForm, location: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-full" disabled={saving || !leadForm.name || !leadForm.email} onClick={addLead}><Plus className="w-4 h-4" /> Add lead</Button>
          <Button className="rounded-full" disabled={sending || !leads.length} onClick={sendEmails}>{sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send sponsorship emails</Button>
        </div>
        <div className="space-y-1.5 max-h-56 overflow-y-auto">
          {leads.length === 0 && <p className="text-xs text-muted-foreground">No leads yet.</p>}
          {leads.map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-xs rounded-xl border border-border/60 bg-secondary/40 px-3 py-2">
              <span className="flex-1 min-w-0"><b>{l.name}</b> · {l.company} · <span className="text-muted-foreground">{l.email}</span></span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${l.status === "sent" ? "bg-green-500/15 text-green-400" : l.status === "failed" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>{l.status}</span>
              <button onClick={() => removeLead(l)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}