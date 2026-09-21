// SPDX-License-Identifier: MIT
//
// CrixCoin (CRXS) — PRE-LAUNCH FIXED-SUPPLY ERC-20
//
// Target network (testnet): Base Sepolia (chain ID 84532)
// Intended deployer (PUBLIC address only — the private key NEVER touches this
// project; the owner signs the deployment personally in MetaMask):
//   0xA6647b69af892b0F2894fC24FB58b2aDCbedaDE1
//
// DESIGN — deliberately minimal and transparent:
//   * OpenZeppelin ERC-20 (audited, current stable release line).
//   * The ENTIRE supply is minted ONCE in the constructor. There is NO mint
//     function, so totalSupply can never increase after deployment.
//   * NO owner / Ownable / admin role at all — nothing privileged exists.
//   * NO transfer tax, NO honeypot restriction, NO blacklist, NO backdoor,
//     NO hidden balance modification, NO fake burn, NO hidden drain.
//   * Decimals: 18 (the OpenZeppelin default). APPROVED fixed tokenomics
//     (owner, 2026-09-11): 500,000,000,000 CRXS total supply, minted ONCE to
//     the deployer. Read the real value from the contract after deployment,
//     never hard-coded.
//
// The fixed supply value is passed as a constructor argument so the number is
// entered by the human deployer at signing time (see contracts/DEPLOYMENT.md).

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract CrixCoin is ERC20 {
    /// @param initialSupply whole-token supply (500_000_000_000e18 = the approved 500 billion CRXS at 18 decimals — entered by the human deployer, see contracts/DEPLOYMENT.md)
    constructor(uint256 initialSupply) ERC20("CrixCoin", "CRXS") {
        require(initialSupply > 0, "CRXS: supply must be positive");
        _mint(msg.sender, initialSupply);
    }
}