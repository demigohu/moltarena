// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * Molt Arena Escrow — EVM on Hedera (testnet/mainnet), native HBAR.
 * - Resolver (backend) creates match, then resolve() or cancelAndRefund().
 * - Agents deposit HBAR via deposit(matchId); winner gets pot (minus fee).
 */
contract MoltArenaEscrow {
    address public resolver;
    address public treasury;
    uint256 public feeBps; // basis points, e.g. 100 = 1%

    struct Match {
        address agent1;
        address agent2;
        uint256 wagerAmount;
        bool deposit1;
        bool deposit2;
        bool resolved;
        bool cancelled;
    }

    mapping(bytes32 => Match) public matches;
    mapping(bytes32 => uint256) public matchBalance;

    event MatchCreated(bytes32 indexed matchId, address agent1, address agent2, uint256 wagerAmount);
    event Deposited(bytes32 indexed matchId, address indexed agent, uint256 amount);
    event Resolved(bytes32 indexed matchId, address indexed winner, uint256 payout, uint256 fee);
    event Cancelled(bytes32 indexed matchId);
    event Refunded(bytes32 indexed matchId, address indexed agent, uint256 amount);

    error OnlyResolver();
    error InvalidAgents();
    error InvalidWager();
    error MatchExists();
    error MatchNotFound();
    error MatchEnded();
    error WrongAmount();
    error AlreadyDeposited();
    error NotAPlayer();
    error NotBothDeposited();
    error InvalidWinner();
    error TransferFailed();

    modifier onlyResolver() {
        _onlyResolver();
        _;
    }

    function _onlyResolver() internal view {
        if (msg.sender != resolver) revert OnlyResolver();
    }

    constructor(address _resolver, address _treasury, uint256 _feeBps) {
        resolver = _resolver;
        treasury = _treasury;
        feeBps = _feeBps;
    }

    /**
     * Backend creates match after game_matched. matchId = bytes32(keccak256(abi.encodePacked(uuid))).
     */
    function createMatch(
        bytes32 matchId,
        address agent1,
        address agent2,
        uint256 wagerAmount
    ) external onlyResolver {
        if (agent1 == address(0) || agent2 == address(0) || agent1 == agent2) revert InvalidAgents();
        if (wagerAmount == 0) revert InvalidWager();
        if (matches[matchId].agent1 != address(0)) revert MatchExists();

        matches[matchId] = Match({
            agent1: agent1,
            agent2: agent2,
            wagerAmount: wagerAmount,
            deposit1: false,
            deposit2: false,
            resolved: false,
            cancelled: false
        });
        emit MatchCreated(matchId, agent1, agent2, wagerAmount);
    }

    /**
     * Agent sends MON (msg.value must equal match wagerAmount). Call after createMatch.
     */
    function deposit(bytes32 matchId) external payable {
        Match storage m = matches[matchId];
        if (m.agent1 == address(0)) revert MatchNotFound();
        if (m.resolved || m.cancelled) revert MatchEnded();
        if (msg.value != m.wagerAmount) revert WrongAmount();

        if (msg.sender == m.agent1) {
            if (m.deposit1) revert AlreadyDeposited();
            m.deposit1 = true;
        } else if (msg.sender == m.agent2) {
            if (m.deposit2) revert AlreadyDeposited();
            m.deposit2 = true;
        } else {
            revert NotAPlayer();
        }

        matchBalance[matchId] += msg.value;
        emit Deposited(matchId, msg.sender, msg.value);
    }

    /**
     * Backend calls after game ends. Winner gets (2 * wager - fee).
     */
    function resolve(bytes32 matchId, address winner) external onlyResolver {
        Match storage m = matches[matchId];
        if (m.agent1 == address(0)) revert MatchNotFound();
        if (m.resolved || m.cancelled) revert MatchEnded();
        if (!m.deposit1 || !m.deposit2) revert NotBothDeposited();
        if (winner != m.agent1 && winner != m.agent2) revert InvalidWinner();

        m.resolved = true;
        uint256 total = matchBalance[matchId];
        uint256 fee = (total * feeBps) / 10000;
        uint256 payout = total - fee;
        matchBalance[matchId] = 0;

        if (payout > 0) {
            (bool ok,) = payable(winner).call{value: payout}("");
            if (!ok) revert TransferFailed();
        }
        if (fee > 0 && treasury != address(0)) {
            (bool okFee,) = payable(treasury).call{value: fee}("");
            if (!okFee) revert TransferFailed();
        }
        emit Resolved(matchId, winner, payout, fee);
    }

    /**
     * Backend calls on deposit timeout. Refunds each depositor their wager.
     */
    function cancelAndRefund(bytes32 matchId) external onlyResolver {
        Match storage m = matches[matchId];
        if (m.agent1 == address(0)) revert MatchNotFound();
        if (m.resolved || m.cancelled) revert MatchEnded();

        m.cancelled = true;
        matchBalance[matchId] = 0;

        if (m.deposit1 && m.wagerAmount > 0) {
            (bool ok1,) = payable(m.agent1).call{value: m.wagerAmount}("");
            if (!ok1) revert TransferFailed();
            emit Refunded(matchId, m.agent1, m.wagerAmount);
        }
        if (m.deposit2 && m.wagerAmount > 0) {
            (bool ok2,) = payable(m.agent2).call{value: m.wagerAmount}("");
            if (!ok2) revert TransferFailed();
            emit Refunded(matchId, m.agent2, m.wagerAmount);
        }
        emit Cancelled(matchId);
    }

    receive() external payable {}
}
