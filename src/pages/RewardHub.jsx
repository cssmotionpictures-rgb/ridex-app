import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import PointsHeader from "@/components/rewards/PointsHeader";
import DailyCheckIn from "@/components/rewards/DailyCheckIn";
import WeeklyReward from "@/components/rewards/WeeklyReward";
import EarnPoints from "@/components/rewards/EarnPoints";
import BadgesGrid from "@/components/rewards/BadgesGrid";
import RewardCatalog from "@/components/rewards/RewardCatalog";
import Leaderboard from "@/components/rewards/Leaderboard";
import { getMyProfile, getLevel, recompute, saveProfile, weekKey } from "@/lib/rewards";

export default function RewardHub() {
  const [profile, setProfile] = React.useState(null);
  const [board, setBoard] = React.useState([]);
  const [meId, setMeId] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    const me = await base44.auth.me();
    setMeId(me.id);
    let p = await getMyProfile();
    // weekly reset when a new week starts
    const wk = weekKey();
    if ((p.week_key || "") !== wk) {
      p = await saveProfile(p.id, { week_key: wk, weekly_points: 0 });
    }
    // usage stats for activity-based badges
    const [rides, logistics, equipment, sold, carwash] = await Promise.all([
      base44.entities.Ride.filter({ created_by_id: me.id }).then((r) => r.length).catch(() => 0),
      base44.entities.LogisticsRequest.filter({ created_by_id: me.id }).then((r) => r.length).catch(() => 0),
      base44.entities.EquipmentRental.filter({ created_by_id: me.id }).then((r) => r.length).catch(() => 0),
      base44.entities.MarketplaceListing.filter({ created_by_id: me.id, status: "sold" }).then((r) => r.length).catch(() => 0),
      base44.entities.CarwashBooking.filter({ created_by_id: me.id }).then((r) => r.length).catch(() => 0),
    ]);
    const stats = { rides, logistics, equipment, sold, carwash, services: rides + logistics + equipment + carwash };
    // recompute badges/level if points changed outside the hub
    const rc = recompute(p, stats);
    if (JSON.stringify(rc.badges) !== JSON.stringify(p.badges || []) || rc.level !== p.level) {
      p = await saveProfile(p.id, rc);
    }
    setProfile(p);
    const all = await base44.entities.RewardProfile.list("-points", 20).catch(() => []);
    setBoard(all);
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-20 text-center text-muted-foreground">Loading your rewards…</div>;
  if (!profile) return null;

  const cur = getLevel(profile.points || 0);

  return (
    <div>
      <PageHeader eyebrow="Reward Hub" title="RIDE X Rewards" subtitle="Earn points, level up, unlock perks, and climb the leaderboard." />
      <PointsHeader profile={profile} />
      <div className="mt-4 rounded-3xl border border-border/60 bg-card p-6">
        <p className="text-sm font-semibold mb-2">{cur.emoji} {cur.name} benefits</p>
        <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
          {cur.benefits.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      </div>
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <DailyCheckIn profile={profile} onUpdate={setProfile} />
        <WeeklyReward profile={profile} onUpdate={setProfile} />
      </div>
      <div className="mt-4"><EarnPoints profile={profile} onUpdate={setProfile} /></div>
      <div className="mt-8"><BadgesGrid profile={profile} /></div>
      <div className="mt-8"><RewardCatalog profile={profile} onUpdate={setProfile} /></div>
      <div className="mt-8"><Leaderboard profiles={board} meId={meId} /></div>
    </div>
  );
}