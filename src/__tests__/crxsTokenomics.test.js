import { describe, it, expect } from "vitest";
import { CRXS } from "@/lib/crxsTokenomics";

// Locks the owner-approved CRXS tokenomics (2026-09-11) so no edit can silently
// change the supply or the raw constructor argument the owner will sign.
describe("CRXS approved tokenomics", () => {
  it("locks identity and decimals", () => {
    expect(CRXS.NAME).toBe("CrixCoin");
    expect(CRXS.SYMBOL).toBe("CRXS");
    expect(CRXS.DECIMALS).toBe(18);
  });

  it("locks the fixed total supply at 500 billion", () => {
    expect(CRXS.TOTAL_SUPPLY_WHOLE).toBe(500_000_000_000);
  });

  it("constructor argument equals exactly 500,000,000,000 × 10^18", () => {
    const expected = (BigInt(CRXS.TOTAL_SUPPLY_WHOLE) * 10n ** BigInt(CRXS.DECIMALS)).toString();
    expect(CRXS.CONSTRUCTOR_ARG).toBe("500000000000000000000000000000");
    expect(CRXS.CONSTRUCTOR_ARG).toBe(expected);
  });

  it("locks the approved deployer wallet and testnet", () => {
    expect(CRXS.DEPLOYER).toBe("0xA6647b69af892b0F2894fC24FB58b2aDCbedaDE1");
    expect(CRXS.TESTNET_CHAIN_ID).toBe(84532);
    expect(CRXS.TESTNET_NAME).toBe("Base Sepolia");
  });
});