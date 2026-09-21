import React from "react";
import PageHeader from "@/components/shared/PageHeader";
import { CheckCircle2, XCircle, AlertTriangle, Ban } from "lucide-react";

// CMC LISTING READINESS — raw, verified results. A row may only be VERIFIED
// when it can be demonstrated from the live system or a public blockchain.
// No placeholder technical values. Nothing is labeled VERIFIED on faith.

const STATUS = {
  verified: { icon: CheckCircle2, cls: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10", label: "VERIFIED" },
  notlive: { icon: AlertTriangle, cls: "text-yellow-400 border-yellow-400/40 bg-yellow-400/10", label: "NOT AVAILABLE / NOT YET LIVE" },
  failed: { icon: XCircle, cls: "text-destructive border-destructive/40 bg-destructive/10", label: "FAILED / CONTRADICTORY" },
};

// 1–28: the exact state of CrixCoin (CRX) as verified against the live system.
const CRX_ITEMS = [
  { n: 1, label: "Official name", status: "verified", value: "CrixCoin — confirmed in the live app branding and UI." },
  { n: 2, label: "Official ticker", status: "notlive", value: "Planned production symbol: CRXS. The in-app pre-launch label shows CRX — an internal placeholder only. CRXS is registered nowhere yet; collision searches (CMC, CoinGecko, web) found no major listed asset using CRXS, and a final live check must be re-run immediately before deployment." },
  { n: 3, label: "Blockchain / platform", status: "notlive", value: "None. CrixChain is not deployed on any chain. No testnet exists." },
  { n: 4, label: "Is CrixChain actually live?", status: "notlive", value: "No. Not producing blocks, no transactions, no public nodes." },
  { n: 5, label: "Native coin or token?", status: "notlive", value: "Neither exists today. CRXS is planned as a real ERC-20 token on an established public chain (Base network targeted — testnet first), not a native coin; there is currently no chain for it to be native to and no token contract." },
  { n: 6, label: "Contract address", status: "notlive", value: "None — no contract exists on any chain." },
  { n: 7, label: "Blockchain explorer URL", status: "notlive", value: "None — no chain, no explorer." },
  { n: 8, label: "Decimals", status: "notlive", value: "Not defined." },
  { n: 9, label: "Total supply", status: "notlive", value: "Not defined. No CRX has ever been created." },
  { n: 10, label: "Circulating supply", status: "notlive", value: "Not defined." },
  { n: 11, label: "Maximum supply", status: "notlive", value: "Not defined." },
  { n: 12, label: "Minting possible?", status: "notlive", value: "No — there is no contract, so no mint function exists. No CRX can be minted today." },
  { n: 13, label: "Burning possible?", status: "notlive", value: "No — no contract, no burn function, no CRX in existence to burn." },
  { n: 14, label: "Can an administrator change supply?", status: "notlive", value: "No — there is no CRX supply to change. (In-app fiat/CRX wallet balances are internal ledger records moved only by the server-side Crix engine; no admin mints currency.)" },
  { n: 15, label: "Consensus mechanism", status: "notlive", value: "None — no chain exists to run one." },
  { n: 16, label: "Public source-code / GitHub URL", status: "notlive", value: "None — no public CrixCoin / CrixChain repository exists." },
  { n: 17, label: "Whitepaper / documentation URL", status: "notlive", value: "None published yet." },
  { n: 18, label: "Real CRX transaction hash proving a Crix-to-Crix transfer", status: "failed", value: "No hash exists. Crix-to-Crix transfers are real but settle on Crix's INTERNAL double-entry ledger inside the RIDE X database. IDs like CRX-2026-XXXXXXXXXXXX are internal references, NOT blockchain hashes. Any 'hash' submitted would be fabricated." },
  { n: 19, label: "Publicly verifiable on a blockchain explorer?", status: "failed", value: "No. The transfers are verifiable inside the app only, by the two participants. There is no public explorer and no on-chain record." },
  { n: 20, label: "Is CRX publicly tradeable?", status: "notlive", value: "No — not tradeable anywhere." },
  { n: 21, label: "Exchange / DEX name", status: "notlive", value: "None." },
  { n: 22, label: "Trading pair", status: "notlive", value: "None." },
  { n: 23, label: "Trading-pair URL", status: "notlive", value: "None." },
  { n: 24, label: "Liquidity", status: "notlive", value: "None — no pool or liquidity exists." },
  { n: 25, label: "24-hour trading volume", status: "notlive", value: "None — zero markets exist, so the value is undefined (not 0)." },
  { n: 26, label: "CMC DexScan URL", status: "notlive", value: "None exists." },
  { n: 27, label: "Total-supply API", status: "notlive", value: "None exists — there is no supply to return." },
  { n: 28, label: "Circulating-supply API", status: "notlive", value: "None exists." },
];

// Exactly what the public CrixCoin page (/crix) says today — verbatim.
const PUBLIC_COPY = [
  { area: "CRX wallet status", says: "“CrixCoin (CRX) is planned as the native CrixChain asset. CrixChain is not live yet — no CRX token, supply or market exists today. The CRX wallet opens only when the chain launches; nothing is simulated before then.”" },
  { area: "Crix-to-Crix transfers", says: "“Live now: Crix-to-Crix transfers, settled on Crix's internal double-entry ledger inside RIDE X — this is not a blockchain transaction.”" },
  { area: "CrixChain status", says: "“…the CrixChain and its CRX asset open as each rail is genuinely connected — nothing is simulated before it exists.” Not live." },
  { area: "Funding", says: "“Wallet funding is not live yet for any currency. When a real payment rail is connected it appears here with its exact fees — Crix never pretends a rail exists before it does.”" },
  { area: "Withdrawals", says: "“External funding, withdrawals, FX, bills, cards, marketplace, escrow … open as each rail is genuinely connected — nothing is simulated before it exists.” Not live." },
  { area: "FX", says: "Same statement — not live yet; opens when a real rail is connected." },
  { area: "Bills", says: "Same statement — not live yet." },
  { area: "Cards", says: "Same statement — not live yet." },
  { area: "Marketplace", says: "Same statement — not live yet." },
  { area: "Escrow", says: "Same statement — not live yet." },
];

const READY_NOW = [
  "Official project representative (the owner)",
  "Official CrixCoin name, logo and brand artwork (in-app, live)",
  "Working custodial wallet system inside RIDE X (in-app, live)",
  "Working Crix-to-Crix transfers on the internal double-entry ledger (live, but NOT blockchain)",
];

const NOT_READY = [
  "Public CrixCoin website (in-app section only)",
  "CrixChain (not deployed, no testnet)",
  "Block explorer",
  "CRX token / contract / supply / decimals / tokenomics",
  "Any real CRX transaction hash or on-chain data",
  "Exchange listing, trading pair, liquidity, volume",
  "CMC DexScan URL",
  "Supply APIs (total & circulating)",
  "Official social accounts (X, Telegram, Discord, GitHub)",
  "Whitepaper / public documentation",
];

const BLOCKING = [
  "Functional public block explorer (CMC requirement — nothing exists to explore)",
  "Real on-chain data: genesis, transactions, supply verifiable on-chain",
  "Public trading with material volume on a tracked exchange or DEX",
  "Market data: price, volume, market cap (all undefined — zero markets)",
  "Official social channels and a dedicated public website",
  "A unique ticker not already in use on CMC (CRX is taken)",
];

function StatusChip({ status }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span className={"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide shrink-0 " + s.cls}>
      <Icon className="w-3 h-3" /> {s.label}
    </span>
  );
}

export default function CrixListingReadiness() {
  return (
    <div>
      <PageHeader
        eyebrow="CRIX CONTROL CENTER"
        title="Listing Readiness"
        subtitle="Raw verified results for the CoinMarketCap application. Nothing is labeled VERIFIED unless it can be demonstrated from the live system or a public blockchain."
      />

      <div className="rounded-2xl border border-destructive/50 bg-destructive/10 p-4 mb-6 flex items-start gap-3">
        <Ban className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-sm">DO NOT SUBMIT TO COINMARKETCAP YET — YES</p>
          <p className="text-xs text-muted-foreground mt-1">
            CMC requires a block explorer, real on-chain data, public trading with material volume and a working public website. CrixChain and CRX do not exist, so every blockchain, supply and market field would have to be invented — submitting invented values risks permanent delisting and bans. Submit only after the chain launches and CRX trades publicly.
          </p>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="text-sm uppercase tracking-[0.2em] text-primary mb-3">CrixCoin (CRX) — verified results</h2>
        <div className="space-y-2">
          {CRX_ITEMS.map((it) => (
            <div key={it.n} className="rounded-xl border border-border bg-card p-3.5">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-sm">
                  <span className="text-primary mr-1.5 tabular-nums">{it.n}.</span>{it.label}
                </p>
                <StatusChip status={it.status} />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">{it.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-sm uppercase tracking-[0.2em] text-primary mb-3">What the public CrixCoin page actually says</h2>
        <div className="space-y-2">
          {PUBLIC_COPY.map((c) => (
            <div key={c.area} className="rounded-xl border border-border bg-card p-3.5">
              <p className="font-semibold text-sm">{c.area}</p>
              <p className="text-xs text-muted-foreground mt-1 italic">{c.says}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3 mb-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-400 mb-3">Ready now</p>
          <ul className="space-y-2">
            {READY_NOW.map((t) => <li key={t} className="text-[11px] text-muted-foreground">✅ {t}</li>)}
          </ul>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-yellow-400 mb-3">Not ready</p>
          <ul className="space-y-2">
            {NOT_READY.map((t) => <li key={t} className="text-[11px] text-muted-foreground">⚠️ {t}</li>)}
          </ul>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-destructive mb-3">Blocking CMC requirements</p>
          <ul className="space-y-2">
            {BLOCKING.map((t) => <li key={t} className="text-[11px] text-muted-foreground">❌ {t}</li>)}
          </ul>
        </div>
      </section>
    </div>
  );
}