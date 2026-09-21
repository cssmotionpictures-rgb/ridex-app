import React from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, KeyRound, Save, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

// PROVIDER KEY MANAGER — admin-only box under the Provider Status panel where
// the app's data-provider API keys (e.g. the Sportradar key) are pasted and
// stored. Only admins can see or save keys; the key itself is always masked
// (last 4 characters only) once saved.

const PROVIDERS = [
  { key: "sportradar", label: "Sportradar" },
  { key: "the_odds_api_1", label: "Odds API · Key 1" },
  { key: "the_odds_api_2", label: "Odds API · Key 2" },
  { key: "the_odds_api_3", label: "Odds API · Key 3" },
];

export default function ProviderKeyManager() {
  const [me, setMe] = React.useState(null);
  const [checked, setChecked] = React.useState(false);
  const [provider, setProvider] = React.useState(PROVIDERS[0].key);
  const [keys, setKeys] = React.useState({});
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    let live = true;
    base44.auth
      .me()
      .then((u) => live && setMe(u))
      .catch(() => {})
      .finally(() => live && setChecked(true));
    return () => {
      live = false;
    };
  }, []);

  const load = React.useCallback(async () => {
    try {
      const recs = await base44.entities.ProviderApiKey.list();
      const map = {};
      for (const r of recs) map[r.provider] = r;
      setKeys(map);
    } catch {}
  }, []);

  React.useEffect(() => {
    if (me?.role === "admin") load();
  }, [me, load]);

  // Not signed in or not an admin — the box never renders at all.
  if (!checked || me?.role !== "admin") return null;

  const saved = keys[provider];
  const masked = saved ? `••••••••${String(saved.api_key || "").slice(-4)}` : null;

  const save = async () => {
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      if (saved) {
        await base44.entities.ProviderApiKey.update(saved.id, {
          api_key: v,
          updated_by: me?.email || "",
        });
      } else {
        await base44.entities.ProviderApiKey.create({
          provider,
          api_key: v,
          updated_by: me?.email || "",
        });
      }
      setValue("");
      await load();
      toast({
        title: "Key saved",
        description: `${PROVIDERS.find((p) => p.key === provider)?.label || provider} key stored — only admins can view or change it.`,
      });
    } catch (e) {
      toast({
        title: "Could not save the key",
        description: e?.message || "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
          <KeyRound className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">PROVIDER KEYS</p>
          <p className="text-[10px] text-muted-foreground">
            Admin-only — paste a provider API key to connect its feed. Saved keys are stored securely and always shown masked.
          </p>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {PROVIDERS.map((p) => (
          <button
            key={p.key}
            onClick={() => setProvider(p.key)}
            className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
              provider === p.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Input
          type="password"
          autoComplete="off"
          placeholder={saved ? `Saved: ${masked} — paste a new key to replace` : "Paste the API key here"}
          className="h-9 rounded-lg text-xs flex-1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <button
          onClick={save}
          disabled={busy || !value.trim()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-[11px] font-bold disabled:opacity-50 shrink-0"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save
        </button>
      </div>

      {saved && (
        <p className="flex items-center gap-1.5 text-[10px] text-emerald-400">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          {PROVIDERS.find((p) => p.key === provider)?.label} key stored — {masked}
          {saved.updated_date ? ` · updated ${new Date(saved.updated_date).toLocaleDateString()}` : ""}
          {saved.updated_by ? ` by ${saved.updated_by}` : ""}
        </p>
      )}
    </div>
  );
}