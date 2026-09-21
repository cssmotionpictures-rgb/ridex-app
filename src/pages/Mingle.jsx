import React from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Loader2, Heart, MessageCircle, Settings2, MapPin } from "lucide-react";
import { useWebRTCCall } from "@/hooks/useWebRTCCall";
import MingleOnboarding from "@/components/mingle/MingleOnboarding";
import DiscoverTab from "@/components/mingle/DiscoverTab";
import MatchesTab from "@/components/mingle/MatchesTab";
import ChatView from "@/components/mingle/ChatView";
import CallOverlay from "@/components/mingle/CallOverlay";
import MingleSettings from "@/components/mingle/MingleSettings";
import * as api from "@/lib/mingle/api";
import { zoneOf } from "@/lib/mingle/core";

// RIDEX MINGLE — the privacy-first real-time social layer. Presence is
// ephemeral (self-expiring coarse zones), discovery is consent-gated on both
// sides, and voice/video run in-app over WebRTC — never through phone numbers.
export default function Mingle() {
  const { toast } = useToast();
  const [user, setUser] = React.useState(null);
  const [profile, setProfile] = React.useState(undefined); // undefined = still loading
  const [tab, setTab] = React.useState("discover");
  const [cards, setCards] = React.useState([]);
  const [zones, setZones] = React.useState([]);
  const [matches, setMatches] = React.useState([]);
  const [profilesById, setProfilesById] = React.useState({});
  const [presenceByUser, setPresenceByUser] = React.useState({});
  const [myCoords, setMyCoords] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [activeMatchId, setActiveMatchId] = React.useState(null);
  const [callConsentPending, setCallConsentPending] = React.useState(null);
  const alertedRef = React.useRef(new Set());
  const prevCountRef = React.useRef(-1);
  const call = useWebRTCCall(user && profile ? { ...user, name: profile.display_name } : user);

  React.useEffect(() => {
    base44.auth.me().then(async (u) => {
      setUser(u);
      const p = await api.getMyProfile(u).catch(() => null);
      setProfile(p);
    }).catch(() => setUser(null));
    navigator.geolocation?.getCurrentPosition(
      (pos) => setMyCoords([pos.coords.latitude, pos.coords.longitude]),
      () => setMyCoords(null),
      { timeout: 8000 }
    );
  }, []);

  const refresh = React.useCallback(async () => {
    if (!user || !profile) return;
    setBusy(true);
    try {
      const myZone = myCoords ? zoneOf(myCoords[0], myCoords[1], user.id) : null;
      const { cards: c, presences } = await api.loadDiscovery(user, profile, myZone);
      setCards(c);
      setZones(api.zonesOfCompatible(c, presences));
      setPresenceByUser(Object.fromEntries((presences || []).map((p) => [p.user_id, p])));
      const [ms, allProfiles] = await Promise.all([
        api.loadMatches(user),
        base44.entities.MingleProfile.filter({}, null, 500).catch(() => []),
      ]);
      setMatches(ms || []);
      setProfilesById(Object.fromEntries((allProfiles || []).map((p) => [p.user_id, p])));
      if (prevCountRef.current >= 0 && c.length > prevCountRef.current && tab === "discover") {
        toast({ title: "💜 Someone compatible is nearby.", description: "Open Discover to view their profile." });
      }
      prevCountRef.current = c.length;
    } catch { /* transient read — the next heartbeat retries */ }
    setBusy(false);
  }, [user, profile, myCoords, tab, toast]);

  // Presence heartbeat — the coarse zone is computed in the browser; raw GPS
  // never leaves it. Discovery refresh rides the same 60s tick.
  React.useEffect(() => {
    if (!user || !profile || profile.status !== "active") return;
    let cancelled = false;
    const tick = async () => {
      if (!myCoords || !profile.discovery_enabled || !profile.nearby_consent_at) return;
      await api.heartbeat(user, { coords: myCoords, status: "DISCOVERABLE", areaLabel: profile.area_label }).catch(() => {});
      if (!cancelled) refresh();
    };
    tick();
    const t = setInterval(tick, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, [user, profile?.id, profile?.status, profile?.discovery_enabled, profile?.nearby_consent_at, myCoords, refresh]);

  // Pause/delete instantly removes live presence
  React.useEffect(() => {
    if (user && profile && profile.status !== "active") api.heartbeat(user, { coords: null }).catch(() => {});
  }, [user?.id, profile?.status]);

  // Real-time alerts: someone liked you / a match was created
  React.useEffect(() => {
    if (!user || !profile) return;
    const unL = api.subscribeLikes((ev) => {
      const d = ev?.data || {};
      if (d.target_user_id === user.id && d.action === "LIKE" && d.user_id !== user.id && !alertedRef.current.has(ev.id)) {
        alertedRef.current.add(ev.id);
        toast({ title: "❤️ Someone liked your profile." });
      }
    });
    const unM = api.subscribeMatches((ev) => {
      const d = ev?.data || {};
      if ((d.members || []).includes(user.id) && !alertedRef.current.has(ev.id)) {
        alertedRef.current.add(ev.id);
        toast({ title: "💜 It's a match!", description: "Chat, voice and video are now open." });
        refresh();
      }
    });
    return () => { try { unL(); } catch {} try { unM(); } catch {} };
  }, [user?.id, profile?.id, refresh, toast]);

  // Presence follows the call state (IN_CALL hides you from Nearby honestly)
  React.useEffect(() => {
    if (!user) return;
    if (["ringing", "connecting", "connected"].includes(call.status)) api.setPresenceStatus(user, "IN_CALL").catch(() => {});
    else if (["ended", "declined"].includes(call.status)) api.setPresenceStatus(user, "DISCOVERABLE").catch(() => {});
  }, [call.status, user?.id]);

  const activeMatch = matches.find((m) => m.id === activeMatchId) || null;

  const startCall = async (partner, type) => {
    if (!profile.call_consent_at) { setCallConsentPending([partner, type]); return; }
    const blocks = await base44.entities.MingleBlock.filter({}).catch(() => []);
    const guard = await api.callGuardInputs(user, partner.user_id, activeMatch, blocks, blocks, profile);
    if (!guard.ok) { toast({ title: "Call unavailable", description: guard.reason }); return; }
    call.startCall({ user_id: partner.user_id, user_name: partner.display_name }, type);
  };

  const acceptCallConsent = async () => {
    const pending = callConsentPending;
    setCallConsentPending(null);
    if (!pending) return;
    try {
      await api.updateProfile(profile.id, { call_consent_at: new Date().toISOString() });
      setProfile((p) => ({ ...p, call_consent_at: new Date().toISOString() }));
      toast({ title: "Calls enabled", description: "Calls are private between matched users — you can decline, block or report at any time." });
      startCall(pending[0], pending[1]);
    } catch { toast({ title: "Could not save consent — try again." }); }
  };

  const act = async (card, action) => {
    setCards((prev) => prev.filter((c) => c.user_id !== card.user_id));
    try {
      const res = await api.recordLike(user, card.user_id, action);
      if (res?.matched) {
        toast({ title: "💜 IT'S A MATCH!", description: `You and ${card.display_name} can now chat inside RideX.` });
        setTab("matches");
        refresh();
      }
    } catch { toast({ title: "Action failed — try again." }); }
  };

  const allowNearby = async () => {
    try {
      await api.updateProfile(profile.id, { nearby_consent_at: new Date().toISOString() });
      setProfile((p) => ({ ...p, nearby_consent_at: new Date().toISOString() }));
    } catch { toast({ title: "Could not save consent — try again." }); }
  };

  const blockActivePartner = async () => {
    if (!activeMatch) return;
    const partnerId = (activeMatch.members || []).find((x) => x !== user.id);
    await api.blockUser(user, partnerId).catch(() => {});
    toast({ title: "Blocked", description: "Communication stopped immediately." });
    setActiveMatchId(null);
    refresh();
  };

  if (user === null || profile === undefined) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile || profile.status === "deleted") {
    return (
      <div>
        <PageHeader eyebrow="Ride X" title="Mingle" subtitle="Opt in to discover compatible people — privately, safely, on your terms." />
        <MingleOnboarding me={user} onCreated={(p) => { setProfile(p); prevCountRef.current = -1; }} />
      </div>
    );
  }

  const nearbyOn = !!profile.nearby_consent_at && profile.discovery_enabled;
  const activeMatchCount = matches.filter((m) => m.status === "ACTIVE").length;

  return (
    <div>
      <PageHeader eyebrow="Ride X" title="Mingle" subtitle="Discover compatible people nearby — your exact location is never shown to other members." />

      <div className="flex gap-2 mb-5">
        {[
          ["discover", "Discover", <MapPin key="d" className="w-3.5 h-3.5" />],
          ["matches", `Matches${activeMatchCount ? ` (${activeMatchCount})` : ""}`, <MessageCircle key="m" className="w-3.5 h-3.5" />],
          ["settings", "Settings", <Settings2 key="s" className="w-3.5 h-3.5" />],
        ].map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => { setTab(key); if (key !== "matches") setActiveMatchId(null); }}
            className={`px-4 py-2 rounded-full text-xs inline-flex items-center gap-1.5 border transition-colors ${tab === key ? "bg-primary text-primary-foreground border-primary font-semibold" : "border-border text-muted-foreground"}`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === "discover" && (
        !nearbyOn ? (
          <div className="max-w-lg mx-auto rounded-3xl border border-primary/25 bg-card p-6 space-y-4 animate-fade-in">
            <div className="flex items-center gap-2"><MapPin className="w-5 h-5 text-primary" /><h3 className="font-heading font-bold">Nearby discovery</h3></div>
            <p className="text-sm text-muted-foreground">
              RideX uses your <span className="text-foreground font-medium">approximate</span> location to find compatible
              people nearby. Your exact location is never shown to other Mingle users.
            </p>
            {!profile.discovery_enabled && <p className="text-xs text-muted-foreground">Discovery is currently switched off in Settings.</p>}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" className="rounded-full h-11" onClick={() => setTab("settings")}>NOT NOW</Button>
              <Button className="rounded-full h-11 font-semibold" onClick={allowNearby} disabled={!profile.discovery_enabled}>ALLOW NEARBY DISCOVERY</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">You can pause or switch this off at any time. Location permission is optional — Mingle still works for browsing and matched chat without it.</p>
          </div>
        ) : (
          <DiscoverTab cards={cards} zones={zones} myCoords={myCoords} busy={busy} onLike={(c) => act(c, "LIKE")} onPass={(c) => act(c, "PASS")} onRefresh={refresh} />
        )
      )}

      {tab === "matches" && (
        activeMatch ? (
          (() => {
            const partnerId = (activeMatch.members || []).find((x) => x !== user.id);
            return (
              <ChatView
                user={user}
                profile={profile}
                match={activeMatch}
                partner={profilesById[partnerId] || null}
                partnerPresence={presenceByUser[partnerId] || null}
                onBack={() => setActiveMatchId(null)}
                onCall={startCall}
              />
            );
          })()
        ) : (
          <MatchesTab matches={matches} profilesById={profilesById} presenceByUser={presenceByUser} user={user} onOpen={(m) => setActiveMatchId(m.id)} />
        )
      )}

      {tab === "settings" && (
        <MingleSettings
          user={user}
          profile={profile}
          profilesById={profilesById}
          onProfileChange={(p) => setProfile((prev) => ({ ...prev, ...p }))}
          onDeleted={() => { setProfile(null); prevCountRef.current = -1; }}
        />
      )}

      <CallOverlay call={call} onBlock={blockActivePartner} />

      {callConsentPending && (
        <div className="fixed inset-0 z-[950] bg-black/60 flex items-center justify-center p-4" onClick={() => setCallConsentPending(null)}>
          <div className="rounded-3xl bg-card border border-border p-5 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2"><Heart className="w-4 h-4 text-primary" /><p className="font-semibold text-sm">Before your first call</p></div>
            <p className="text-xs text-muted-foreground">
              Calls are private between matched users. Your phone number, email and location are never shared.
              You can decline, block or report at any time.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="rounded-full" onClick={() => setCallConsentPending(null)}>NOT NOW</Button>
              <Button className="rounded-full" onClick={acceptCallConsent}>I UNDERSTAND — ENABLE CALLS</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}