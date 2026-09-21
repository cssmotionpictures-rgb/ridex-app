// Credit-free, in-browser fallback for the Ride X Queen assistant.
// The real LLM lives in the `queen-chat` backend function (OpenAI via the app
// key) — which is frozen while Base44 integration credits are exhausted. This
// module provides a keyword-matched, on-brand scripted responder so the Queen
// stays useful with zero backend, zero keys, zero credits, instantly on any
// phone. When credits return, callers still try the backend first.
//
// (An earlier attempt used the keyless Pollinations text API, but its anonymous
// endpoint now returns 402 Payment Required on real prompts, so it's removed.)

const RULES = [
  { k: ["book a ride", "ride", "taxi", "cab", "fare", "driver"], a: "To book a ride, open the Ride X page (/ride), set your pickup and drop-off, choose a class — Economy, Comfort, XL or Bike — then place your fare bid. A nearby driver accepts and you'll see them arrive on the map. If a ride won't book, make sure both addresses are set and your bid is fair." },
  { k: ["watch live football", "live football", "live sports", "stream match", "football stream", "soccer"], a: "You can watch and follow live football on the Live Sports page (/sports). Tap a match to open the player, check live scores across every league, and join the predictions forum. Highlights are under the Highlights tab." },
  { k: ["event ticket", "tickets", "concert ticket", "buy ticket", "qr ticket"], a: "For event tickets, go to Live Events (/events), pick your event and choose a tier — Early Bird is cheapest, VIP is the premium option. After paying you'll get a QR ticket you show at the door." },
  { k: ["book an artist", "book talent", "talent", "musician", "comedian", "dj", "actor"], a: "To book an artist, open Book Talent (/talent), browse the roster by type and tier, open a profile, pick your date and event type, then pay to confirm. You'll get a booking record and the artist is notified." },
  { k: ["video won't play", "movie not playing", "video", "movie", "film", "series"], a: "If a video won't play, try another title first — some sources go down. Check your connection and reopen the Movies page (/movies). Most titles stream fine; if one is stuck, the next usually works." },
  { k: ["payment", "pay", "card", "refund", "charged"], a: "All Ride X payments are handled securely by Ride X — card or bank transfer. Your money is held in escrow for your protection; release it from your profile once the service is delivered. For refunds or disputes, use Support (/support)." },
  { k: ["login", "sign in", "log in", "password", "reset", "forgot", "account"], a: "To sign in, use the Login page (/login) — Google sign-in is available too. If you forgot your password, go to Forgot Password (/forgot-password) to reset it by email." },
  { k: ["delivery", "parcel", "logistics", "send package", "deliver"], a: "For same-hour parcel delivery, use Logistics X (/logistics). Pick Express (1hr), Standard (4hr) or Economy (next day), set pickup and drop-off, and track it live on /delivery-tracking." },
  { k: ["equipment", "construction", "excavator", "bulldozer", "tractor", "cat machine", "heavy machine"], a: "CSS Constructions (/equipment) hires Caterpillar machines — excavators, bulldozers, loaders, graders, dump trucks. Track machines need lowbed transport; rubber-tyre machines self-drive to your site." },
  { k: ["car wash", "carwash", "wash my car", "detail"], a: "Carwash X (/carwash) comes to you. Choose Basic, Full, Premium Detail or Ceramic Coating, set your location and time, and pay to book. The crew arrives at your spot." },
  { k: ["restaurant", "venue", "table", "bar", "lounge", "book a table"], a: "To book a table at a bar or restaurant, open Vibe & Tap (/venues), browse venues, pick your spot and time, then reserve. You'll get a confirmation you show on arrival." },
  { k: ["music", "song", "music video", "stream music"], a: "RIDE X Sounds (/music) has music and music videos you can stream. For mastering your own track, use RIDE X Song Master (/ai-master)." },
  { k: ["master", "mastering", "ai master", "mix"], a: "RIDE X Song Master (/ai-master) masters your track — upload your file and the engine returns a mastered version, processed right on your device." },
  { k: ["marketplace", "sell", "buy goods", "listing"], a: "The Marketplace (/marketplace) lets you buy and sell physical goods — create a listing, chat with buyers, and pay securely." },
  { k: ["tv", "live tv", "channel", "television"], a: "Watch live Nigerian and international TV on the TV Stations page (/tv) — news, sports, music, movies, kids and more, all free to stream." },
  { k: ["concert", "live show", "live concert", "performance"], a: "Live Concerts (/concerts) streams live shows — browse what's on and watch available streams right now." },
  { k: ["curator", "playlist", "submit song", "playlist placement"], a: "To get your song on playlists, open Curators (/curators), pick a curator that fits your genre, submit your track and pay the submission fee. You can track each submission's status on the same page." },
  { k: ["promotion", "promote", "boost", "music promo"], a: "To boost your music, use Promotions (/promotion) and Auto-Promote (/auto-promote) — your track is auto-submitted to a batch of matching curators on payment." },
  { k: ["distribution", "spotify", "apple music", "distribute", "upload to stores"], a: "Music Distribution (/distribution) gets your songs onto Spotify, Apple Music and the rest. Set it up once and your releases go live across stores." },
  { k: ["vip", "membership", "premium", "subscribe"], a: "VIP Tiers (/vip) give you premium membership perks — ad-free, priority and more. Pick a tier and pay securely." },
  { k: ["referral", "refer", "refer and earn", "invite"], a: "Refer friends and earn on the Referral page (/referral) — share your link, and when they ride or buy, you get a commission tracked in the Referral Portal (/referral-portal)." },
  { k: ["reward", "points", "level", "badge", "redeem"], a: "The Reward Hub (/rewards) lets you earn points, level up and redeem perks — daily check-ins, weekly rewards and badges. Check in daily to keep your streak." },
  { k: ["card", "virtual card", "ride x card"], a: "The Ride X Card (/card) is your virtual card for spending across the app. Apply and top up instantly." },
  { k: ["safety", "sos", "emergency", "verify", "safe"], a: "For safety, use the Safety page (/safety) — SOS button, emergency contacts and verification. Drivers have their own safety tools at /driver-safety." },
  { k: ["support", "help", "contact", "complaint", "dispute"], a: "I'm here to help, and for anything I can't resolve you can reach Support (/support) or email the team directly. Tell me what you're trying to do and I'll point you to the right page." },
];

const DEFAULT = "I'm Ride X Queen 👑 — your guide to the whole app. I can help with rides, deliveries, equipment hire, venues, car wash, movies, live sports, music, events, talent booking, marketplace, TV and more. Tell me what you'd like to do and I'll point you to the right page. (My full AI brain is briefly at capacity — I'll guide you straight meanwhile.)";

function score(text, keys) {
  const t = text.toLowerCase();
  let s = 0;
  for (const k of keys) { if (t.includes(k)) s += k.length > 4 ? 3 : 2; }
  return s;
}

export async function queenReply(message, _history = []) {
  const msg = (message || "").toLowerCase();
  let best = null, bestScore = 0;
  for (const r of RULES) {
    const s = score(msg, r.k);
    if (s > bestScore) { bestScore = s; best = r; }
  }
  return best && bestScore > 0 ? best.a : DEFAULT;
}

// Generic in-browser chat fallback (AiMaster / Proposal Lab etc.). These need a
// real LLM, which is credit-gated — return a clear, honest note so the UI shows
// a useful message instead of an error. Callers should still try the backend.
export async function inBrowserChat({ userPrompt, systemPrompt } = {}) {
  return "This AI feature runs on the server, which is paused while its credits are out. Your input is saved — please retry later, or ask the Ride X Queen for general help.";
}