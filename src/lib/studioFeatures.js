import { AGENCY } from "@/lib/agency";

export const ENGINEERING_SURCHARGE = 1500;

export const STUDIO_TIERS = [
  { key: "tier1_global", label: "Tier 1 · Global Afrobeats Megastars" },
  { key: "tier2_african", label: "Tier 2 · African Hitmakers & Stream Giants" },
  { key: "tier3_us", label: "Tier 3 · US Elite Artists" },
];

export const STUDIO_ARTISTS = [
  { name: "Burna Boy", tier: "tier1_global", net: 500000 },
  { name: "Wizkid", tier: "tier1_global", net: 500000 },
  { name: "Davido", tier: "tier1_global", net: 300000 },
  { name: "Rema", tier: "tier1_global", net: 250000 },
  { name: "Tems", tier: "tier1_global", net: 200000 },
  { name: "Asake", tier: "tier1_global", net: 150000 },
  { name: "Olamide", tier: "tier1_global", net: 100000 },
  { name: "Omah Lay", tier: "tier2_african", net: 80000 },
  { name: "Kizz Daniel", tier: "tier2_african", net: 75000 },
  { name: "Fireboy DML", tier: "tier2_african", net: 60000 },
  { name: "Ayra Starr", tier: "tier2_african", net: 60000 },
  { name: "Oxylade", tier: "tier2_african", net: 40000 },
  { name: "Patoranking", tier: "tier2_african", net: 40000 },
  { name: "Wande Coal", tier: "tier2_african", net: 40000 },
  { name: "Odumodublvck", tier: "tier2_african", net: 35000 },
  { name: "Seyi Vibez", tier: "tier2_african", net: 35000 },
  { name: "Tiwa Savage", tier: "tier2_african", net: 35000 },
  { name: "Flavour", tier: "tier2_african", net: 30000 },
  { name: "Phyno", tier: "tier2_african", net: 30000 },
  { name: "Naira Marley", tier: "tier2_african", net: 30000 },
  { name: "Zlatan Ibile", tier: "tier2_african", net: 25000 },
  { name: "Shallipopi", tier: "tier2_african", net: 25000 },
  { name: "Ckay", tier: "tier2_african", net: 25000 },
  { name: "Joeboy", tier: "tier2_african", net: 25000 },
  { name: "BNXN (Buju)", tier: "tier2_african", net: 25000 },
  { name: "Yemi Alade", tier: "tier2_african", net: 20000 },
  { name: "Falz", tier: "tier2_african", net: 20000 },
  { name: "Bella Shmurda", tier: "tier2_african", net: 20000 },
  { name: "Reekado Banks", tier: "tier2_african", net: 20000 },
  { name: "Teni", tier: "tier2_african", net: 20000 },
  { name: "Chike", tier: "tier2_african", net: 15000 },
  { name: "Victony", tier: "tier2_african", net: 15000 },
  { name: "Blaqbonez", tier: "tier2_african", net: 15000 },
  { name: "Zinoleesky", tier: "tier2_african", net: 15000 },
  { name: "Mayorkun", tier: "tier2_african", net: 15000 },
  { name: "Duncan Mighty", tier: "tier2_african", net: 15000 },
  { name: "Tekno", tier: "tier2_african", net: 30000 },
  { name: "Simi", tier: "tier2_african", net: 15000 },
  { name: "Adekunle Gold", tier: "tier2_african", net: 35000 },
  { name: "Young Jonn", tier: "tier2_african", net: 20000 },
  { name: "Pheelz", tier: "tier2_african", net: 20000 },
  { name: "Skiibii", tier: "tier2_african", net: 10000 },
  { name: "Spyro", tier: "tier2_african", net: 12000 },
  { name: "Boy Spyce", tier: "tier2_african", net: 12000 },
  { name: "Bayanni", tier: "tier2_african", net: 10000 },
  { name: "Magixx", tier: "tier2_african", net: 10000 },
  { name: "Qing Madi", tier: "tier2_african", net: 10000 },
  { name: "The Cavemen", tier: "tier2_african", net: 10000 },
  { name: "Ice Prince", tier: "tier2_african", net: 10000 },
  { name: "M.I Abaga", tier: "tier2_african", net: 15000 },
  { name: "Reminisce", tier: "tier2_african", net: 12000 },
  { name: "Timaya", tier: "tier2_african", net: 20000 },
  { name: "D'Banj", tier: "tier2_african", net: 25000 },
  { name: "Don Jazzy (Vocal/Skit Hook)", tier: "tier2_african", net: 40000 },
  { name: "Peruzzi", tier: "tier2_african", net: 10000 },
  { name: "Dremo", tier: "tier2_african", net: 6000 },
  { name: "Ycee", tier: "tier2_african", net: 8000 },
  { name: "Vector", tier: "tier2_african", net: 10000 },
  { name: "Ladipoe", tier: "tier2_african", net: 12000 },
  { name: "Crayon", tier: "tier2_african", net: 12000 },
  { name: "Ruger", tier: "tier2_african", net: 30000 },
  { name: "Bad Boy Timz", tier: "tier2_african", net: 8000 },
  { name: "Mohbad (Legacy Catalog Sync)", tier: "tier2_african", net: 25000 },
  { name: "Lil Kesh", tier: "tier2_african", net: 10000 },
  { name: "Small Doctor", tier: "tier2_african", net: 8000 },
  { name: "Qdot", tier: "tier2_african", net: 8000 },
  { name: "Portable", tier: "tier2_african", net: 7000 },
  { name: "Chinko Ekun", tier: "tier2_african", net: 5000 },
  { name: "CDQ", tier: "tier2_african", net: 6000 },
  { name: "Illbliss", tier: "tier2_african", net: 8000 },
  { name: "Jesse Jagz", tier: "tier2_african", net: 10000 },
  { name: "Brymo", tier: "tier2_african", net: 15000 },
  { name: "Asa", tier: "tier2_african", net: 40000 },
  { name: "Niniola", tier: "tier2_african", net: 12000 },
  { name: "Ten Entertainer", tier: "tier2_african", net: 20000 },
  { name: "Terri", tier: "tier2_african", net: 6000 },
  { name: "Shoday", tier: "tier2_african", net: 4000 },
  { name: "Fola", tier: "tier2_african", net: 3000 },
  { name: "Drake", tier: "tier3_us", net: 1000000 },
  { name: "Chris Brown", tier: "tier3_us", net: 300000 },
  { name: "Travis Scott", tier: "tier3_us", net: 400000 },
  { name: "Future", tier: "tier3_us", net: 250000 },
  { name: "Lil Baby", tier: "tier3_us", net: 150000 },
  { name: "Gunna", tier: "tier3_us", net: 120000 },
  { name: "Cardi B", tier: "tier3_us", net: 250000 },
  { name: "Nicki Minaj", tier: "tier3_us", net: 300000 },
  { name: "Megan Thee Stallion", tier: "tier3_us", net: 150000 },
  { name: "Offset", tier: "tier3_us", net: 80000 },
  { name: "Quavo", tier: "tier3_us", net: 80000 },
  { name: "Rick Ross", tier: "tier3_us", net: 75000 },
  { name: "21 Savage", tier: "tier3_us", net: 150000 },
  { name: "A Boogie Wit Da Hoodie", tier: "tier3_us", net: 80000 },
  { name: "Roddy Ricch", tier: "tier3_us", net: 80000 },
  { name: "DaBaby", tier: "tier3_us", net: 70000 },
  { name: "Kodak Black", tier: "tier3_us", net: 100000 },
  { name: "Lil Durk", tier: "tier3_us", net: 120000 },
  { name: "Don Toliver", tier: "tier3_us", net: 100000 },
  { name: "Ty Dolla $ign", tier: "tier3_us", net: 60000 },
];

export const grossUpStudio = (net) => {
  const n = Number(net) || 0;
  const agency = Math.round(n * 0.2);
  return { net: n, agency, gross: n + agency };
};

export const featureTotals = (net, bypassed = false) => {
  const n = Number(net) || 0;
  if (bypassed) return { net: n, agency: 0, gross: n, engineering: 0, total: n };
  const { agency, gross } = grossUpStudio(n);
  return { net: n, agency, gross, engineering: ENGINEERING_SURCHARGE, total: gross + ENGINEERING_SURCHARGE };
};

export const usd = (n) => "$" + (Number(n) || 0).toLocaleString("en-US");

export const tierLabel = (key) => STUDIO_TIERS.find((t) => t.key === key)?.label || key;

const serial = (b) => `AG-2026-FT${String(b?.id || "000").slice(-3).toUpperCase()}`;

export const invoiceHtml = (b) => {
  const t = featureTotals(b?.net_fee, b?.fee_bypassed);
  return `<pre style="font:12px/1.55 monospace;white-space:pre-wrap;padding:28px">RIDE X LIVE ROUTING DESK — Lagos, Nigeria
${AGENCY.email} · ${AGENCY.phone}
COMMERCIAL STUDIO FEATURE INVOICE

Invoice Cleared To:
  Client Entity: ${b?.client_name || "—"}
  Attn: ${b?.principal_artist || "—"} (Principal Artist)
  Project Title: ${b?.song_title || "—"}

Transaction Ledger:
  Invoice Serial: ${serial(b)}
  Date of Issuance: ${new Date().toLocaleDateString()}
  Format: 16-Bar Guest Verse / Chorus Hook Recording
  Payment Status: ${b?.fee_bypassed ? "Admin Bypass (Fee Waived)" : "Pending Escrow"}
  Settlement Term: 100% Upfront Escrow

COLLABORATION COST BREAKDOWN
  Talent Studio Feature Allocation — ${b?.guest_artist_name || "—"}
    Scheduled Guest Vocalist ......... 1 x ${usd(t.net)} = ${usd(t.net)}
  Agency A&R Management & Procurement Surcharge (20%)
    Billed to client per gross-up protocol  1 x ${usd(t.agency)} = ${usd(t.agency)}
  Engineering Data Delivery & Split Sheet Clearing Surcharge
    Vetting of vocal stems + copyright indexing  1 x ${usd(t.engineering)} = ${usd(t.engineering)}
  ---------------------------------------------------------------
  TOTAL OUTSTANDING COMMERCIAL VALUE DUE ......... ${usd(t.total)}

REQUIRED 100% UPFRONT ESCROW FUNDING SECURED: ${usd(t.total)}

AUDITED CORPORATE ESCROW CHANNELS
  Corporate Bank Entity: ${AGENCY.banks}
  Corporate Account Name: ${AGENCY.name}
  USD Domiciliary Account Route: on request
  GBP Domiciliary Account Route: on request
  Forward wire transaction telemetry to ${AGENCY.email} to lock the studio tracking calendar window.

Authorised by The Lead A&R Director · ${AGENCY.phone}</pre>`;
};

export const contractHtml = (b) => {
  const t = featureTotals(b?.net_fee, b?.fee_bypassed);
  return `<pre style="font:11px/1.5 monospace;white-space:pre-wrap;padding:28px">WORK-FOR-HIRE MASTER RECORDING & FEATURE COMPOSITION AGREEMENT

This Studio Collaboration Agreement is executed on ${new Date().toLocaleDateString()} by and between
${AGENCY.name} (The Escrow Administrator), acting on behalf of ${b?.principal_artist || "[Principal]"} (The Principal),
and the management entity of ${b?.guest_artist_name || "[Guest Performer]"} (The Guest Performer).

1. SCOPE OF COLLABORATION & STUDIO SERVICE
   1.1 The Guest Performer agrees to record and deliver one (1) original 16-bar verse and/or
       one (1) chorus hook for the composition tentatively titled "${b?.song_title || "[Track]"}" (the "Song").
   1.2 All raw audio stems must be delivered as high-fidelity, uncompressed 24-bit WAV files
       (Dry Vocals, no tracking effects, time-aligned to project BPM ${b?.bpm || "—"}).

2. THE 100% SECURE ESCROW & PAYMENT RELEASE
   2.1 The Principal shall deposit 100% of the Gross Invoiced Feature Fee (${usd(t.total)}) into the
       ${AGENCY.name} corporate escrow account before the Guest Performer enters the studio.
   2.2 Funds will NOT be released to the Guest Performer until their management countersigns the
       Official Music Publishing Split Sheet and hands over the verified master audio stems.

3. PUBLISHING REVENUE & ROYALTIES ARCHITECTURE (MCSN-cleared)
   3.1 Master Sound Recording: 100% owned by the Principal / Executive Producer
       (Guest Performer signs a Work-for-Hire waiver on master sales & streaming royalties).
   3.2 Mechanical & Writer Publishing Splits:
       Principal Writer Share: 75% of overall composition royalties.
       Guest Performer Writer Share: 25% of overall composition royalties (for their 16-bar verse).

4. MARKETING, PROMOTION & VISUAL VIDEO PERFORMANCE
   4.1 The Guest Performer grants likeness & name as featured credit on all streaming platforms
       ("${b?.principal_artist || "[Principal]"} feat. ${b?.guest_artist_name || "[Guest]"}").
   4.2 Music Video Option: If requested, the Principal funds return business-class flights,
       hotel blocks, and VVIP security per the standard agency tour matrix.

IN WITNESS WHEREOF THE PARTIES ATTACH SIGNATURES:
For: ${AGENCY.name} (Escrow)            For: Guest Performer Management
__________________________              __________________________</pre>`;
};

export const FREE_FEATURE_CURRENCY = "NGN";

// Tiered processing fee — Macro ₦100k, degrading down to Nano ₦15k.
export const FREE_FEATURE_TIERS = [
  { key: "macro", label: "Macro", fee: 100000 },
  { key: "mid", label: "Mid", fee: 60000 },
  { key: "micro", label: "Micro", fee: 30000 },
  { key: "nano", label: "Nano", fee: 15000 },
];
export const FREE_FEATURE_FEE = 15000; // lowest tier (Nano) — backward-compat default
export const freeFeatureFee = (tier) => FREE_FEATURE_TIERS.find((t) => t.key === tier)?.fee ?? 15000;
export const freeFeatureTierLabel = (tier) => FREE_FEATURE_TIERS.find((t) => t.key === tier)?.label ?? "Nano";

export const FREE_FEATURE_TERMS = [
  "Music is 100% original — no uncleared third-party samples or interpolations.",
  "You must hold an active NCC Copyright Registration Certificate or MCSN Catalog Number proving 100% ownership of the underlying composition before applying.",
  "Submission meets commercial release quality — mixed & mastered to broadcast standard (-14 LUFS, 24-bit WAV, radio-ready).",
  "If awarded, the guest 16-bar verse / chorus hook is delivered within 14 days.",
  "Feature is granted by an algorithmic A&R score — submissions scoring 9.5/10 or higher are auto-approved; below the threshold the application is declined.",
  "The tiered processing fee (Macro ₦100k → Mid ₦60k → Micro ₦30k → Nano ₦15k) is NON-REFUNDABLE — it covers A&R review & processing whether or not a feature is awarded.",
  "The outcome is decided by the algorithmic vetting matrix; the fee remains non-refundable regardless of whether you are accepted or declined.",
];

const ngn = (n) => "₦" + (Number(n) || 0).toLocaleString("en-US");
const ffaRef = (r) => `RX-FFA-${String(r?.id || "000").slice(-5).toUpperCase()}`;

export const freeFeatureCertificateHtml = (r) => {
  return `<pre style="font:12px/1.55 monospace;white-space:pre-wrap;padding:28px">OFFICIAL FREE FEATURE ACCEPTANCE CERTIFICATE
Ride X A&R Division — Free Feature Programme

Certificate Reference: ${ffaRef(r)}
Date of Approval: ${r?.approved_at ? new Date(r.approved_at).toLocaleString() : new Date().toLocaleString()}

ARTIST & WORK
  Applying Artist: ${r?.artist_name || "—"}
  Song Title: ${r?.song_title || "—"}
  Genre: ${r?.genre || "—"}
  Music Link: ${r?.music_url || "—"}
  Social Handle: ${r?.social_handle || "—"}
  Contact Email: ${r?.email || "—"}
  Feature Tier Applied For: ${freeFeatureTierLabel(r?.feature_tier)}

APPLICATION LEDGER
  Non-Refundable Application Fee: ${ngn(r?.application_fee || FREE_FEATURE_FEE)} (${r?.currency || "NGN"})
  Payment Status: ${r?.payment_status === "paid" ? "PAID — captured by platform" : "Pending"}
  Payment Reference: ${r?.paystack_reference || "—"}
  Review Status: ACCEPTED (algorithmic A&R score ${r?.quality_score != null ? Number(r.quality_score).toFixed(1) + "/10" : "auto-approved"})

TERMS & CONDITIONS ACKNOWLEDGED
${FREE_FEATURE_TERMS.map((t, i) => `  ${i + 1}. ${t}`).join("\n")}

This certificate confirms that the above artist's submission has been accepted into the
Ride X Free Feature Programme. The A&R desk will contact the artist at the email above
to schedule the guest feature recording session.

Authorised by the Lead A&R Director · ${AGENCY.phone}
${AGENCY.email}</pre>`;
};

export const offerSheetHtml = (b) => {
  const t = featureTotals(b?.net_fee, b?.fee_bypassed);
  return `<pre style="font:11px/1.5 monospace;white-space:pre-wrap;padding:28px">FORMAL REQUEST FOR TRACK SOUNDTRACK RECONSTRUCTION & METADATA OVERHAUL
Issued by A&R Division: ${AGENCY.name}

A. EXECUTIVE PROJECT DATA
   Principal Recording Artist Name: ${b?.principal_artist || "________________________"}
   Target Guest Roster Artist Requested: ${b?.guest_artist_name || "________________________"}
   Song Working Title & Primary Genre: ${b?.song_title || "__________"} / ${b?.genre || "__________"}
   Project BPM & Target Key Profile: ${b?.bpm || "____"} / ${b?.song_key || "____"}
   Target Global Commercial Release Date: ${b?.release_date || "____________"}

B. COMMERCIAL ALLOCATION & TRANSFER AGREEMENT
   Gross Feature Fee Deposited in Escrow: ${usd(t.total)}
   Proposed Writer Share Allocation: 25% Fixed Standard Split Sheet Allocation
   Audio Stem Retrieval Path Clearance: [X] Yes — supply final recorded vocals via secure cloud
       link within 14 calendar days of escrow confirmation.
   Agency Commission (20% Gross-Up): ${usd(t.agency)} ${b?.fee_bypassed ? "(WAIVED — Admin Bypass)" : ""}
   Engineering & Split-Sheet Clearing: ${usd(t.engineering)}

Authorized Representative Signature: _____________________ Date: _______________

Escrow channels: ${AGENCY.banks} · ${AGENCY.name} · wire telemetry to ${AGENCY.email}</pre>`;
};