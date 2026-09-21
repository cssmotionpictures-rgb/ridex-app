// Zero-Rejection Curator & Influencer Partnership Blueprint
// Strategy + document toolkit. Automated outreach is handled natively by
// Auto-Promote (no external SMTP/scraping — that path is a dead-end here).
import { AGENCY } from "@/lib/agency";

export const BLUEPRINT_RESOURCES = [
  {
    section: "Copyright, Metadata & Official Curation",
    items: [
      { name: "MCSN — Musical Copyright Society Nigeria", url: "https://www.mcsnnigeria.org/", note: "Register metadata & split sheets so performance royalties from curation plays are tracked and paid out automatically." },
      { name: "NCC eRegistration System", url: "http://eregistration.copyright.gov.ng/", note: "Secure your federal copyright certificate. An active NCC number on your pitch proves your music is 100% legally cleared." },
      { name: "PMAN — Performing Musicians Association of Nigeria", url: "https://pmanng.com/", note: "Cross-reference the union credentials of collaborating artists and producers." },
      { name: "COSON Registry", url: "https://www.cosonng.com/", note: "Clear mechanical publishing and background synchronization rights." },
    ],
  },
  {
    section: "Live Platforms, Music Supervisors & Distribution",
    items: [
      { name: "Flytime Promotions / Flytime Fest", url: "https://flytimefest.com/", note: "Elite West African festival ecosystem — track rising chart acts and network with festival playlist coordinators." },
      { name: "Booking Agent Info Database", url: "https://bookingagentinfo.com/industry/music-industry/", note: "Direct, non-public business emails for international curators, playlisters, A&Rs and label executives." },
      { name: "Contact Any Celebrity Portal", url: "https://contactanycelebrity.com/cac/", note: "Publicist networks and verified management contacts for elite US tastemakers and curators." },
      { name: "Scribd Music Representation Registry", url: "https://www.scribd.com/document/875255785/sdrftyh", note: "Supplementary verification repository for indie playlist curators and independent media networks." },
    ],
  },
  {
    section: "Nollywood Film Syndicators & Video Curators",
    items: [
      { name: "FilmOne Entertainment", url: "https://www.filmoneentertainment.com/", note: "West Africa's largest cinema distributor — pitch music supervisors for major theatrical sync placements." },
      { name: "Silverbird Film Distribution", url: "https://silverbirdfd.com/", note: "Submit tracks for non-theatrical licensing, commercial trailers and cinema lobby playlist rotations." },
      { name: "Blue Pictures Entertainment", url: "https://distribution.bluepicturesng.com/", note: "Independent movie premiere music sync and soundtrack curation desk." },
      { name: "Tribe Nation Theatrical", url: "https://www.tntheatrical.com/", note: "Track theatrical trailer drops to pitch high-energy song background loops." },
      { name: "Directors Guild of Nigeria", url: "https://dgn.ng/services/distribution", note: "Authoritative guild mapping standard synchronization scales for film directors." },
    ],
  },
  {
    section: "Corporate Brands & Event Aggregators (Funding Sources)",
    items: [
      { name: "Scribd Corporate Event Planners Database", url: "https://www.scribd.com/document/788832097/Event-Planners-in-Nigeria", note: "Direct contacts for high-budget event managers (MTN, Pepsi, Airtel) who hire influencers and source music." },
      { name: "Scribd Artist-Venue-Promoter Escrow Framework", url: "https://www.scribd.com/document/696349968/Artist-Venue-Promoter-Offer-Sheet-Basic", note: "Baseline template to secure three-way financial escrow safety margins." },
      { name: "Scribd Venue-Promoter Liability Contract", url: "https://www.scribd.com/document/438570379/promoter-and-venue-contract", note: "Standard indemnity and property protection parameters between organizers and venues." },
    ],
  },
];

const sheet = (body) => `<!doctype html><html><head><meta charset="utf-8"/><title>RIDE X — Zero-Rejection Blueprint</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;color:#1a1206;background:#fffdf6;max-width:820px;margin:0 auto;padding:54px 48px;line-height:1.6}
  h1{font-family:'Sora',Arial,sans-serif;font-size:22px;letter-spacing:.04em;text-transform:uppercase;color:#7a5a12;border-bottom:2px solid #c5a059;padding-bottom:10px}
  h2{font-family:'Sora',Arial,sans-serif;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:#7a5a12;margin-top:28px}
  .lede{font-style:italic;color:#5a4a30;margin:6px 0 18px}
  .sig{margin-top:36px;display:flex;justify-content:space-between;gap:40px}
  .sig div{flex:1;border-top:1px solid #7a5a12;padding-top:8px;font-size:13px}
  .badge{display:inline-block;background:#c5a059;color:#1a1206;font-weight:700;padding:3px 10px;border-radius:999px;font-size:11px;letter-spacing:.08em}
  table{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px}
  th,td{border:1px solid #d8c79a;padding:9px 11px;text-align:left}
  th{background:#f3e9cf}
  .right{text-align:right}
  .total{font-weight:700;background:#f3e9cf}
  .meta{display:flex;justify-content:space-between;font-size:13px;color:#5a4a30;margin-bottom:10px}
  .foot{margin-top:30px;font-size:11px;color:#8a7a5a;border-top:1px dashed #c5a059;padding-top:10px}
  @media print{body{padding:24px}}
</style></head><body>${body}</body></html>`;

export function generateAgreementHTML(v) {
  const agency = v.agency || AGENCY.name;
  const artist = v.artist || "[Artist Name]";
  const song = v.songTitle || "[Insert Song Title]";
  const curator = v.curator || "[Curator / Influencer Name]";
  const handle = v.handle || "@handle";
  const mediaClass = v.mediaClass || "Playlist Curator / Content Creator";
  const d = v.date || new Date().toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });

  return sheet(`
    <div class="meta"><span>Executed: ${d}</span><span class="badge">Zero-Rejection Partnership</span></div>
    <h1>Exclusive Audio Rights Clearance &amp; Viral Syndication Mandate</h1>
    <p class="lede">This Media Syndication Agreement is executed on this ${d}, by and between <strong>${agency}</strong> (The Agent), acting on behalf of <strong>${artist}</strong> (The Licensor), and <strong>${curator}</strong> (The Media Partner).</p>

    <h2>1. The User Value Incentive (Why They Won't Refuse)</h2>
    <p><strong>1.1 Blanket Content ID Waiver.</strong> The Licensor hereby grants the Media Partner a perpetual, worldwide, royalty-free license to use the musical composition and sound recording entitled "${song}" (the "Music") as background audio for all their digital content videos (TikTok, Instagram Reels, YouTube Shorts) without ever triggering a copyright strike, muted audio, or DMCA takedown notice.</p>
    <p><strong>1.2 Automated Monetization Allowance.</strong> The Media Partner retains 100% of all ad-revenue generated on their video platform channel from videos utilizing the Music. The Agent explicitly whitelists the Media Partner's handles (${handle}) within the global YouTube Content ID and Meta Rights Manager databases.</p>

    <h2>2. Revenue Reconciliation &amp; Performance Bonus</h2>
    <p><strong>2.1 The Viral Surcharge Tier.</strong> If the Media Partner's video or playlist placement causes the track to hit a specific viral metric (e.g. generating over 500,000 unique video uses on TikTok or driving 100,000 organic streams), the Agent will apply its standard 20% gross-up administrative commission to a specialized performance bonus of &#8358;500,000 paid directly to the Media Partner.</p>
    <p><strong>2.2 Co-Broker Payout Loop.</strong> If the Media Partner utilizes the Music to secure a corporate brand activation deal or movie soundtrack sync through networks like FilmOne Entertainment, the Agent splits its booking cut, paying the Media Partner a 5% cash co-broker fee from the gross transaction value.</p>

    <h2>3. Cancellation &amp; Defamation Penalty Clause</h2>
    <p>The Media Partner agrees to act as a positive digital shield for the Artist. If the Media Partner associates the Music with offensive, illegal, or highly defamatory content, the Agent reserves the right to instantly revoke the Content ID whitelist status, file immediate platform copyright takedowns, and claim damages under the laws of the Federal Republic of Nigeria.</p>

    <p style="margin-top:14px"><em>Classification:</em> ${mediaClass} &nbsp;·&nbsp; <em>Handle:</em> ${handle}</p>

    <div class="sig">
      <div>For: ${agency} (Agent)<br/><br/><br/>___________________________</div>
      <div>For: ${curator} (Media Partner)<br/><br/><br/>___________________________</div>
    </div>
    <div class="foot">Generated by RIDE X · ${AGENCY.name} · ${AGENCY.phone} · ${AGENCY.email}</div>
  `);
}

export function generateInvoiceHTML(v) {
  const client = v.client || "[Client Name]";
  const exec = v.exec || "[Primary Project executive]";
  const project = v.project || "[Target Song Title for Promotion]";
  const serial = v.invoiceSerial || `AG-2026-MP${Math.floor(100 + Math.random() * 900)}`;
  const d = v.date || new Date().toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
  const base = Number(v.baseRate) || 500000;
  const net = base; // intake screening & clearance (net to agency)
  const agency = Math.round(net * 0.2); // 20% gross-up commission added on top
  const gross = net + agency;
  const total = gross;

  return sheet(`
    <div class="meta"><span><strong>RIDE X</strong> — Lagos, Nigeria</span><span>${AGENCY.email} · ${AGENCY.phone}</span></div>
    <h1>Commercial Media Placement &amp; Curation Invoice</h1>
    <p class="lede">Scope: Global Playlist &amp; Influencer Residency Setup · Settlement: Due Upon Campaign Launch</p>
    <table>
      <tr><th>Invoice Cleared To</th><th>Transaction Ledger</th></tr>
      <tr><td>Client: ${client}<br/>Attn: ${exec}<br/>Project: ${project}</td>
      <td>Invoice Serial: #${serial}<br/>Date: ${d}<br/>Status: Pending Escrow</td></tr>
    </table>

    <h2>Billing Matrix</h2>
    <table>
      <tr><th>Line Item / Commercial Description</th><th>Qty</th><th class="right">Unit Rate</th><th class="right">Total</th></tr>
      <tr><td>Curator &amp; Influencer Direct Placement (Free Roster Residency) — Media outreach setup: ${project}</td><td>1</td><td class="right">&#8358;0</td><td class="right">&#8358;0</td></tr>
      <tr><td>Agency Media Intake Screening &amp; Metadata Clearance — Content ID whitelisting, platform indexing, split management</td><td>1</td><td class="right">&#8358;${net.toLocaleString()}</td><td class="right">&#8358;${net.toLocaleString()}</td></tr>
      <tr><td>Agency Corporate Booking Surcharge (20% gross-up commission)</td><td>1</td><td class="right">&#8358;${agency.toLocaleString()}</td><td class="right">&#8358;${agency.toLocaleString()}</td></tr>
      <tr class="total"><td colspan="3">Total Outstanding Balance Due</td><td class="right">&#8358;${gross.toLocaleString()}</td></tr>
    </table>

    <h2>Required Escrow Deposit &amp; Audited Clearance Channels</h2>
    <p><strong>Required Escrow Balance Deposit: &#8358;${gross.toLocaleString()}</strong></p>
    <p>Corporate Bank Entity: ${AGENCY.banks}<br/>Escrow route (NGN) — forward wire telemetry to ${AGENCY.email} to release the vocal tracking links.</p>
    <div class="foot">Generated by RIDE X · ${AGENCY.name} · ${AGENCY.phone} · Invoice #${serial}</div>
  `);
}

export function printHtml(html) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 400);
  return true;
}