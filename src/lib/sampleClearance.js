import { AGENCY } from "@/lib/agency";

export const SAMPLE_COHORTS = [
  { key: "nigeria_historical", label: "Historical Nigerian Pioneers (1960s–1980s)" },
  { key: "nigeria_modern", label: "Modern Nigerian Mainstream (2000s–2026)" },
  { key: "us_international", label: "International US Heritage & Modern" },
];

export const SAMPLE_MATRIX = [
  { name: "Fela Kuti", cohort: "nigeria_historical", era: "1960s–1980s", master: "Barclay / Knitting Factory", publisher: "BMG Rights Management", net: 25000, currency: "USD", public_domain: false },
  { name: "King Sunny Adé", cohort: "nigeria_historical", era: "1960s–1980s", master: "PolyGram / Island Records", publisher: "KSA Publishing / MCSN", net: 5000000, currency: "NGN", public_domain: false },
  { name: "Chief Ebenezer Obey", cohort: "nigeria_historical", era: "1960s–1980s", master: "Decca Records / Obey Music", publisher: "MCSN Admin Channels", net: 4000000, currency: "NGN", public_domain: false },
  { name: "Sir Victor Uwaifo", cohort: "nigeria_historical", era: "1960s–1980s", master: "Premier Records Ltd", publisher: "Premier Music Publishing", net: 2500000, currency: "NGN", public_domain: false },
  { name: "Oliver De Coque", cohort: "nigeria_historical", era: "1960s–1980s", master: "Olumo Records / Premier", publisher: "MCSN Execution Desk", net: 3000000, currency: "NGN", public_domain: false },
  { name: "Cardinal Rex Lawson", cohort: "nigeria_historical", era: "1960s (Public Domain)", master: "Public Domain (1960s Master)", publisher: "Independent Estate / MCSN", net: 1000000, currency: "NGN", public_domain: true },
  { name: "Sir Bobby Benson", cohort: "nigeria_historical", era: "1960s (Public Domain)", master: "Public Domain (1960s Master)", publisher: "Independent Estate / MCSN", net: 1000000, currency: "NGN", public_domain: true },
  { name: "Celestine Ukwu", cohort: "nigeria_historical", era: "1960s–1980s", master: "Premier Records Ltd", publisher: "Premier Music Publishing", net: 2000000, currency: "NGN", public_domain: false },
  { name: "Majek Fashek", cohort: "nigeria_historical", era: "1980s", master: "Tabansi Records", publisher: "Tabansi Publishing", net: 3500000, currency: "NGN", public_domain: false },
  { name: "William Onyeabor", cohort: "nigeria_historical", era: "1970s–1980s", master: "Luaka Bop", publisher: "BMG Publishing Services", net: 10000, currency: "USD", public_domain: false },
  { name: "Davido", cohort: "nigeria_modern", era: "2000s–2026", master: "Sony West Africa / Atlantic / RCA", publisher: "Sony Music Publishing / Warner Chappell", net: 50000, currency: "USD", public_domain: false },
  { name: "Wizkid", cohort: "nigeria_modern", era: "2000s–2026", master: "Sony West Africa / Atlantic / RCA", publisher: "Sony Music Publishing / Warner Chappell", net: 50000, currency: "USD", public_domain: false },
  { name: "Burna Boy", cohort: "nigeria_modern", era: "2000s–2026", master: "Sony West Africa / Atlantic / RCA", publisher: "Sony Music Publishing / Warner Chappell", net: 50000, currency: "USD", public_domain: false },
  { name: "Rema", cohort: "nigeria_modern", era: "2000s–2026", master: "Mavin / Jonzing / YBNL / Empire", publisher: "Mavin Publishing / Empire Publishing", net: 30000, currency: "USD", public_domain: false },
  { name: "Ayra Starr", cohort: "nigeria_modern", era: "2000s–2026", master: "Mavin / Jonzing / YBNL / Empire", publisher: "Mavin Publishing / Empire Publishing", net: 30000, currency: "USD", public_domain: false },
  { name: "Asake", cohort: "nigeria_modern", era: "2000s–2026", master: "Mavin / Jonzing / YBNL / Empire", publisher: "Mavin Publishing / Empire Publishing", net: 30000, currency: "USD", public_domain: false },
  { name: "Skiibii", cohort: "nigeria_modern", era: "2000s–2026", master: "Independent / FlyBoy Inc / Empire", publisher: "Sony Publishing / Empire Publishing", net: 15000, currency: "USD", public_domain: false },
  { name: "Reekado Banks", cohort: "nigeria_modern", era: "2000s–2026", master: "Independent / FlyBoy Inc / Empire", publisher: "Sony Publishing / Empire Publishing", net: 15000, currency: "USD", public_domain: false },
  { name: "Kizz Daniel", cohort: "nigeria_modern", era: "2000s–2026", master: "Independent / FlyBoy Inc / Empire", publisher: "Sony Publishing / Empire Publishing", net: 15000, currency: "USD", public_domain: false },
  { name: "Omah Lay", cohort: "nigeria_modern", era: "2000s–2026", master: "Sire Records / RCA / Empire", publisher: "Sony Music Publishing / Warner Chappell", net: 25000, currency: "USD", public_domain: false },
  { name: "Tems", cohort: "nigeria_modern", era: "2000s–2026", master: "Sire Records / RCA / Empire", publisher: "Sony Music Publishing / Warner Chappell", net: 25000, currency: "USD", public_domain: false },
  { name: "Fireboy DML", cohort: "nigeria_modern", era: "2000s–2026", master: "Sire Records / RCA / Empire", publisher: "Sony Music Publishing / Warner Chappell", net: 25000, currency: "USD", public_domain: false },
  { name: "James Brown", cohort: "us_international", era: "Motown Era", master: "Universal Music Group (UMG)", publisher: "Universal Music Publishing Group", net: 40000, currency: "USD", public_domain: false },
  { name: "Marvin Gaye", cohort: "us_international", era: "Motown Era", master: "Universal Music Group (UMG)", publisher: "Universal Music Publishing Group", net: 40000, currency: "USD", public_domain: false },
  { name: "Stevie Wonder", cohort: "us_international", era: "Motown Era", master: "Universal Music Group (UMG)", publisher: "Universal Music Publishing Group", net: 40000, currency: "USD", public_domain: false },
  { name: "Michael Jackson", cohort: "us_international", era: "Heritage Catalog", master: "Sony Music Entertainment / Warner", publisher: "Sony Music Publishing / Warner Chappell", net: 100000, currency: "USD", public_domain: false },
  { name: "Prince", cohort: "us_international", era: "Heritage Catalog", master: "Sony Music Entertainment / Warner", publisher: "Sony Music Publishing / Warner Chappell", net: 100000, currency: "USD", public_domain: false },
  { name: "Drake", cohort: "us_international", era: "Modern Hip-Hop", master: "Republic / Epic / Cactus Jack", publisher: "Universal Music / Sony Publishing", net: 80000, currency: "USD", public_domain: false },
  { name: "Travis Scott", cohort: "us_international", era: "Modern Hip-Hop", master: "Republic / Epic / Cactus Jack", publisher: "Universal Music / Sony Publishing", net: 80000, currency: "USD", public_domain: false },
  { name: "Future", cohort: "us_international", era: "Modern Hip-Hop", master: "Republic / Epic / Cactus Jack", publisher: "Universal Music / Sony Publishing", net: 80000, currency: "USD", public_domain: false },
  { name: "Lil Baby", cohort: "us_international", era: "Modern Hip-Hop", master: "Quality Control / Young Money / Capitol", publisher: "Universal Music Publishing Group", net: 35000, currency: "USD", public_domain: false },
  { name: "Gunna", cohort: "us_international", era: "Modern Hip-Hop", master: "Quality Control / Young Money / Capitol", publisher: "Universal Music Publishing Group", net: 35000, currency: "USD", public_domain: false },
  { name: "Nicki Minaj", cohort: "us_international", era: "Modern Hip-Hop", master: "Quality Control / Young Money / Capitol", publisher: "Universal Music Publishing Group", net: 35000, currency: "USD", public_domain: false },
  { name: "90 Archive Artists (Premier / Tabansi)", cohort: "nigeria_historical", era: "1960s–1980s", master: "Premier / Tabansi Registries", publisher: "MCSN Collective Databases", net: 1500000, currency: "NGN", public_domain: false },
  { name: "188 Mainstream Acts (MCSN Network)", cohort: "nigeria_modern", era: "2000s–2026", master: "Local Label Aggregators / Mavins", publisher: "MCSN Network Registries", net: 5000000, currency: "NGN", public_domain: false },
  { name: "196 US Roster Names", cohort: "us_international", era: "Motown–Present", master: "UMG / Sony Music / Warner Music", publisher: "UMPG / Kobalt / Sony Publishing", net: 30000, currency: "USD", public_domain: false },
];

export const SAMPLE_TYPES = [
  { key: "master_loop", label: "Master Loop Splicing" },
  { key: "vocal_interpolation", label: "Vocal Interpolation / Re-recording" },
  { key: "instrumental_lift", label: "Instrumental Melodic Lift" },
];

export const grossUpClear = (net) => {
  const n = Number(net) || 0;
  const agency = Math.round(n * 0.2);
  return { net: n, agency, gross: n + agency };
};

export const clearMoney = (amt, cur) =>
  (cur === "USD" ? "$" : "₦") + (Number(amt) || 0).toLocaleString("en-US");

export const cohortLabel = (key) => SAMPLE_COHORTS.find((c) => c.key === key)?.label || key;

const trackId = (r) => `SYNC-2026-SMPL${String(r?.id || "000").slice(-3).toUpperCase()}`;

export const clearanceContractHtml = (r) => {
  const t = grossUpClear(r?.net_fee);
  const cur = r?.currency || "USD";
  return `<pre style="font:11px/1.5 monospace;white-space:pre-wrap;padding:28px">INTELLECTUAL PROPERTY MASTER SAMPLE CLEARANCE & ROYALTY ASSIGNMENT

This Master Recording & Composition Clearance License Agreement is executed on ${new Date().toLocaleDateString()}
by and between ${AGENCY.name} (The Escrow Broker), acting on behalf of ${r?.new_artist || "[Licensee]"} /
${r?.client_name || "[Client]"} (The Licensee), and ${r?.original_label || "[Label]"} / ${r?.original_publisher || "[Publisher]"} (The Licensor).

1. GRANT OF LICENSE & AMALGAMATION FOOTPRINT
   1.1 Scope of Sampling: The Licensor grants the Licensee the non-exclusive, irrevocable, worldwide
       right to sample, loop, chop, interpolate, and incorporate a portion of the original master sound
       recording entitled "${r?.original_song || "[Original Song]"}" performed by ${r?.original_artist || "[Original Artist]"}
       (the "Sample") into a new musical production titled "${r?.new_song_title || "[New Song]"}" performed by ${r?.new_artist || "[New Artist]"}.
   ${r?.public_domain ? "1.2 Public Domain Master: The original master recording is in the Public Domain under the Nigerian Copyright Act 2022 (50-year rule). No master license fee is due; only the publishing/composition side is cleared herein." : ""}

2. TWO-TIER ADVANCED ESCROW FEES & THE 20% SURCHARGE
   2.1 Upfront Flat Fee Buyout: The Licensee shall wire a gross sum of ${clearMoney(t.gross, cur)} directly into the
       ${AGENCY.name} corporate escrow account.
   2.2 Commission Strip: This transfer applies the mandatory 20% gross-up (${clearMoney(t.net, cur)} net to rights
       holders + ${clearMoney(t.agency, cur)} agency processing commission). Funds release instantly upon delivery
       of the signed copyright clearance certificate.

3. MECHANICAL ROYALTY AND WRITER METADATA PROJECTIONS (MCSN-cleared)
   New Master Sound Recording Ownership Split:
     New Sampling Artist / Label: 85%–90% master ownership interest.
     Original Sample Master Copyright Owner (Record Label): 10%–15% master ownership rollover interest.
   Underlying Musical Composition Splits (The Split Sheet):
     New Writers / Producers: 50%–75% of publishing administration.
     Original Songwriters / Publishers (Licensor): 25%–50% of total mechanical/performance publishing royalties.

IN WITNESS WHEREOF THE PARTIES CONCLUDE DEALS:
For: ${AGENCY.name} (Broker)            For: Label / Publishing Representative
__________________________              __________________________</pre>`;
};

export const loiHtml = (r) => {
  const t = grossUpClear(r?.net_fee);
  const cur = r?.currency || "USD";
  const stype = SAMPLE_TYPES.find((s) => s.key === r?.sample_type)?.label || "—";
  return `<pre style="font:11px/1.5 monospace;white-space:pre-wrap;padding:28px">FORMAL APPLICATION FOR SAMPLE CLEARING & INTERPOLATION ACCESS
Issued by Legal Registry: ${AGENCY.name}

SECTION A: ORIGINAL WORK METADATA (THE PARENT ASSET)
  Original Song Title: ${r?.original_song || "________________________"}
  Original Recording Performer / Artist: ${r?.original_artist || "________________________"}
  Original Record Label (Master Owner): ${r?.original_label || "________________________"}
  Original Music Publisher / PRO Controller: ${r?.original_publisher || "________________________"}

SECTION B: NEW WORK METADATA (THE DERIVATIVE ASSET)
  New Song Title & Target Genre: ${r?.new_song_title || "________________________"}
  New Sampling Performing Artist: ${r?.new_artist || "________________________"}
  Exact Sample Use Description: ${stype}
  Sample Duration & Timestamp Location: From ${r?.sample_start || "__:__"} to ${r?.sample_end || "__:__"} of the new track.

SECTION C: COMMERCIAL TERMS & SECURITY DEPOSIT
  Upfront Advanced Clearance Fee (Net to Owner): ${clearMoney(t.net, cur)}
  Agency 20% Booking/Processing Cut Added: ${clearMoney(t.agency, cur)}
  TOTAL PROMOTER FINANCIAL ESCROW ALLOCATION: ${clearMoney(t.gross, cur)} ${r?.fee_bypassed ? "(Admin Bypass — Fee Waived)" : ""}
  Proposed Underlying Publishing Share Split: [X] 50% / 50% split sheet mechanical mapping.

Authorized Agency Clearance Officer: _____________________ Date: ${new Date().toLocaleDateString()}

Escrow channels: ${AGENCY.banks} · ${AGENCY.name} · wire telemetry to ${AGENCY.email}</pre>`;
};

export const royaltyBreakdownHtml = (r) => {
  return `<pre style="font:11px/1.45 monospace;white-space:pre-wrap;padding:28px">====================================================================================
               DIGITAL STREAMING MECHANICAL ROYALTY DIVISION MATRIX
====================================================================================
 PROJECT TRACK ID: #${trackId(r)}                       RELEASE CYCLE: Q3/Q4 2026
 NEW SAMPLING TRACK: ${r?.new_song_title || "[New Song]"}             DISTRIBUTOR: [Gamma / Empire]
 ORIGINAL COMPOSITION: ${r?.original_song || "[Original Song]"}      PUBLISHING DESK: ${r?.original_publisher || "[Publisher]"}
====================================================================================

 INCOME POOL GENERATED (100% OF DIGITAL MECH ROYALTIES)
 |
 |-- MASTER RECORDING STREAMING REVENUE (50% of total DSP payout)
 |    |-- ${AGENCY.name} Escrow (20% Surcharge Cut) ......... 10.00%
 |    |-- New Sampling Artist / Indie Label Share ........ 75.00%
 |    '-- Original Sample Record Label (Rollover Cut) ..... 15.00%
 |
 '-- UNDERLYING COMPOSITION REVENUE (50% of total DSP payout)
      |-- New Songwriter / Producer Publishing Share ..... 50.00%
      '-- Original Publishers / Heritage Songwriters ..... 50.00%

====================================================================================
 REGULATORY SUBMISSION: TO BE REGISTERED DIRECTLY VIA THE MCSN INTERFACE
====================================================================================</pre>`;
};

export const dispatchEmailHtml = (r) => {
  const t = grossUpClear(r?.net_fee);
  const cur = r?.currency || "USD";
  return `<pre style="font:11px/1.5 monospace;white-space:pre-wrap;padding:28px">Subject: Official Sample Clearance Application & Escrow Advance: ${r?.new_artist || "[New Artist]"} / ${r?.original_artist || "[Original Artist]"}

Dear Synchronization and Licensing Director,

I am writing to your desk from the clearance division of ${AGENCY.name}.

Our firm represents ${r?.new_artist || "[New Artist / Label Client]"}, who is finalizing a commercial track
titled "${r?.new_song_title || "[New Track]"}". This upcoming production utilizes a controlled loop sample
interpolation of your catalog asset "${r?.original_song || "[Original Song]"}" performed by ${r?.original_artist || "[Original Artist]"}.

To bypass standard administrative delays, we have initiated our Three-Way Copyright Escrow Protocol,
placing a Gross Advanced Clearance Fee of ${clearMoney(t.gross, cur)} into our corporate agency escrow pool.

Our proposed contract offers your rights-holders an ironclad 25%–50% publishing split sheet allocation
registered through the Musical Copyright Society Nigeria (MCSN) or corresponding global PROs, while the
new master asset remains under our executive production banner.

We have attached the 30-second audio prototype and the complete metadata sheets for your swift
administrative sign-off.

Best regards,
Director of Global Copyright Clearance
${AGENCY.name}
${AGENCY.email} · ${AGENCY.phone}</pre>`;
};