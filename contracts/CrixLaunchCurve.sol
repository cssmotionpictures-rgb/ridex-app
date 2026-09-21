// SPDX-License-Identifier: MIT
//
// CrixLaunchCurve — OWNER-SIGNED BONDING CURVE for the EXISTING verified
// CrixCoin (CRXS) token on Base Mainnet.
//
// DESIGN — deliberately minimal, transparent and self-custodial:
//   * The curve holds REAL CRXS transferred in by the owner (approve + fund).
//     No new token is ever created. The verified CRIXCOIN contract stays the
//     canonical token: 0xb7a10024941f5286d9686b0bb8ebf6cb88c7453f
//   * Pricing is a constant-product curve with a small VIRTUAL ETH offset
//     (the pump.fun / Clanker model): price starts near zero and rises as
//     buyers deposit ETH. The invariant is enforced on-chain by this
//     contract — no third party, no oracle, no launchpad.
//   * ZERO capital required: the curve starts with 0 ETH reserve. The first
//     buyer's deposit becomes the reserve. The owner funds only CRXS.
//   * Buyer protection: the entire real ETH reserve backs sells until
//     graduation. The owner CANNOT withdraw the reserve before graduation.
//   * Fees are fixed at deployment (hard-capped at 5%), taken in the
//     incoming asset, and claimable only from the separate fee accumulators
//     — they never touch the sell-backing reserve.
//   * GRADUATION: when the ETH reserve reaches the threshold (e.g. 5 ETH),
//     trading on the curve closes. After that, only the owner can migrate
//     the reserve + remaining CRXS to a DEX pool (Uniswap V4 / Aerodrome),
//     in owner-signed transactions visible on-chain.
//   * No mint, no hidden owner powers over user balances, no blacklist,
//     no pausing of trades, no backdoor. The only owner powers are:
//     fund(), claimFees() and post-graduation migrate().
//
// The private key NEVER touches the app — the owner deploys, approves, funds
// and migrates personally in MetaMask.

pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract CrixLaunchCurve is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------
    // Immutable launch parameters — fixed at deployment, visible forever
    // ------------------------------------------------------------------
    IERC20 public immutable token;              // the verified CRXS ERC-20
    uint256 public immutable virtualEthOffset;  // virtual ETH offset (start price ≈ offset / tokenReserve)
    uint256 public immutable graduationThresholdEth; // real ETH reserve that closes the curve
    uint16  public immutable buyFeeBps;         // buy fee in basis points (≤ 500)
    uint16  public immutable sellFeeBps;        // sell fee in basis points (≤ 500)

    // ------------------------------------------------------------------
    // Live curve state
    // ------------------------------------------------------------------
    uint256 public tokenReserve; // CRXS held by the curve and still for sale
    uint256 public ethReserve;  // REAL ETH backing every sell — untouchable pre-graduation
    uint256 public ethFees;     // accumulated buy fees (ETH) — owner-claimable
    uint256 public tokenFees;   // accumulated sell fees (CRXS) — owner-claimable
    bool    public graduated;    // true once the reserve reached the threshold
    address public migratedTo;  // DEX pool/recipient after graduation migration

    event Funded(address indexed funder, uint256 amount);
    event Buy(address indexed buyer, uint256 ethIn, uint256 tokensOut, uint256 fee);
    event Sell(address indexed seller, uint256 tokenIn, uint256 ethOut, uint256 fee);
    event Graduated(uint256 ethReserveAtGraduation);
    event Migrated(address indexed to, uint256 ethAmount, uint256 tokenAmount);
    event FeesClaimed(address indexed owner, uint256 ethAmount, uint256 tokenAmount);

    error TradingClosed();
    error NotFunded();
    error EmptyReserve();
    error BadAmount();
    error Slippage();
    error EthTransferFailed();
    error NotGraduated();
    error AlreadyMigrated();

    modifier tradingOpen() {
        if (graduated) revert TradingClosed();
        if (tokenReserve == 0) revert NotFunded();
        _;
    }

    constructor(
        address token_,
        uint256 virtualEthOffset_,
        uint256 graduationThresholdEth_,
        uint16 buyFeeBps_,
        uint16 sellFeeBps_
    ) Ownable(msg.sender) {
        if (token_ == address(0)) revert BadAmount();
        if (virtualEthOffset_ == 0) revert BadAmount();
        if (graduationThresholdEth_ == 0) revert BadAmount();
        if (buyFeeBps_ > 500 || sellFeeBps_ > 500) revert BadAmount();
        token = IERC20(token_);
        virtualEthOffset = virtualEthOffset_;
        graduationThresholdEth = graduationThresholdEth_;
        buyFeeBps = buyFeeBps_;
        sellFeeBps = sellFeeBps_;
    }

    /// The curve never accepts raw ETH — buys must go through buy().
    receive() external payable {
        revert("direct ETH not allowed - use buy()");
    }

    // ------------------------------------------------------------------
    // Owner: fund the curve with the EXISTING verified CRXS.
    // Allowed only before the first trade (keeps the price model honest).
    // May be called more than once while no ETH has entered yet.
    // ------------------------------------------------------------------
    function fund(uint256 amount) external onlyOwner {
        if (amount == 0) revert BadAmount();
        if (graduated) revert TradingClosed();
        if (ethReserve != 0 || ethFees != 0) revert TradingClosed();
        token.safeTransferFrom(msg.sender, address(this), amount);
        tokenReserve += amount;
        emit Funded(msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // BUY: deposit ETH, receive CRXS at the curve price.
    // Price = (ethReserve + virtualEthOffset) / tokenReserve — rises as
    // the ETH reserve grows. minTokensOut protects against slippage.
    // ------------------------------------------------------------------
    function buy(uint256 minTokensOut) external payable nonReentrant tradingOpen {
        uint256 ethIn = msg.value;
        if (ethIn == 0) revert BadAmount();

        uint256 fee = (ethIn * buyFeeBps) / 10_000;
        uint256 ethNet = ethIn - fee;

        uint256 virtualEth = ethReserve + virtualEthOffset;
        uint256 invariant = tokenReserve * virtualEth;
        uint256 newTokenReserve = invariant / (virtualEth + ethNet);
        uint256 tokensOut = tokenReserve - newTokenReserve;
        if (tokensOut < minTokensOut) revert Slippage();

        ethFees += fee;
        ethReserve += ethNet;
        tokenReserve = newTokenReserve;
        token.safeTransfer(msg.sender, tokensOut);

        if (ethReserve >= graduationThresholdEth) {
            graduated = true;
            emit Graduated(ethReserve);
        }
        emit Buy(msg.sender, ethIn, tokensOut, fee);
    }

    // ------------------------------------------------------------------
    // SELL: return CRXS, receive ETH from the REAL reserve.
    // The math can never overdraw the reserve: ethOut ≤ ethReserve always.
    // ------------------------------------------------------------------
    function sell(uint256 tokenAmount, uint256 minEthOut) external nonReentrant tradingOpen {
        if (tokenAmount == 0) revert BadAmount();
        if (ethReserve == 0) revert EmptyReserve();

        uint256 fee = (tokenAmount * sellFeeBps) / 10_000;
        uint256 tokenNet = tokenAmount - fee;

        uint256 virtualEth = ethReserve + virtualEthOffset;
        uint256 invariant = tokenReserve * virtualEth;
        token.safeTransferFrom(msg.sender, address(this), tokenAmount);

        uint256 newVirtualEth = invariant / (tokenReserve + tokenNet);
        uint256 ethOut = virtualEth - newVirtualEth;
        if (ethOut < minEthOut) revert Slippage();

        tokenReserve += tokenNet;
        tokenFees += fee;
        ethReserve = newVirtualEth - virtualEthOffset;

        (bool ok, ) = msg.sender.call{value: ethOut}("");
        if (!ok) revert EthTransferFailed();
        emit Sell(msg.sender, tokenAmount, ethOut, fee);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    /// ETH price of 1 whole CRXS (18 decimals), wei per 1e18 tokens.
    function pricePerToken() external view returns (uint256) {
        if (tokenReserve == 0) return 0;
        return ((ethReserve + virtualEthOffset) * 1e18) / tokenReserve;
    }

    /// Simulated buy output for amountIn wei ETH (fees included).
    function quoteBuy(uint256 ethIn) external view returns (uint256 tokensOut, uint256 fee) {
        fee = (ethIn * buyFeeBps) / 10_000;
        uint256 ethNet = ethIn - fee;
        uint256 virtualEth = ethReserve + virtualEthOffset;
        uint256 invariant = tokenReserve * virtualEth;
        uint256 newTokenReserve = invariant / (virtualEth + ethNet);
        return (tokenReserve - newTokenReserve, fee);
    }

    /// Simulated sell output for tokenAmount CRXS (raw units).
    function quoteSell(uint256 tokenAmount) external view returns (uint256 ethOut, uint256 fee) {
        fee = (tokenAmount * sellFeeBps) / 10_000;
        uint256 tokenNet = tokenAmount - fee;
        uint256 virtualEth = ethReserve + virtualEthOffset;
        uint256 invariant = tokenReserve * virtualEth;
        uint256 newVirtualEth = invariant / (tokenReserve + tokenNet);
        return (virtualEth - newVirtualEth, fee);
    }

    // ------------------------------------------------------------------
    // Owner: claim accumulated trading fees. NEVER touches ethReserve —
    // the sell-backing reserve stays whole until graduation.
    // ------------------------------------------------------------------
    function claimFees() external onlyOwner nonReentrant {
        uint256 ethOut = ethFees;
        uint256 tokensOut = tokenFees;
        if (ethOut == 0 && tokensOut == 0) revert BadAmount();
        ethFees = 0;
        tokenFees = 0;
        if (tokensOut > 0) token.safeTransfer(msg.sender, tokensOut);
        if (ethOut > 0) {
            (bool ok, ) = msg.sender.call{value: ethOut}("");
            if (!ok) revert EthTransferFailed();
        }
        emit FeesClaimed(msg.sender, ethOut, tokensOut);
    }

    // ------------------------------------------------------------------
    // Owner: AFTER graduation only — move the ETH reserve and remaining
    // CRXS to a DEX pool (Uniswap V4 / Aerodrome) in a fully visible,
    // owner-signed transaction. Before graduation this is impossible.
    // ------------------------------------------------------------------
    function migrate(address target) external onlyOwner nonReentrant {
        if (!graduated) revert NotGraduated();
        if (target == address(0)) revert BadAmount();
        if (migratedTo != address(0)) revert AlreadyMigrated();

        uint256 ethOut = ethReserve;
        uint256 tokensOut = tokenReserve;
        migratedTo = target;
        ethReserve = 0;
        tokenReserve = 0;

        if (tokensOut > 0) token.safeTransfer(target, tokensOut);
        if (ethOut > 0) {
            (bool ok, ) = target.call{value: ethOut}("");
            if (!ok) revert EthTransferFailed();
        }
        emit Migrated(target, ethOut, tokensOut);
    }
}