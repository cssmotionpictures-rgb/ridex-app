import React from "react";
import { Settings2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/kala/Bits";
import { KALA_DEFAULTS, saveKalaSettings } from "@/lib/kala";

const NUM_FIELDS = [
  ["min_confidence", "Minimum confidence (%)", 60, 95],
  ["min_edge_pct", "Minimum edge (pp)", -5, 20],
  ["min_odds", "Minimum odds", 1.01, 20],
  ["max_odds", "Maximum odds", 1.5, 100],
  ["daily_picks", "Daily picks (Top N)", 1, 8],
  ["paper_stake", "Paper stake (₦)", 100, 100000],
  ["cashout_weakest_leg_pct", "Rule A · weakest leg below (%)", 10, 60],
  ["cashout_high_risk_legs", "Rule B · high-risk legs ≥", 1, 5],
  ["cashout_prob_drop_pct", "Rule C · estimate drop ≥ (pp)", 5, 50],
  ["cashout_value_pct", "Rule D · cashout ≥ % of value", 40, 100],
];
const BOOL_FIELDS = [
  ["morning_enabled", "Morning scan"],
  ["evening_enabled", "Evening scan"],
  ["rollover_enabled", "5-day rollover"],
];

// KALA SETTINGS — conservative defaults, per-user. These gate what KALA SHOWS
// (filters, Top-N, cashout rules); the engine's core quality gate is fixed by
// design and cannot be loosened from settings.
export default function SettingsSection({ settings, onSaved }) {
  const [values, setValues] = React.useState(settings?.values || KALA_DEFAULTS);
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const num = (k) => (v) => {
    const n = Number(v);
    setValues((s) => ({ ...s, [k]: isNaN(n) ? KALA_DEFAULTS[k] : n }));
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    try {
      await saveKalaSettings(settings?.id || null, values);
      setSaved(true);
      if (onSaved) onSaved(values);
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-xl bg-secondary border border-border px-3 py-2 text-sm";

  return (
    <SectionCard
      title="KALA SETTINGS"
      icon={<Settings2 className="w-4 h-4 text-primary" />}
      sub="Your conservative defaults. They filter what KALA displays and drive the cashout auto-rules — they never weaken the engine's fixed quality gates."
    >
      <div className="grid sm:grid-cols-2 gap-3">
        {NUM_FIELDS.map(([k, label]) => (
          <label key={k} className="space-y-1">
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <input className={input} inputMode="decimal" value={values[k]} onChange={(e) => num(k)(e.target.value)} />
          </label>
        ))}
        <label className="space-y-1">
          <span className="text-[11px] text-muted-foreground">Risk tolerance</span>
          <select className={input} value={values.risk_tolerance} onChange={(e) => { setValues((s) => ({ ...s, risk_tolerance: e.target.value })); setSaved(false); }}>
            <option value="conservative">Conservative</option>
            <option value="medium">Medium</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </label>
        {BOOL_FIELDS.map(([k, label]) => (
          <div key={k} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 border border-border px-3.5 py-2.5">
            <span className="text-xs font-semibold">{label}</span>
            <button
              type="button"
              onClick={() => { setValues((s) => ({ ...s, [k]: !s[k] })); setSaved(false); }}
              className={`w-11 h-6 rounded-full transition-colors relative ${values[k] ? "bg-primary" : "bg-border"}`}
              aria-label={label}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-background transition-all ${values[k] ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button className="rounded-full font-bold" onClick={save} disabled={busy}>
          <Save className="w-4 h-4 mr-1" /> {busy ? "Saving…" : "SAVE SETTINGS"}
        </Button>
        {saved && <span className="text-[11px] text-emerald-300">Saved.</span>}
      </div>
      <p className="text-[10px] text-muted-foreground">
        BIG HAMMER minimum odds 3.00 is a hard rule and cannot be changed. PAPER MODE is the default tracking mode — KALA never connects to real-money betting.
      </p>
    </SectionCard>
  );
}