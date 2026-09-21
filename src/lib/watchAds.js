import { base44 } from "@/api/base44Client";
import { SERVICES } from "@/lib/catalog";

export const TIKTOK_URL = "https://www.tiktok.com/@ridex";
export const TIKTOK_HANDLE = "@ridex";

// Human, conversational ad scripts for EVERY Ride X service. These are the
// back-door fallback creatives that run in the Watch Ads hub when no paid
// sponsor ad is available (and are interleaved between paid ads) so the reel
// is never empty and no service is ever missed out. Each drives to TikTok.
const SERVICE_SCRIPTS = {
  ride: { headline: "Bid your own fare", body: "Tired of drivers cancelling because your fare is too low? With Ride X you set the price — drivers accept, you ride. Fair for everyone. Tap Ride X next time you need to move." },
  logistics: { headline: "Same-hour parcels", body: "Need a package across Lagos before lunch? Logistics X pairs you with a rider in minutes. Track it live, pay in-app, done. Send yours today." },
  equipment: { headline: "Caterpillar hire", body: "Site needs an excavator by morning? CSS Constructions rents CAT machines — excavators, dozers, graders — delivered to your project. One tap, machine on site." },
  venues: { headline: "Bars & restaurants", body: "Don't know where to chill tonight? Vibe & Tap shows the best bars and restaurants near you, with live tables and offers. Find your spot." },
  carwash: { headline: "We come to you", body: "Your car deserves better than a quick hose. Carwash X brings full detailing to your driveway — book, we arrive, it gleams. Try it this week." },
  movies: { headline: "Stream now", body: "Nollywood blockbusters, originals and cinema drops — CSS Motion Pictures streams them right now, no subscription drama. Press play tonight." },
  sports: { headline: "Free football streams", body: "Match starting and no DStv? Live Sports streams the game free, right in the app — with scores, predictions and fan chat. Don't miss kickoff." },
  music: { headline: "Music & videos", body: "New drops, exclusive videos and your favourite artists — RIDE X Sounds has it all, ad-free and free. Start your playlist today." },
  aimaster: { headline: "Master your tracks", body: "Your mix sounds off? RIDE X Song Master masters it to radio loudness in seconds — upload, we polish, you release. Sound pro tonight." },
  marketplace: { headline: "Buy & sell anything", body: "From phones to sneakers to furniture — the Marketplace connects buyers and sellers nearby with in-app chat and secure pay. List yours now." },
  tv: { headline: "Live Nigerian TV", body: "Missing home channels? TV Stations streams live Nigerian and global TV free, right in the app. News, sports, movies — all live. Tune in." },
  concerts: { headline: "Stream live shows", body: "Can't make the show? Live Concerts streams it in HD with real-time chat. Front row from your couch. Catch the next one." },
  curators: { headline: "Submit your songs", body: "Artists — get your song on real playlists. Curators lists genuine submission links across Spotify, Audiomack and more. Submit yours today." },
  promotion: { headline: "Boost your music", body: "One payment, your track batch-submitted to 60 curators automatically. Promotions does the outreach so you don't have to. Run a campaign now." },
  distribution: { headline: "Spotify, Apple Music", body: "Get your music on every store — Spotify, Apple Music, Boomplay, Audiomack — in days. Distribution handles the upload. Release worldwide." },
  events: { headline: "Tickets & concerts", body: "Find and buy tickets to the hottest events near you — concerts, shows, parties. Live Events has them, with QR entry. Grab yours." },
  competitions: { headline: "Weekly prizes", body: "Win cash, data and gadgets every week. Competitions runs free entry draws and challenges. One tap to enter — why not you?" },
  "digital-market": { headline: "Buy & sell digital", body: "Beats, ebooks, courses, presets — sell digital goods with secure instant delivery. Digital Store has it. Launch your store today." },
  vip: { headline: "Premium membership", body: "No ads, exclusive drops, priority everything. VIP Tiers unlocks the full Ride X experience. Upgrade and feel the difference." },
  licensing: { headline: "License your songs", body: "Want your track in a film or ad? Licensing connects your catalog to buyers and handles the paperwork. Get paid for your sound." },
  "fan-clubs": { headline: "Exclusive fan access", body: "Artists — own your fans directly. Fan Clubs lets you sell exclusive access, drops and chats. No label middleman. Start yours." },
  collaborations: { headline: "Hire creatives", body: "Need a producer, videographer or designer for a project? Collaborations matches you with vetted creatives. Hire talent today." },
  approvals: { headline: "Review submissions", body: "Running a campaign? Approvals gives you one dashboard to review every submission, payout and report. Stay in control." },
  influencers: { headline: "Auto-submit to creators", body: "Brands — reach hundreds of influencers at once. Influencers auto-matches and submits your campaign. Go viral faster. Start a campaign." },
  "influencer-dashboard": { headline: "Review & earn", body: "Creators — accept brand deals, review products and get paid in-app. Influencer Dashboard is your earning hub. Check your offers." },
  talent: { headline: "Book artists direct", body: "Planning an event? Book Talent connects you with verified artists — from emerging to A-list — at transparent rates. Book your headline act." },
  game: { headline: "Epic RPG adventure", body: "Bored? The Forgotten Ones is a full cinematic RPG — fight, level up and climb the leaderboard. Free to play. Start your journey." },
};

function interleave(promos, paid) {
  const round = [];
  const max = Math.max(promos.length, paid.length);
  for (let i = 0; i < max; i++) {
    if (promos[i]) round.push(promos[i]);
    if (paid[i]) round.push(paid[i]);
  }
  return round;
}

// Build the watch-ad reel: active paid sponsor ads (any video available) plus
// a human Ride X service promo for EVERY service, interleaved so the platform's
// own services are always advertised between paid ads. Paid ads play first when
// present; the promo reel is the back-door fallback when none are available.
// Ride X's own uploaded ad creatives — real video files hosted on Base44
// storage. They play in the Watch Ads reel as first-class video ads with NO
// integration credits and NO sponsor-entity fetch, so the reel is never empty
// even when the backend is offline / credits are exhausted.
export const RIDE_X_VIDEOS = [
  "https://media.base44.com/videos/public/6a7364eea84550708f16a360/41f3f9360_InShot_20260809_113016696.mp4",
  "https://media.base44.com/videos/public/6a7364eea84550708f16a360/5f52af6ee_InShot_20260809_112434746.mp4",
  "https://media.base44.com/videos/public/6a7364eea84550708f16a360/aeec41b5a_InShot_20260809_111525567.mp4",
  "https://media.base44.com/videos/public/6a7364eea84550708f16a360/1f42783d6_InShot_20260809_111245979.mp4",
  "https://media.base44.com/videos/public/6a7364eea84550708f16a360/33a394df0_InShot_20260809_111038099.mp4",
  "https://media.base44.com/videos/public/6a7364eea84550708f16a360/05400d9af_InShot_20260807_145709888.mp4",
  "https://media.base44.com/videos/public/6a7364eea84550708f16a360/aec93f327_InShot_20260807_145327296.mp4",
  "https://media.base44.com/videos/public/6a7364eea84550708f16a360/000cb272b_InShot_20260807_145114208.mp4",
].map((url, i) => ({
  type: "ridex",
  id: `ridex-${i}`,
  title: "Ride X Spotlight",
  sponsor: "Ride X",
  video_url: url,
  thumbnail: "",
  target_url: TIKTOK_URL,
}));

export async function buildWatchQueue() {
  const paid = [];
  try {
    const list = await base44.entities.SponsorAd.filter({ status: "active" }, "-created_date", 100);
    for (const a of (list || [])) {
      if ((a.remaining_budget ?? a.budget ?? 0) > 0 && a.video_url) {
        paid.push({
          type: "sponsor",
          id: a.id,
          title: a.name,
          sponsor: a.sponsor || a.name,
          video_url: a.video_url,
          thumbnail: a.thumbnail_url || "",
          target_url: a.target_url || "",
          ad: a,
        });
      }
    }
  } catch {}

  const promos = SERVICES.map((s) => {
    const sc = SERVICE_SCRIPTS[s.key] || { headline: s.tagline, body: `${s.name} — ${s.tagline}. Try it on Ride X.` };
    return {
      type: "promo",
      key: s.key,
      title: s.name,
      emoji: s.emoji,
      path: s.path,
      headline: sc.headline,
      body: sc.body,
      tiktok: TIKTOK_URL,
    };
  });

  return [...RIDE_X_VIDEOS, ...interleave(promos, paid)];
}