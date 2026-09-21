import { describe, it, expect } from "vitest";
import {
  encodeUint256Arg, buildDeployData, decodeUint, decodeString, encodeAddressArg, BASE_SEPOLIA,
} from "@/lib/crxsChain";
import { CRXS } from "@/lib/crxsTokenomics";

const PAD64 = (n) => BigInt(n).toString(16).padStart(64, "0");

describe("CRXS deployment codec", () => {
  it("encodes the approved constructor argument as exactly one 32-byte word", () => {
    const enc = encodeUint256Arg(CRXS.CONSTRUCTOR_ARG);
    expect(enc).toHaveLength(64);
    expect(BigInt("0x" + enc).toString()).toBe(CRXS.CONSTRUCTOR_ARG);
  });

  it("builds deploy data = creation bytecode + ABI-encoded supply", () => {
    const data = buildDeployData("0x6080604052", CRXS.CONSTRUCTOR_ARG);
    expect(data).toBe("0x6080604052" + encodeUint256Arg(CRXS.CONSTRUCTOR_ARG));
    expect(data).toHaveLength("0x6080604052".length + 64);
  });

  it("rejects invalid inputs — zero supply, non-numeric supply, bad bytecode", () => {
    expect(() => encodeUint256Arg("0")).toThrow();
    expect(() => encodeUint256Arg("abc")).toThrow();
    expect(() => buildDeployData("nothex", CRXS.CONSTRUCTOR_ARG)).toThrow();
  });

  it("decodes uint256 and string call results", () => {
    expect(decodeUint("0x" + "0".repeat(62) + "12").toString()).toBe("18");
    const nameHex = "0x" + PAD64(0x20) + PAD64(8) + "43726978436f696e"; // "CrixCoin" (8 bytes)
    expect(decodeString(nameHex)).toBe("CrixCoin");
  });

  it("encodes address args with 12 zero bytes, lowercased", () => {
    const enc = encodeAddressArg("0xA6647b69af892b0F2894fC24FB58b2aDCbedaDE1");
    expect(enc).toHaveLength(64);
    expect(enc.slice(0, 24)).toBe("0".repeat(24));
    expect(enc.slice(24)).toBe("a6647b69af892b0f2894fc24fb58b2adcbedade1");
  });

  it("locks the Base Sepolia chain facts", () => {
    expect(BASE_SEPOLIA.chainId).toBe(84532);
    expect(BASE_SEPOLIA.chainIdHex.toLowerCase()).toBe("0x" + 84532 .toString(16));
  });
});