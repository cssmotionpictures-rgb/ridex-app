// CRXS CREATION BYTECODE — the exact artifact the owner will deploy.
// RECOVERED verbatim from the real, on-chain-verified Base Sepolia deployment
// transaction — the live CRXS is a minimal standard ERC-20 compiled with
// solc 0.8.37, NOT an OpenZeppelin template. The artifact lives at
// contracts/crxs-creation-bytecode.json and is imported VERBATIM so the deploy
// bytes can never be mistyped by hand. 'bytecode' is the creation code without
// the constructor argument — the deploy console appends the approved supply
// argument at deploy time, reproducing the verified deployment data
// byte-for-byte. The contract exposes ONLY the standard ERC-20 functions:
// no mint, no owner, no tax, no blacklist, no proxy, no backdoor.
import artifact from "../../contracts/crxs-creation-bytecode.json";

export const CRXS_COMPILER = {
  version: artifact.compiler_version,
  optimizer: artifact.optimizer,
  openzeppelin: artifact.openzeppelin,
};

export const CRXS_BYTECODE_SHA256 = artifact.bytecode_sha256;

export const CRXS_CREATION_BYTECODE = artifact.bytecode;