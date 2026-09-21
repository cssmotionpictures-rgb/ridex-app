import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import AdminEntityTable from "@/components/admin/AdminEntityTable";
import AdminEditDialog from "@/components/admin/AdminEditDialog";
import { money } from "@/lib/pricing";
import { Gamepad2, Trophy, Gift, Users, Shield } from "lucide-react";

const EDIT_FIELDS = {
  GameProfile: [
    { key: "player_name", label: "Player name", type: "text" },
    { key: "level", label: "Level", type: "number" },
    { key: "xp", label: "XP", type: "number" },
    { key: "spirit_points", label: "Spirit Points", type: "number" },
    { key: "premium", label: "Premium", type: "boolean" },
    { key: "booster_battles", label: "Booster battles", type: "number" },
    { key: "battles_won", label: "Battles won", type: "number" },
    { key: "battles_lost", label: "Battles lost", type: "number" },
    { key: "highest_episode", label: "Highest episode", type: "number" },
    { key: "completed_levels", label: "Completed levels", type: "textarea" },
    { key: "unlocked_characters", label: "Unlocked characters", type: "text" },
    { key: "active_character_id", label: "Active character ID", type: "number" },
  ],
};

const E = base44.entities;

export default function AdminGame() {
  const [d, setD] = useState({ profiles: [], matches: [], gifts: [], chats: [] });
  const [edit, setEdit] = useState({ open: false, entity: null, record: null, fields: [] });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [profiles, matches, gifts, chats] = await Promise.all([
        E.GameProfile.list("-xp", 200).catch(() => []),
        E.GameMatch.list("-created_date", 200).catch(() => []),
        E.GameGift.list("-created_date", 100).catch(() => []),
        E.GameChat.list("-created_date", 100).catch(() => []),
      ]);
      setD({ profiles, matches, gifts, chats });
    } catch (e) {
      // non-critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openEdit = (entity, record) => setEdit({ open: true, entity, record, fields: EDIT_FIELDS[entity] || [] });
  const closeEdit = () => setEdit((s) => ({ ...s, open: false }));
  const upd = (entity, id, data) => E[entity].update(id, data).then(load);
  const del = (entity, id) => E[entity].delete(id).then(load);

  if (loading) return <p className="text-sm text-muted-foreground">Loading game data…</p>;

  const totalXp = d.profiles.reduce((s, p) => s + (p.xp || 0), 0);
  const totalBattles = d.profiles.reduce((s, p) => s + (p.battles_won || 0) + (p.battles_lost || 0), 0);
  const totalSp = d.profiles.reduce((s, p) => s + (p.spirit_points || 0), 0);
  const totalGiftVolume = d.gifts.reduce((s, g) => s + (g.amount || 0), 0);
  const totalCommission = d.gifts.reduce((s, g) => s + (g.commission || 0), 0);
  const validatedMatches = d.matches.filter((m) => m.validated !== false).length;
  const rejectedMatches = d.matches.filter((m) => m.validated === false).length;

  return (
    <div className="space-y-6">
      {/* Stats overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-primary"><Users className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wide">Players</span></div>
          <p className="text-2xl font-extrabold mt-1">{d.profiles.length}</p>
          <p className="text-[10px] text-muted-foreground">{totalXp.toLocaleString()} total XP</p>
        </div>
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-primary"><Trophy className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wide">Battles</span></div>
          <p className="text-2xl font-extrabold mt-1">{totalBattles}</p>
          <p className="text-[10px] text-muted-foreground">{validatedMatches} validated · {rejectedMatches} rejected</p>
        </div>
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-primary"><Gamepad2 className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wide">Spirit Points</span></div>
          <p className="text-2xl font-extrabold mt-1">{totalSp.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">in circulation</p>
        </div>
        <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-primary"><Gift className="w-4 h-4" /><span className="text-xs font-semibold uppercase tracking-wide">Gifts</span></div>
          <p className="text-2xl font-extrabold mt-1">{money(totalGiftVolume)}</p>
          <p className="text-[10px] text-muted-foreground">{money(totalCommission)} commission</p>
        </div>
      </div>

      {/* Player profiles */}
      <div>
        <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Player Profiles</h3>
        <AdminEntityTable
          rows={d.profiles}
          empty="No game profiles yet."
          columns={[
            { key: "player_name", label: "Player" },
            { key: "level", label: "Lv" },
            { key: "xp", label: "XP", render: (r) => (r.xp || 0).toLocaleString() },
            { key: "spirit_points", label: "SP", render: (r) => (r.spirit_points || 0).toLocaleString() },
            { key: "premium", label: "Premium", render: (r) => (r.premium ? "✓" : "—") },
            { key: "booster_battles", label: "Boost", render: (r) => r.booster_battles || 0 },
            { key: "battles_won", label: "Won" },
            { key: "battles_lost", label: "Lost" },
            { key: "highest_episode", label: "Ep" },
            { key: "created_date", label: "Joined", render: (r) => new Date(r.created_date).toLocaleDateString() },
          ]}
          actions={[
            { label: "Edit", onClick: (r) => openEdit("GameProfile", r) },
            { label: "Grant Premium", visible: (r) => !r.premium, onClick: (r) => upd("GameProfile", r.id, { premium: true }) },
            { label: "Revoke Premium", visible: (r) => r.premium, onClick: (r) => upd("GameProfile", r.id, { premium: false }) },
            { label: "+500 SP", onClick: (r) => upd("GameProfile", r.id, { spirit_points: (r.spirit_points || 0) + 500 }) },
            { label: "+5 Boosters", onClick: (r) => upd("GameProfile", r.id, { booster_battles: (r.booster_battles || 0) + 5 }) },
            { label: "Delete", variant: "destructive", onClick: (r) => del("GameProfile", r.id) },
          ]}
        />
      </div>

      {/* Combat audit log */}
      <div>
        <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Combat Audit Log</h3>
        <AdminEntityTable
          rows={d.matches}
          empty="No battles logged yet."
          columns={[
            { key: "result", label: "Result", status: true },
            { key: "character_id", label: "Char" },
            { key: "episode_id", label: "Ep" },
            { key: "level", label: "Lvl" },
            { key: "combo", label: "Combo" },
            { key: "duration_ms", label: "Duration", render: (r) => `${((r.duration_ms || 0) / 1000).toFixed(1)}s` },
            { key: "xp_awarded", label: "XP" },
            { key: "sp_awarded", label: "SP" },
            { key: "validated", label: "Valid", render: (r) => (r.validated === false ? "✗" : "✓") },
            { key: "rejection_reason", label: "Reason", render: (r) => r.rejection_reason || "—" },
            { key: "booster_used", label: "Boost", render: (r) => (r.booster_used ? "✓" : "—") },
            { key: "created_date", label: "When", render: (r) => new Date(r.created_date).toLocaleString() },
          ]}
          actions={[
            { label: "Delete", variant: "destructive", onClick: (r) => del("GameMatch", r.id) },
          ]}
        />
      </div>

      {/* Gifts (with 20% commission) */}
      <div>
        <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Player Gifts (20% Commission)</h3>
        <AdminEntityTable
          rows={d.gifts}
          empty="No gifts sent yet."
          columns={[
            { key: "sender_name", label: "From" },
            { key: "recipient_name", label: "To" },
            { key: "tier", label: "Tier", status: true },
            { key: "amount", label: "Amount", render: (r) => money(r.amount) },
            { key: "commission", label: "Commission", render: (r) => money(r.commission) },
            { key: "status", label: "Status", status: true },
            { key: "created_date", label: "When", render: (r) => new Date(r.created_date).toLocaleString() },
          ]}
          actions={[
            { label: "Delete", variant: "destructive", onClick: (r) => del("GameGift", r.id) },
          ]}
        />
      </div>

      {/* Arena chat moderation */}
      <div>
        <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">Arena Chat (Moderation)</h3>
        <AdminEntityTable
          rows={d.chats}
          empty="No chat messages."
          columns={[
            { key: "user_name", label: "User" },
            { key: "character_name", label: "Character" },
            { key: "message", label: "Message" },
            { key: "room", label: "Room", render: (r) => r.room || "global" },
            { key: "created_date", label: "When", render: (r) => new Date(r.created_date).toLocaleString() },
          ]}
          actions={[
            { label: "Delete", variant: "destructive", onClick: (r) => del("GameChat", r.id) },
          ]}
        />
      </div>

      <AdminEditDialog
        open={edit.open}
        onClose={closeEdit}
        entity={edit.entity}
        record={edit.record}
        fields={edit.fields}
        onSaved={load}
      />
    </div>
  );
}