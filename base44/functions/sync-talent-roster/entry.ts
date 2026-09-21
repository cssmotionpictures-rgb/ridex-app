import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ── Roster ──────────────────────────────────────────────────────────────────
// Nigerian A-list (auto_accept_enabled = true) — auto-confirm bookings.
// South African + B/C-class Nigerian (auto_accept_enabled = false) — manual,
//   non-rejection flow (pending → confirmed in the artist dashboard).
const NG_A = [
  ["Wizkid", "musician", "mega_star", "Nigeria"],
  ["Burna Boy", "musician", "mega_star", "Nigeria"],
  ["Davido", "musician", "superstar", "Nigeria"],
  ["Rema", "musician", "superstar", "Nigeria"],
  ["Asake", "musician", "superstar", "Nigeria"],
  ["Tiwa Savage", "musician", "superstar", "Nigeria"],
  ["Yemi Alade", "musician", "a_list", "Nigeria"],
  ["Fireboy DML", "musician", "a_list", "Nigeria"],
  ["Omah Lay", "musician", "a_list", "Nigeria"],
  ["Joeboy", "musician", "mid", "Nigeria"],
  ["CKay", "musician", "a_list", "Nigeria"],
  ["Mayorkun", "musician", "a_list", "Nigeria"],
  ["Peruzzi", "musician", "mid", "Nigeria"],
  ["Blaqbonez", "musician", "mid", "Nigeria"],
  ["Oxlade", "musician", "mid", "Nigeria"],
  ["Buju", "musician", "mid", "Nigeria"],
  ["Adekunle Gold", "musician", "a_list", "Nigeria"],
  ["Simi", "musician", "a_list", "Nigeria"],
  ["Phyno", "musician", "a_list", "Nigeria"],
  ["Olamide", "musician", "superstar", "Nigeria"],
  ["MI Abaga", "musician", "a_list", "Nigeria"],
  ["Ice Prince", "musician", "mid", "Nigeria"],
  ["Seyi Shay", "musician", "mid", "Nigeria"],
  ["Teni", "musician", "mid", "Nigeria"],
  ["Chike", "musician", "mid", "Nigeria"],
  ["AQ", "musician", "mid", "Nigeria"],
  ["DJ Spinall", "dj", "a_list", "Nigeria"],
  ["DJ Neptune", "dj", "mid", "Nigeria"],
  ["DJ Enimoney", "dj", "mid", "Nigeria"],
  ["DJ Cuppy", "dj", "a_list", "Nigeria"],
  ["Poco Lee", "dancer", "a_list", "Nigeria"],
  ["Pinkie Diane", "dancer", "mid", "Nigeria"],
  ["Don Jazzy", "musician", "superstar", "Nigeria"],
  ["Banky W", "musician", "a_list", "Nigeria"],
  ["Wande Coal", "musician", "a_list", "Nigeria"],
  ["Skales", "musician", "mid", "Nigeria"],
  ["Lil Kesh", "musician", "mid", "Nigeria"],
  ["Victor AD", "musician", "mid", "Nigeria"],
  ["Reekado Banks", "musician", "mid", "Nigeria"],
];

// South African artists — manual (no auto-approve), non-rejection
const SA = [
  ["Black Coffee", "musician", "superstar", "South Africa"],
  ["Nasty C", "musician", "a_list", "South Africa"],
  ["Cassper Nyovest", "musician", "a_list", "South Africa"],
  // AKA removed — deceased (shot dead in Durban, 10 Feb 2023). Dead artists
  // cannot be booked, so excluded from the roster entirely.
  ["Kabza De Small", "dj", "a_list", "South Africa"],
  ["DJ Maphorisa", "dj", "a_list", "South Africa"],
  ["Young Stunna", "musician", "mid", "South Africa"],
  ["Focalistic", "musician", "mid", "South Africa"],
  ["DBN Gogo", "dj", "mid", "South Africa"],
  ["Elaine", "musician", "mid", "South Africa"],
  ["Sho Madjozi", "musician", "mid", "South Africa"],
  ["Sun-El Musician", "dj", "mid", "South Africa"],
  ["Msaki", "musician", "mid", "South Africa"],
  ["Prince Kaybee", "dj", "mid", "South Africa"],
  ["Master KG", "musician", "a_list", "South Africa"],
  ["Sha Sha", "musician", "mid", "South Africa"],
  ["Vigro Deep", "dj", "mid", "South Africa"],
  ["Makhadzi", "musician", "mid", "South Africa"],
  ["Busta 929", "dj", "mid", "South Africa"],
];

// B/C-class Nigerian — manual (no auto-approve), non-rejection
const NG_BC = [
  ["Zinoleesky", "musician", "mid", "Nigeria"],
  ["Portable", "musician", "mid", "Nigeria"],
  ["Seyi Vibez", "musician", "mid", "Nigeria"],
  ["Shallipopi", "musician", "mid", "Nigeria"],
  ["Odumodublvck", "musician", "mid", "Nigeria"],
  ["Ruger", "musician", "mid", "Nigeria"],
  ["Khaid", "musician", "rising", "Nigeria"],
  ["TML Vibez", "musician", "rising", "Nigeria"],
  ["Smur Lee", "musician", "rising", "Nigeria"],
  ["Muyeez", "musician", "rising", "Nigeria"],
  ["Berry Black", "musician", "rising", "Nigeria"],
  ["Terry G", "musician", "mid", "Nigeria"],
  ["Slizzy", "musician", "rising", "Nigeria"],
];

const ROSTER = [
  ...NG_A.map((r) => ({ stage: r[0], type: r[1], tier: r[2], country: r[3], auto: true })),
  ...SA.map((r) => ({ stage: r[0], type: r[1], tier: r[2], country: r[3], auto: false })),
  ...NG_BC.map((r) => ({ stage: r[0], type: r[1], tier: r[2], country: r[3], auto: false })),
];

const TIERS = {
  mega_star: "Global Mega-Star", superstar: "International Superstar", a_list: "A-List",
  mid: "Mid-Tier", rising: "Rising", emerging: "Emerging",
};

// Real local Nigerian show booking fees (₦) per talent type + tier — confirmed Aug 2026.
// Used to set booking_price on roster artists so the booking flow shows a real price.
const TIER_PRICE = {
  musician: { mega_star: 100000000, superstar: 50000000, a_list: 15000000, mid: 5000000, rising: 750000, emerging: 300000 },
  actor: { mega_star: 40000000, a_list: 5000000, mid: 1500000, emerging: 300000 },
  comedian: { mega_star: 50000000, a_list: 2000000, mid: 750000, emerging: 150000 },
  dancer: { mega_star: 10000000, a_list: 1500000, mid: 500000, emerging: 100000 },
  dj: { mega_star: 15000000, superstar: 5000000, a_list: 2000000, mid: 750000, emerging: 100000 },
};
function priceFor(type, tier) {
  return (TIER_PRICE[type] && TIER_PRICE[type][tier]) || 0;
}

const UA = { 'User-Agent': 'RideX-Talent/1.0 (contact@cssmotionpictures.com)' };

// Fetch the real Wikipedia thumbnail for a person (null if not found).
// Handles disambiguation (e.g. "Black Coffee", "Rema", "AKA") by falling back
// to a search, then fetching the top result's summary.
async function wikiThumb(title) {
  try {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { headers: UA });
    if (r.ok) {
      const j = await r.json();
      if (j?.type !== 'disambiguation' && (j?.thumbnail?.source || j?.originalimage?.source)) {
        return j?.thumbnail?.source || j?.originalimage?.source || null;
      }
    }
    // Fallback: search for the canonical page, then fetch its summary.
    const s = await fetch(`https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(title)}&limit=1`, { headers: UA });
    if (s.ok) {
      const key = (await s.json())?.pages?.[0]?.key;
      if (key) {
        const r2 = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(key)}`, { headers: UA });
        if (r2.ok) {
          const j2 = await r2.json();
          if (j2?.thumbnail?.source || j2?.originalimage?.source) {
            return j2?.thumbnail?.source || j2?.originalimage?.source || null;
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export default async function (req) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // 1. Upsert roster — set country, tier, tier_label, auto_accept_enabled.
  const existing = await base44.asServiceRole.entities.TalentArtist.list("-created_date", 500);
  const byName = new Map(existing.map((a) => [String(a.stage_name).toLowerCase().trim(), a]));
  let created = 0, updated = 0;
  for (const r of ROSTER) {
    const cur = byName.get(r.stage.toLowerCase());
    const tier_label = TIERS[r.tier] || r.tier;
    const booking_price = priceFor(r.type, r.tier);
    if (cur) {
      await base44.asServiceRole.entities.TalentArtist.update(cur.id, {
        country: r.country, tier: r.tier, tier_label, booking_price,
        auto_accept_enabled: r.auto, talent_type: r.type, status: 'active',
      });
      updated++;
    } else {
      await base44.asServiceRole.entities.TalentArtist.create({
        stage_name: r.stage, full_name: r.stage, talent_type: r.type,
        tier: r.tier, tier_label, country: r.country, booking_price,
        auto_accept_enabled: r.auto, status: 'active', rating: 0,
      });
      created++;
    }
  }

  // 2. Fetch real profile photos — overwrite placeholders for roster artists,
  //    fill missing for everyone else.
  const all = await base44.asServiceRole.entities.TalentArtist.list("-created_date", 500);
  const rosterNames = new Set(ROSTER.map((r) => r.stage.toLowerCase()));
  const needImg = all.filter((a) => !a.profile_image || rosterNames.has(String(a.stage_name).toLowerCase()) || (a.profile_image || "").includes("unsplash"));

  const toUpdate = [];
  for (let i = 0; i < needImg.length; i += 15) {
    const batch = needImg.slice(i, i + 15);
    for (const a of batch) {
      const url = await wikiThumb(a.stage_name || a.full_name);
      if (url) {
        toUpdate.push({ id: a.id, profile_image: url });
      } else if ((a.profile_image || "").includes("unsplash")) {
        // No real photo found — clear the wrong shared placeholder so the card
        // shows a distinct letter avatar instead of a reused wrong image.
        toUpdate.push({ id: a.id, profile_image: "" });
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  let imgFilled = 0;
  if (toUpdate.length) {
    try {
      await base44.asServiceRole.entities.TalentArtist.bulkUpdate(toUpdate);
      imgFilled = toUpdate.length;
    } catch (e) {
      console.error('bulkUpdate images failed:', e.message);
    }
  }

  const after = await base44.asServiceRole.entities.TalentArtist.list("-created_date", 500);
  return Response.json({
    created, updated, imgFilled,
    total: after.length,
    with_image: after.filter((a) => a.profile_image).length,
    nigeria: after.filter((a) => a.country === "Nigeria").length,
    south_africa: after.filter((a) => a.country === "South Africa").length,
    auto_enabled: after.filter((a) => a.auto_accept_enabled).length,
    manual: after.filter((a) => !a.auto_accept_enabled).length,
  });
}