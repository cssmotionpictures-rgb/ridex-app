import React, { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { ensureVerticalSliceSlots, clearAssetCache, VERTICAL_SLICE_SLOTS } from "@/lib/characterAssetManifest";
import { loadCharacterReferences } from "@/lib/characterAssets";
import GameAssetSlot from "@/components/admin/GameAssetSlot";
import { Loader2, ShieldAlert, CheckCircle2, Link2, Wand2 } from "lucide-react";
import { Link } from "react-router-dom";

export default function AdminGameAssets() {
  const [records, setRecords] = useState(null);
  const [portraits, setPortraits] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const recs = await ensureVerticalSliceSlots();
      setRecords(recs);
    } catch (e) {
      setError("Could not load asset records: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load reference portraits from the master-sheet pack (for display only).
  useEffect(() => {
    loadCharacterReferences()
      .then((refs) => setPortraits(refs || []))
      .catch(() => setPortraits([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(async () => {
    clearAssetCache();
    await load();
  }, [load]);

  const playerRec = records?.find((r) => r.role === "player");
  const enemyRec = records?.find((r) => r.role === "enemy");
  const playerPortrait = portraits.find((p) => p.id === playerRec?.character_id)?.url;
  const enemyPortrait = enemyRec?.reference_portrait_url || "";

  const pHas = (r) => !!r && (!!r.model_3d_url || !!r.full_body_png_url);
  const pCombat = (r) => !!r && !!r.model_3d_url && ["COMBAT_READY", "PLAYABLE"].includes(r.combat_status);
  const allReady = pHas(playerRec) && pHas(enemyRec);
  const combatReady = pCombat(playerRec) && pCombat(enemyRec);

  return (
    <div className="space-y-6 pb-16">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold bronze-text font-heading tracking-wide">Game Asset Pipeline</h1>
          <p className="text-sm text-[#8a6d3b] mt-1">
            Upload full-body playable fighter assets. The vertical slice (Babatunde vs Corrupted Priest)
            cannot start until both slots are ready.
          </p>
        </div>
        <Link to="/admin" className="shrink-0 px-4 py-2 rounded-xl btn-noir-ghost text-sm font-semibold flex items-center gap-1.5">
          <Link2 className="w-4 h-4" /> Admin Home
        </Link>
      </header>

      {/* provider key status — keys are stored in Settings → Secrets, never in-app */}
      <div className="noir-panel rounded-2xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-[#d97757]" />
          <h2 className="text-sm font-bold text-[#d1a985] tracking-wide">Image-to-3D Provider Keys</h2>
        </div>
        <p className="text-[11px] text-[#8a6d3b] leading-snug">
          Provider keys are stored securely in <span className="text-[#f0d9a8] font-semibold">Settings → Secrets</span> and are only ever read
          server-side — they never reach the browser. Set <code className="text-[#d1a985]">TRELLIS_SERVER_URL</code> and
          <code className="text-[#d1a985]">TRELLIS_SERVER_KEY</code> for the self-hosted open-source generator (primary, $0/character),
          or <code className="text-[#d1a985]">TRIPO_API_KEY</code> / <code className="text-[#d1a985]">MESHY_API_KEY</code> for the optional cloud providers.
        </p>
        <div className="flex flex-wrap gap-3 text-[11px] pt-1">
          <span className="px-2.5 py-1 rounded-md border border-emerald-700/40 bg-emerald-950/30 text-emerald-300">
            TRELLIS.2 <span className="font-bold">●</span> primary · open-source, self-hosted, $0/character
          </span>
          <span className="px-2.5 py-1 rounded-md border border-amber-700/40 bg-amber-950/30 text-amber-200">
            Tripo <span className="font-bold">●</span> optional cloud · per-generation credits
          </span>
          <span className="px-2.5 py-1 rounded-md border border-amber-700/40 bg-amber-950/30 text-amber-200">
            Meshy <span className="font-bold">●</span> optional cloud · paid API key
          </span>
        </div>
      </div>

      {/* gate status banner */}
      <div className={`noir-panel rounded-2xl p-4 flex items-center gap-3 ${combatReady ? "border-emerald-700/40" : allReady ? "border-amber-700/40" : "border-red-800/40"}`}>
        {combatReady ? (
          <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
        ) : (
          <ShieldAlert className="w-6 h-6 text-red-400 shrink-0" />
        )}
        <div className="flex-1">
          <p className="font-bold text-sm text-[#f0d9a8]">
            {combatReady ? "3D combat ready — both fighters are COMBAT_READY and will fight." : allReady ? "Assets present but not combat-ready — 3D arena will show a NOT COMBAT-READY status." : "Combat is locked — required playable assets missing."}
          </p>
          <p className="text-[11px] text-[#8a6d3b] mt-0.5">
            {combatReady
              ? "Both GLBs are rigged, skinned and carry the full combat animation library. Launch the game to fight."
              : allReady
                ? "A GLB exists but is not yet COMBAT_READY (skeleton + skin + animations). Run the rig → skin → animation stages, then the arena will start combat."
                : "Upload a full-body transparent PNG (2.5D) or a rigged GLB/GLTF (3D) for each slot. Portraits and procedural placeholders are never used as fighters."}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/30 text-red-300 text-sm px-4 py-3">
          {error}
        </div>
      )}

      {loading || !records ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-[#d97757]" />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          <GameAssetSlot record={playerRec} portraitUrl={playerPortrait} onUpdated={refresh} />
          <GameAssetSlot record={enemyRec} portraitUrl={enemyPortrait} onUpdated={refresh} />
        </div>
      )}

      {/* spec reminders */}
      <div className="noir-panel rounded-2xl p-5 space-y-2.5">
        <h2 className="font-bold text-[#d1a985] text-sm tracking-wide">Asset Rules</h2>
        <ul className="text-[12px] text-[#8a6d3b] space-y-1.5 list-disc pl-5">
          <li>The official 17-character master sheet remains the identity reference for characters on it.</li>
          <li>A head-and-shoulders portrait is <span className="text-[#e07466] font-semibold">not</span> a playable fighter — it is reference only.</li>
          <li>For characters not on the sheet (e.g. Corrupted Priest), the approved visual design must be supplied here as a full-body asset before the fighter becomes playable.</li>
          <li>Do <span className="text-[#e07466] font-semibold">not</span> upload placeholders, stick figures, or mannequins. The arena will not spawn a fighter until a real full-body asset exists.</li>
          <li>Option A (best): a rigged <span className="text-[#d1a985] font-semibold">.GLB/.GLTF</span> 3D model. Option B (first prototype): a full-body transparent <span className="text-[#d1a985] font-semibold">.PNG</span> rendered as a 2.5D sprite.</li>
          <li>For the best GLB, feed the image-to-3D generator a <span className="text-[#d1a985] font-semibold">full-body reference</span> (not just the head-and-shoulders portrait) so TRELLIS.2 can capture clothing, proportions and body. Once one Babatunde GLB works, the same pipeline applies to all 17 characters.</li>
        </ul>
      </div>
    </div>
  );
}