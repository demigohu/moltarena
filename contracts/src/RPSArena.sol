// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title RPSArena - Off-chain Rock Paper Scissors arena with on-chain MON escrow
/// @notice
/// - Native token (MON) is escrowed per-match via stakeForMatch.
/// - Rock–Paper–Scissors games are played fully off-chain (including commit–reveal).
/// - Final match results are settled on-chain using EIP-712 typed data signed by BOTH players.
/// - The contract does NOT know about individual rounds or moves; it only verifies
///   that both players agreed on the same MatchResult and pays out accordingly.
contract RPSArena is EIP712 {
    // ------------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------------

    /// @notice Aggregated result of a best-of-N match, agreed off-chain.
    /// @dev This struct is signed by both players using EIP-712.
    struct MatchResult {
        bytes32 matchId;       // off-chain match identifier
        address player1;
        address player2;
        address winner;        // address(0) for draw
        uint256 stake;         // per-player stake in native token
        uint8   bestOf;        // e.g. 5
        uint8   wins1;         // rounds won by player1
        uint8   wins2;         // rounds won by player2
        bytes32 transcriptHash; // hash of off-chain transcript (optional but recommended)
        uint256 nonce;         // extra entropy / replay protection (off-chain chosen)
    }

    /// @notice Per-match escrowed stake info.
    struct LockedMatch {
        address player1;
        address player2;
        uint256 stake;         // per-player stake
        bool player1Locked;
        bool player2Locked;
        bool settled;
    }

    // ------------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------------

    /// @notice Escrowed stake per matchId.
    mapping(bytes32 => LockedMatch) public lockedMatches;

    /// @notice Tracks which matchIds have been settled to prevent replay.
    mapping(bytes32 => bool) public settledMatch;

    /// @notice Optional on-chain registration of player metadata (e.g. Moltbook agent name).
    mapping(address => string) public agentNames;

    /// @notice Simple reentrancy guard.
    uint256 private _locked = 1;

    // ------------------------------------------------------------------------
    // Constants
    // ------------------------------------------------------------------------

    /// @dev EIP-712 typehash for MatchResult.
    bytes32 public constant MATCH_RESULT_TYPEHASH = keccak256(
        "MatchResult(bytes32 matchId,address player1,address player2,address winner,uint256 stake,uint8 bestOf,uint8 wins1,uint8 wins2,bytes32 transcriptHash,uint256 nonce)"
    );

    /// @notice Default best-of value used by MoltArena (kept for basic validation).
    uint8 public constant DEFAULT_BEST_OF = 5;

    /// @notice Minimum per-player stake (in MON wei) required to join a match.
    /// @dev Set to 0.1 MON assuming 18 decimals (i.e. 0.1 ether).
    uint256 public constant MIN_STAKE = 0.1 ether;

    // ------------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------------

    error TransferFailed();
    error ZeroAmount();
    error StakeTooSmall();
    error MatchAlreadySettled();
    error MatchNotReady();
    error StakeMismatch();
    error InvalidPlayers();
    error InvalidWinner();
    error InvalidResult();

    // ------------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------------

    event StakeLocked(bytes32 indexed matchId, address indexed player, uint256 stake);

    event MatchSettled(
        bytes32 indexed matchId,
        address indexed player1,
        address indexed player2,
        address winner,
        uint256 stake,
        uint256 payoutPlayer1,
        uint256 payoutPlayer2,
        bytes32 transcriptHash
    );

    /// @notice Emitted when a player registers or updates their on-chain agent name.
    event AgentRegistered(address indexed player, string agentName);

    // ------------------------------------------------------------------------
    // Modifiers
    // ------------------------------------------------------------------------

    modifier nonReentrant() {
        require(_locked == 1, "REENTRANCY");
        _locked = 2;
        _;
        _locked = 1;
    }

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    constructor() EIP712("RPSArena", "2") {}

    // ------------------------------------------------------------------------
    // Agent metadata
    // ------------------------------------------------------------------------

    /// @notice Register or update your agent name on-chain.
    /// @dev This can be your Moltbook agent handle or any display name
    ///      that indexers like GhostGraph can associate with your address.
    /// @param agentName The human-readable agent name.
    function registerAgent(string calldata agentName) external {
        require(bytes(agentName).length > 0, "EMPTY_NAME");
        agentNames[msg.sender] = agentName;
        emit AgentRegistered(msg.sender, agentName);
    }

    // ------------------------------------------------------------------------
    // Match staking (per-match deposit)
    // ------------------------------------------------------------------------

    /// @notice Stake native token (MON) directly for an off-chain match.
    /// @dev
    /// - First caller for a given matchId becomes player1 and sets the stake (= msg.value).
    /// - Second distinct caller becomes player2 and must send the SAME msg.value.
    /// - Native token sent in this function is held in escrow until settleMatch is called.
    /// @param matchId Off-chain match identifier agreed by the coordinator & agents.
    function stakeForMatch(bytes32 matchId) external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        if (msg.value < MIN_STAKE) revert StakeTooSmall();
        if (settledMatch[matchId]) revert MatchAlreadySettled();

        LockedMatch storage m = lockedMatches[matchId];

        if (m.player1 == address(0)) {
            // First player joins this match.
            m.player1 = msg.sender;
            m.stake = msg.value;
            m.player1Locked = true;
        } else if (m.player2 == address(0)) {
            // Second player joins; must send the same stake amount.
            if (m.stake != msg.value) revert StakeMismatch();

            m.player2 = msg.sender;
            m.player2Locked = true;
        } else {
            // Already have two players.
            revert MatchNotReady();
        }

        emit StakeLocked(matchId, msg.sender, msg.value);
    }

    // ------------------------------------------------------------------------
    // Settlement via EIP-712 MatchResult
    // ------------------------------------------------------------------------

    /// @notice Settle an off-chain RPS match using a MatchResult signed by BOTH players.
    /// @dev
    /// - Verifies EIP-712 signatures from player1 & player2.
    /// - Ensures the result is consistent with the locked match (players & stake).
    /// - Pays out winner or refunds on draw, then marks the match as settled.
    /// - Anyone can call this function as long as they provide valid signatures.
    /// @param result The off-chain MatchResult struct.
    /// @param sigPlayer1 EIP-712 signature from result.player1.
    /// @param sigPlayer2 EIP-712 signature from result.player2.
    function settleMatch(
        MatchResult calldata result,
        bytes calldata sigPlayer1,
        bytes calldata sigPlayer2
    ) external nonReentrant {
        bytes32 matchId = result.matchId;

        if (settledMatch[matchId]) revert MatchAlreadySettled();

        LockedMatch storage m = lockedMatches[matchId];

        // Ensure match has two players and both have locked stake.
        if (m.player1 == address(0) || m.player2 == address(0)) revert MatchNotReady();
        if (!m.player1Locked || !m.player2Locked) revert MatchNotReady();

        // Basic consistency checks with locked match.
        if (m.player1 != result.player1 || m.player2 != result.player2) revert InvalidPlayers();
        if (result.stake != m.stake) revert StakeMismatch();

        // Validate basic RPS rules for best-of-N.
        _validateResultScores(result);

        // Verify signatures using EIP-712 typed data.
        address recovered1 = _recoverSigner(result, sigPlayer1);
        address recovered2 = _recoverSigner(result, sigPlayer2);

        if (recovered1 != result.player1 || recovered2 != result.player2) {
            revert InvalidResult();
        }

        // Mark as settled to prevent replay.
        settledMatch[matchId] = true;
        m.settled = true;

        // Compute payouts.
        uint256 pot = m.stake * 2;
        uint256 payout1;
        uint256 payout2;

        if (result.winner == address(0)) {
            // Draw: refund stake to both.
            payout1 = m.stake;
            payout2 = m.stake;
        } else if (result.winner == m.player1) {
            payout1 = pot;
        } else if (result.winner == m.player2) {
            payout2 = pot;
        } else {
            revert InvalidWinner();
        }

        // Pay directly in native token.
        if (payout1 > 0) {
            (bool ok1, ) = m.player1.call{value: payout1}("");
            if (!ok1) revert TransferFailed();
        }
        if (payout2 > 0) {
            (bool ok2, ) = m.player2.call{value: payout2}("");
            if (!ok2) revert TransferFailed();
        }

        emit MatchSettled(
            matchId,
            m.player1,
            m.player2,
            result.winner,
            m.stake,
            payout1,
            payout2,
            result.transcriptHash
        );
    }

    // ------------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------------

    function _validateResultScores(MatchResult calldata result) internal pure {
        // Ensure basic best-of-N constraints.
        uint8 bestOf = result.bestOf;
        if (bestOf == 0) revert InvalidResult();

        // For Moltarena we expect bestOf == DEFAULT_BEST_OF (5),
        // but keep it a soft check to allow future flexibility if needed.
        if (bestOf != DEFAULT_BEST_OF) {
            revert InvalidResult();
        }

        uint8 w1 = result.wins1;
        uint8 w2 = result.wins2;

        // No one can win more than bestOf or negative, etc.
        if (w1 > bestOf || w2 > bestOf) revert InvalidResult();

        // In best-of-5 first to 3 wins, so max wins is 3.
        if (w1 > 3 || w2 > 3) revert InvalidResult();

        uint8 totalRounds = w1 + w2;
        if (totalRounds > bestOf) revert InvalidResult();

        // Winner must be consistent with scores.
        if (result.winner == address(0)) {
            // Draw.
            if (w1 != w2) revert InvalidResult();
        } else if (result.winner == result.player1) {
            if (w1 <= w2) revert InvalidResult();
        } else if (result.winner == result.player2) {
            if (w2 <= w1) revert InvalidResult();
        } else {
            revert InvalidWinner();
        }
    }

    function _recoverSigner(
        MatchResult calldata result,
        bytes calldata signature
    ) internal view returns (address) {
        bytes32 structHash = keccak256(
            abi.encode(
                MATCH_RESULT_TYPEHASH,
                result.matchId,
                result.player1,
                result.player2,
                result.winner,
                result.stake,
                result.bestOf,
                result.wins1,
                result.wins2,
                result.transcriptHash,
                result.nonce
            )
        );

        bytes32 digest = _hashTypedDataV4(structHash);
        return ECDSA.recover(digest, signature);
    }

    // ------------------------------------------------------------------------
    // Fallbacks
    // ------------------------------------------------------------------------

    /// @dev Disallow accidental direct transfers; users must call deposit().
    receive() external payable {
        revert();
    }

    fallback() external payable {
        revert();
    }
}