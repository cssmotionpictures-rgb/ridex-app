import React from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Save, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

const TIMEZONES = ["Africa/Lagos", "Africa/Johannesburg", "Africa/Cairo", "Europe/London", "Europe/Madrid", "America/New_York", "America/Detroit", "Asia/Riyadh", "Asia/Tokyo", "UTC"];

const DEFAULT_REGISTRY = {
  apiFootball: { enabled: true, label: "API-Football" },
  sportmonks: { enabled: true, label: "Sportmonks" },
  sportradar: { enabled: false, label: "Sportradar" },
  openfootball: { enabled: true, label: "openfootball" },
};

// Admin dashboard for the model engine — change every threshold without
// touching code, and watch calibration: prediction history, hit rate, Brier
// score, log loss, performance by league / market / confidence bucket, and
// failed predictions.
export default function EngineAdminPanel({ onChanged }) {
  const { toast } = useToast();
  const [cfg, setCfg] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [stats, setStats] = React.useState(null);
  const [losses, setLosses] = React.useState([]);
  const [openCount, setOpenCount] = React.useState(null);
  const [providerHealth, setProviderHealth] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      const [rows, settled, openPicks] = await Promise.all([
        base44.entities.PredictionConfig.filter({ name: "global" }, "-updated_date", 1),
        base44.entities.EnginePick.filter({ status: { $in: ["win", "loss", "void"] } }, "-kickoff", 400),
        base44.entities.EnginePick.filter({ status: "open" }, "-kickoff", 100),
      ]);
      const row = rows?.[0] || {};
      let leagues = [];
      try { leagues = row.leagues ? JSON.parse(row.leagues) : []; } catch { leagues = []; }
      let parsedReg = {};
      try { parsedReg = row.provider_registry ? JSON.parse(row.provider_registry) : {}; } catch { parsedReg = {}; }
      const providerReg = {};
      for (const k of Object.keys(DEFAULT_REGISTRY)) providerReg[k] = { ...DEFAULT_REGISTRY[k], ...(parsedReg[k] || {}) };
      setCfg({ ...row, leaguesArr: leagues, providerReg });
      try {
        const h = await base44.functions.invoke("prediction-board", { action: "health" });
        setProviderHealth(h.data?.health || null);
      } catch {}
      const decided = (settled || []).filter((r) => r.status === "win" || r.status === "loss");
      const wins = decided.filter((r) => r.status === "win").length;
      const briers = (settled || []).filter((r) => typeof r.brier === "number").map((r) => r.brier);
      const logLosses = (settled || []).filter((r) => typeof r.log_loss === "number").map((r) => r.log_loss);
      const byKey = (list, keyFn) => {
        const m = {};
        for (const r of list) {
          const k = keyFn(r) || "—";
          if (!m[k]) m[k] = { total: 0, wins: 0 };
          m[k].total++;
          if (r.status === "win") m[k].wins++;
        }
        return Object.entries(m).map(([k, v]) => ({ key: k, ...v, rate: v.wins / v.total })).sort((a, b) => b.rate - a.rate);
      };
      setStats({
        samples: (settled || []).length,
        decided: decided.length,
        wins,
        hitRate: decided.length ? wins / decided.length : null,
        brierAvg: briers.length ? briers.reduce((a, b) => a + b, 0) / briers.length : null,
        logLossAvg: logLosses.length ? logLosses.reduce((a, b) => a + b, 0) / logLosses.length : null,
        byLeague: byKey(decided, (r) => r.league_name),
        byMarket: byKey(decided, (r) => r.market_label),
      });
      setLosses((settled || []).filter((r) => r.status === "loss").slice(0, 10));
      setOpenCount((openPicks || []).length);
    } catch (e) {
      setCfg(null);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  if (!cfg) {
    return (
      <div className="mt-3 rounded-2xl border border-border/60 bg-card px-4 py-6 flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading engine settings…
      </div>
    );
  }

  const setField = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const num = (k) => Number(cfg[k] ?? 0);

  const save = async () => {
    setSaving(true);
    try {
      const leagues = (cfg.leaguesArr || []).map((l) => ({ code: l.code, name: l.name, tier: Number(l.tier) || 2 }));
      await base44.entities.PredictionConfig.update(cfg.id, {
        timezone: cfg.timezone,
        min_probability: num("min_probability"),
        preferred_probability: num("preferred_probability"),
        min_quality_score: num("min_quality_score"),
        max_uncertainty: num("max_uncertainty"),
        min_agreement: num("min_agreement"),
        max_morning: num("max_morning"),
        max_evening: num("max_evening"),
        morning_start: num("morning_start"),
        evening_start: num("evening_start"),
        max_per_league: num("max_per_league"),
        min_games: num("min_games"),
        leagues: JSON.stringify(leagues),
        provider_registry: JSON.stringify(cfg.providerReg || {}),
      });
      toast({ title: "Engine settings saved", description: "The next board rebuild uses the new thresholds." });
      if (onChanged) onChanged();
    } catch (e) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, k, step = "any", hint }) => (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <Input
        type="number" step={step}
        className="h-8 rounded-lg text-xs"
        value={cfg[k] ?? ""}
        onChange={(e) => setField(k, e.target.value)}
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div className="mt-3 rounded-2xl border border-primary/30 bg-card p-4 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-primary">ENGINE ADMIN DASHBOARD</p>
        <div className="flex gap-2">
          <button onClick={load} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary text-[11px] font-semibold">
            <RefreshCw className="w-3 h-3" /> Reload
          </button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-50">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
          </button>
        </div>
      </div>

      {stats && stats.samples > 0 ? (
        <div className="rounded-xl bg-secondary/50 p-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Settled history: <span className="text-emerald-400 font-semibold">{stats.wins}/{stats.decided} won ({Math.round((stats.hitRate || 0) * 100)}%)</span>
            {stats.brierAvg != null && <> · Brier <span className="text-foreground font-semibold">{stats.brierAvg.toFixed(3)}</span></>}
            {stats.logLossAvg != null && <> · Log loss <span className="text-foreground font-semibold">{stats.logLossAvg.toFixed(3)}</span></>}
          </p>
          <p className="text-[10px] text-muted-foreground/70">Upcoming picks on the board: {openCount ?? "—"}</p>
          {stats.byLeague.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-2 mb-1">League performance</p>
              {stats.byLeague.map((r) => (
                <p key={r.key} className="text-[10px] flex justify-between"><span className="truncate">{r.key}</span><span className="text-foreground font-semibold">{r.wins}/{r.total} · {Math.round(r.rate * 100)}%</span></p>
              ))}
            </div>
          )}
          {stats.byMarket.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-2 mb-1">Market performance</p>
              {stats.byMarket.map((r) => (
                <p key={r.key} className="text-[10px] flex justify-between"><span className="truncate">{r.key}</span><span className="text-foreground font-semibold">{r.wins}/{r.total} · {Math.round(r.rate * 100)}%</span></p>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">No settled predictions yet — calibration data appears as matches finish.</p>
      )}

      <div className="rounded-xl bg-secondary/50 p-3 space-y-1.5">
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Data providers</p>
        {Object.entries(cfg.providerReg || {}).map(([k, p]) => {
          const h = providerHealth?.[k];
          const status = p.enabled === false ? "DISABLED" : (h?.status || "UNKNOWN");
          const statusCls = status === "ONLINE" ? "text-emerald-400"
            : status === "DISABLED" ? "text-muted-foreground/50"
            : status === "UNKNOWN" ? "text-muted-foreground"
            : "text-amber-400";
          return (
            <label key={k} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex items-center gap-2 min-w-0">
                <input
                  type="checkbox"
                  checked={p.enabled !== false}
                  onChange={(e) => setField("providerReg", { ...cfg.providerReg, [k]: { ...p, enabled: e.target.checked } })}
                />
                <span className="font-semibold text-foreground truncate">{p.label || k}</span>
                <span className={`font-bold ${statusCls}`}>{status}</span>
              </span>
              <span className="text-[9px] text-muted-foreground/70 shrink-0">
                {h?.requestsToday != null ? `${h.requestsToday} req today` : ""}
              </span>
            </label>
          );
        })}
        <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
          Coverage is verified live from actual provider responses, never assumed. Sportmonks activates automatically once its token is configured; Sportradar stays off until its paid key is added.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Min probability (0-1)" k="min_probability" hint="Default 0.72" />
        <Field label="Preferred probability" k="preferred_probability" />
        <Field label="Min quality score (0-100)" k="min_quality_score" hint="Default 70" />
        <Field label="Max uncertainty (0-1)" k="max_uncertainty" hint="Default 0.25" />
        <Field label="Min model agreement (0-1)" k="min_agreement" hint="Default 0.6" />
        <Field label="Min league games" k="min_games" hint="Default 4" />
        <Field label="Max morning picks" k="max_morning" />
        <Field label="Max evening picks" k="max_evening" />
        <Field label="Morning session start (hour)" k="morning_start" />
        <Field label="Evening session start (hour)" k="evening_start" />
        <Field label="Max picks per league / session" k="max_per_league" />
        <div className="space-y-1">
          <Label className="text-[11px]">Timezone</Label>
          <select
            className="h-8 w-full rounded-lg bg-background border border-input text-xs px-2"
            value={cfg.timezone || "Africa/Lagos"}
            onChange={(e) => setField("timezone", e.target.value)}
          >
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px]">Competitions scanned (global coverage from the provider)</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {(cfg.leaguesArr || []).map((l, i) => (
            <label key={l.code} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <input
                type="checkbox"
                checked={l.enabled !== false}
                onChange={(e) => setField("leaguesArr", cfg.leaguesArr.map((x, j) => j === i ? { ...x, enabled: e.target.checked } : x))}
              />
              <span className="truncate">{l.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1.5">Failed predictions (latest)</p>
        {losses.length === 0 ? (
          <p className="text-[10px] text-muted-foreground/70">None recorded yet.</p>
        ) : (
          <div className="space-y-1">
            {losses.map((r) => (
              <p key={r.id} className="text-[10px] flex justify-between gap-2">
                <span className="truncate text-muted-foreground">{r.home_team} vs {r.away_team} · {r.market_label}</span>
                <span className="text-red-400 font-semibold shrink-0">
                  {Math.round((r.probability || 0) * 100)}% · {r.actual_home_goals}-{r.actual_away_goals}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}