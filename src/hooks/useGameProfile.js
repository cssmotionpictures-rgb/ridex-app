import { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { CHARACTERS } from "@/lib/forgottenOnesData";

const STARTER = "1,2,3,4,5";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function useGameProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (attempt = 0) => {
    try {
      const me = await base44.auth.me();
      const existing = await base44.entities.GameProfile.filter({ created_by_id: me.id });
      if (existing && existing.length) {
        const p = existing[0];
        // daily streak handling
        const today = todayStr();
        if (p.last_login_date !== today) {
          const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
          const streak = p.last_login_date === yesterday ? (p.login_streak || 0) + 1 : 1;
          const updated = await base44.entities.GameProfile.update(p.id, {
            login_streak: streak,
            last_login_date: today,
          });
          setProfile({ ...p, ...updated });
        } else {
          setProfile(p);
        }
      } else {
        const created = await base44.entities.GameProfile.create({
          player_name: me.full_name || me.email?.split("@")[0] || "Player",
          unlocked_characters: STARTER,
          active_character_id: 1,
          active_fighter_key: "babatunde",
          spirit_points: 100,
        });
        setProfile(created);
      }
    } catch (e) {
      // Auto-retry up to 3 times on transient errors (rate limits, network blips).
      if (attempt < 3) {
        setTimeout(() => load(attempt + 1), 1200 * (attempt + 1));
        return;
      }
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (patch) => {
    setProfile((prev) => prev ? { ...prev, ...patch } : prev);
    if (!profile) return;
    setSaving(true);
    try {
      const updated = await base44.entities.GameProfile.update(profile.id, patch);
      setProfile((prev) => prev ? { ...prev, ...updated } : updated);
    } catch (e) {
      // ignore — local state already reflects intent
    } finally {
      setSaving(false);
    }
  }, [profile]);

  const claimDaily = useCallback(async () => {
    if (!profile) return false;
    const today = todayStr();
    if (profile.last_daily_claim === today) return false;
    // Server-authoritative: the server validates the claim + applies the reward.
    try {
      const res = await base44.functions.invoke("submit-daily-claim", {});
      const data = res.data || {};
      if (!data.ok && data.error) return false;
      setProfile((prev) => prev ? { ...prev, spirit_points: data.spiritPoints, last_daily_claim: today } : prev);
      return data.reward;
    } catch (e) {
      return false;
    }
  }, [profile]);

  const activeCharacter = profile
    ? CHARACTERS.find((c) => c.id === (profile.active_character_id || 1)) || CHARACTERS[0]
    : null;

  return { profile, loading, saving, save, claimDaily, reload: load, activeCharacter };
}