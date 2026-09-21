import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { CHARACTERS } from "@/lib/forgottenOnesData";

const STALE_MS = 60000; // a player is "online" if heartbeat within 60s

// Manages the current user's presence (heartbeat + status) and lists who's online,
// live-updated via the GamePresence realtime subscription.
export function useGamePresence(profile) {
  const [online, setOnline] = useState([]);
  const [me, setMe] = useState(null);
  const presenceIdRef = useRef(null);

  const refresh = async () => {
    try {
      const all = await base44.entities.GamePresence.list("-last_heartbeat", 100);
      const now = Date.now();
      setOnline(all.filter((p) => {
        const hb = p.last_heartbeat ? new Date(p.last_heartbeat).getTime() : 0;
        return now - hb < STALE_MS;
      }));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    let heartbeat;
    let unsub;
    let cancelled = false;
    (async () => {
      try {
        const user = await base44.auth.me();
        if (cancelled) return;
        setMe(user);
        const charId = profile?.active_character_id || 1;
        const char = CHARACTERS.find((c) => c.id === charId);
        const payload = {
          user_id: user.id,
          user_name: user.full_name || user.email || "Seeker",
          character_id: charId,
          character_name: char?.name || "",
          status: "online",
          last_heartbeat: new Date().toISOString(),
        };
        const existing = await base44.entities.GamePresence.filter({ user_id: user.id });
        if (existing.length) {
          presenceIdRef.current = existing[0].id;
          await base44.entities.GamePresence.update(existing[0].id, payload);
        } else {
          const r = await base44.entities.GamePresence.create(payload);
          presenceIdRef.current = r.id;
        }
        await refresh();
        heartbeat = setInterval(async () => {
          if (presenceIdRef.current) {
            await base44.entities.GamePresence.update(presenceIdRef.current, { last_heartbeat: new Date().toISOString() }).catch(() => {});
          }
          await refresh();
        }, 15000);
        unsub = base44.entities.GamePresence.subscribe(() => { refresh(); });
      } catch { /* not logged in */ }
    })();
    return () => {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      if (unsub) unsub();
      // mark offline by stale heartbeat so the player drops from the list
      if (presenceIdRef.current) {
        base44.entities.GamePresence.update(presenceIdRef.current, { last_heartbeat: new Date(Date.now() - STALE_MS * 3).toISOString() }).catch(() => {});
      }
    };
  }, [profile?.active_character_id]);

  const setStatus = async (status) => {
    if (presenceIdRef.current) await base44.entities.GamePresence.update(presenceIdRef.current, { status }).catch(() => {});
  };

  const onlineCount = online.filter((p) => p.user_id !== me?.id).length;
  return { online, me, onlineCount, setStatus };
}