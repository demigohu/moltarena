// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title RPSArena - Rock Paper Scissors best-of-5 arena with MON escrow
/// @notice Native token (MON) wager, commit–reveal per round, 60s timeouts.
contract RPSArena {
    // ------------------------------------------------------------------------
    // Types
    // ------------------------------------------------------------------------

    enum Move {
        None,
        Rock,
        Paper,
        Scissors
    }

    enum MatchStatus {
        WaitingCommits,
        WaitingReveals,
        Finished
    }

    struct Round {
        bytes32 commit1;
        bytes32 commit2;
        Move move1;
        Move move2;
        uint64 commitDeadline; // timestamp when commit phase expires
        uint64 revealDeadline; // timestamp when reveal phase expires
        bool revealed1;
        bool revealed2;
        bool decided; // round result has been applied to match scores
    }

    struct Match {
        address player1;
        address player2;
        uint96 wager; // per-player wager in native token
        uint8 roundsPlayed; // total rounds resolved (including draws and timeouts)
        uint8 wins1;
        uint8 wins2;
        MatchStatus status;
        bool settled; // payouts done
    }

    // ------------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------------

    /// @notice Next match identifier (starts from 1)
    uint256 public nextMatchId = 1;

    /// @notice Mapping of match id to Match data
    mapping(uint256 => Match) public matches;

    /// @notice Mapping of match id => round => Round data
    mapping(uint256 => mapping(uint8 => Round)) public rounds;

    /// @notice Simple matchmaking queue by wager amount
    /// At most one waiting player per wager.
    mapping(uint256 => address) public waitingPlayer;

    /// @notice Optional on-chain registration of player metadata (e.g. Moltbook agent name).
    mapping(address => string) public agentNames;

    /// @notice Simple reentrancy guard
    uint256 private _locked = 1;

    // ------------------------------------------------------------------------
    // Constants
    // ------------------------------------------------------------------------

    uint256 public constant MAX_ROUNDS = 5;
    uint256 public constant WINS_TO_FINISH = 3;
    uint256 public constant PHASE_TIMEOUT = 60; // seconds for commit or reveal phase

    // ------------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------------

    error InvalidWager();
    error InvalidMatch();
    error InvalidRound();
    error NotPlayer();
    error AlreadyInQueue();
    error NotInQueue();
    error MatchAlreadyFinished();
    error InvalidCommit();
    error CommitAlreadySubmitted();
    error RevealAlreadySubmitted();
    error CommitMissing();
    error RevealTooEarly();
    error DeadlineNotPassed();
    error NoTimeoutToClaim();
    error TransferFailed();

    // ------------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------------

    event WaitingInQueue(address indexed player, uint256 indexed wager);
    event QueueCancelled(address indexed player, uint256 indexed wager);

    event MatchCreated(
        uint256 indexed matchId,
        address indexed player1,
        address indexed player2,
        uint256 wager
    );

    event RoundCommitted(
        uint256 indexed matchId,
        uint8 indexed round,
        address indexed player
    );

    event RoundRevealed(
        uint256 indexed matchId,
        uint8 indexed round,
        address indexed player,
        Move move
    );

    event RoundResult(
        uint256 indexed matchId,
        uint8 indexed round,
        int8 result // 1 = player1 win, -1 = player2 win, 0 = draw
    );

    event RoundTimeout(
        uint256 indexed matchId,
        uint8 indexed round,
        address indexed winner,
        string phase // "commit" or "reveal" or "both-missing"
    );

    event MatchFinished(
        uint256 indexed matchId,
        address indexed winner,
        uint256 payoutPlayer1,
        uint256 payoutPlayer2
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
    // Matchmaking
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


    /// @notice Join the matchmaking queue for a given wager.
    /// @dev If another player is already waiting with the same wager,
    ///      a new match is created and both wagers are escrowed.
    /// @param wager The amount of native token each player wagers.
    /// @return matchId The created match id, or 0 if you are now waiting in queue.
    function enqueue(uint256 wager) external payable nonReentrant returns (uint256 matchId) {
        if (wager == 0 || msg.value != wager) {
            revert InvalidWager();
        }

        address waiting = waitingPlayer[wager];

        if (waiting == address(0)) {
            // No one waiting yet, this player becomes the queued player.
            waitingPlayer[wager] = msg.sender;
            emit WaitingInQueue(msg.sender, wager);
            return 0;
        }

        if (waiting == msg.sender) {
            // Same player cannot match against themselves.
            revert AlreadyInQueue();
        }

        // Match found: previous waiting player + current caller.
        waitingPlayer[wager] = address(0);

        matchId = nextMatchId++;

        Match storage m = matches[matchId];
        m.player1 = waiting;
        m.player2 = msg.sender;
        m.wager = uint96(wager);
        m.status = MatchStatus.WaitingCommits;

        emit MatchCreated(matchId, waiting, msg.sender, wager);
    }

    /// @notice Cancel your position in the queue for a specific wager and refund your stake.
    /// @param wager The wager you previously enqueued with.
    function cancelEnqueue(uint256 wager) external nonReentrant {
        if (waitingPlayer[wager] != msg.sender) {
            revert NotInQueue();
        }
        waitingPlayer[wager] = address(0);

        (bool ok, ) = msg.sender.call{value: wager}("");
        if (!ok) revert TransferFailed();

        emit QueueCancelled(msg.sender, wager);
    }

    // ------------------------------------------------------------------------
    // Commit-reveal gameplay
    // ------------------------------------------------------------------------

    /// @notice Commit your move hash for a given round in a match.
    /// @dev commitHash should be keccak256(abi.encodePacked(matchId, round, player, move, salt)).
    /// @param matchId The match identifier.
    /// @param round The round number (1–5).
    /// @param commitHash The commitment hash.
    function commitMove(
        uint256 matchId,
        uint8 round,
        bytes32 commitHash
    ) external {
        if (round == 0 || round > MAX_ROUNDS) revert InvalidRound();

        Match storage m = matches[matchId];
        if (m.player1 == address(0)) revert InvalidMatch();
        if (m.status == MatchStatus.Finished) revert MatchAlreadyFinished();

        bool isP1 = msg.sender == m.player1;
        bool isP2 = msg.sender == m.player2;
        if (!isP1 && !isP2) revert NotPlayer();

        Round storage r = rounds[matchId][round];

        // Cannot commit after commit deadline (if already set)
        if (r.commitDeadline != 0 && block.timestamp > r.commitDeadline) {
            revert InvalidCommit();
        }

        if (isP1) {
            if (r.commit1 != bytes32(0)) revert CommitAlreadySubmitted();
            r.commit1 = commitHash;
        } else {
            if (r.commit2 != bytes32(0)) revert CommitAlreadySubmitted();
            r.commit2 = commitHash;
        }

        // Start commit phase timer on first commit
        if (r.commitDeadline == 0) {
            r.commitDeadline = uint64(block.timestamp + PHASE_TIMEOUT);
        }

        // Ensure match status is at least WaitingCommits
        if (m.status == MatchStatus.Finished) revert MatchAlreadyFinished();
        m.status = MatchStatus.WaitingCommits;

        emit RoundCommitted(matchId, round, msg.sender);
    }

    /// @notice Reveal your move for a given round.
    /// @param matchId The match identifier.
    /// @param round The round number (1–5).
    /// @param move The move (Rock, Paper, or Scissors).
    /// @param salt The secret salt used in the commit hash.
    function revealMove(
        uint256 matchId,
        uint8 round,
        Move move,
        bytes32 salt
    ) external {
        if (round == 0 || round > MAX_ROUNDS) revert InvalidRound();
        if (move == Move.None) revert InvalidCommit();

        Match storage m = matches[matchId];
        if (m.player1 == address(0)) revert InvalidMatch();
        if (m.status == MatchStatus.Finished) revert MatchAlreadyFinished();

        bool isP1 = msg.sender == m.player1;
        bool isP2 = msg.sender == m.player2;
        if (!isP1 && !isP2) revert NotPlayer();

        Round storage r = rounds[matchId][round];

        // Must have commits from both players before reveal phase
        if (r.commit1 == bytes32(0) || r.commit2 == bytes32(0)) revert CommitMissing();

        // Start reveal timer on first reveal
        if (r.revealDeadline == 0) {
            r.revealDeadline = uint64(block.timestamp + PHASE_TIMEOUT);
        } else {
            // Cannot reveal after deadline
            if (block.timestamp > r.revealDeadline) revert RevealTooEarly();
        }

        if (isP1) {
            if (r.revealed1) revert RevealAlreadySubmitted();
            // Verify commitment
            if (_computeCommit(matchId, round, m.player1, move, salt) != r.commit1) {
                revert InvalidCommit();
            }
            r.move1 = move;
            r.revealed1 = true;
        } else {
            if (r.revealed2) revert RevealAlreadySubmitted();
            if (_computeCommit(matchId, round, m.player2, move, salt) != r.commit2) {
                revert InvalidCommit();
            }
            r.move2 = move;
            r.revealed2 = true;
        }

        m.status = MatchStatus.WaitingReveals;

        emit RoundRevealed(matchId, round, msg.sender, move);

        // If both revealed, resolve the round immediately.
        if (r.revealed1 && r.revealed2 && !r.decided) {
            _resolveRound(matchId, round, m, r);
        }
    }

    // ------------------------------------------------------------------------
    // Timeout handlers
    // ------------------------------------------------------------------------

    /// @notice Claim a round win if the opponent failed to commit before the commit deadline.
    /// @param matchId The match identifier.
    /// @param round The round number.
    function claimCommitTimeout(uint256 matchId, uint8 round) external {
        if (round == 0 || round > MAX_ROUNDS) revert InvalidRound();

        Match storage m = matches[matchId];
        if (m.player1 == address(0)) revert InvalidMatch();
        if (m.status == MatchStatus.Finished) revert MatchAlreadyFinished();

        Round storage r = rounds[matchId][round];
        if (r.commitDeadline == 0 || block.timestamp <= r.commitDeadline) {
            revert DeadlineNotPassed();
        }
        if (r.decided) revert NoTimeoutToClaim();

        bool p1Committed = r.commit1 != bytes32(0);
        bool p2Committed = r.commit2 != bytes32(0);

        address winner;
        int8 result;

        if (p1Committed && !p2Committed) {
            m.wins1 += 1;
            winner = m.player1;
            result = 1;
        } else if (!p1Committed && p2Committed) {
            m.wins2 += 1;
            winner = m.player2;
            result = -1;
        } else {
            // Both failed to commit: treat as draw round.
            result = 0;
        }

        r.decided = true;
        m.roundsPlayed += 1;

        emit RoundTimeout(matchId, round, winner, "commit");
        emit RoundResult(matchId, round, result);

        _maybeFinishMatch(matchId, m);
    }

    /// @notice Claim a round win if the opponent failed to reveal before the reveal deadline.
    /// @param matchId The match identifier.
    /// @param round The round number.
    function claimRevealTimeout(uint256 matchId, uint8 round) external {
        if (round == 0 || round > MAX_ROUNDS) revert InvalidRound();

        Match storage m = matches[matchId];
        if (m.player1 == address(0)) revert InvalidMatch();
        if (m.status == MatchStatus.Finished) revert MatchAlreadyFinished();

        Round storage r = rounds[matchId][round];
        if (r.revealDeadline == 0 || block.timestamp <= r.revealDeadline) {
            revert DeadlineNotPassed();
        }
        if (r.decided) revert NoTimeoutToClaim();

        bool p1Revealed = r.revealed1;
        bool p2Revealed = r.revealed2;

        address winner;
        int8 result;

        if (p1Revealed && !p2Revealed) {
            m.wins1 += 1;
            winner = m.player1;
            result = 1;
        } else if (!p1Revealed && p2Revealed) {
            m.wins2 += 1;
            winner = m.player2;
            result = -1;
        } else {
            // Both failed to reveal: draw.
            result = 0;
        }

        r.decided = true;
        m.roundsPlayed += 1;

        emit RoundTimeout(matchId, round, winner, "reveal");
        emit RoundResult(matchId, round, result);

        _maybeFinishMatch(matchId, m);
    }

    // ------------------------------------------------------------------------
    // View helpers
    // ------------------------------------------------------------------------

    /// @notice Get the basic info of a match.
    function getMatch(uint256 matchId)
        external
        view
        returns (
            address player1,
            address player2,
            uint256 wager,
            uint8 roundsPlayed,
            uint8 wins1,
            uint8 wins2,
            MatchStatus status,
            bool settled
        )
    {
        Match storage m = matches[matchId];
        return (m.player1, m.player2, m.wager, m.roundsPlayed, m.wins1, m.wins2, m.status, m.settled);
    }

    // ------------------------------------------------------------------------
    // Internal logic
    // ------------------------------------------------------------------------

    function _computeCommit(
        uint256 matchId,
        uint8 round,
        address player,
        Move move,
        bytes32 salt
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(matchId, round, player, move, salt));
    }

    function _resolveRound(
        uint256 matchId,
        uint8 round,
        Match storage m,
        Round storage r
    ) internal {
        if (r.decided) return;

        int8 result = _compareMoves(r.move1, r.move2);

        if (result == 1) {
            m.wins1 += 1;
        } else if (result == -1) {
            m.wins2 += 1;
        }

        r.decided = true;
        m.roundsPlayed += 1;

        emit RoundResult(matchId, round, result);

        _maybeFinishMatch(matchId, m);
    }

    function _compareMoves(Move m1, Move m2) internal pure returns (int8) {
        if (m1 == m2) {
            return 0; // draw
        }
        if (m1 == Move.Rock && m2 == Move.Scissors) return 1;
        if (m1 == Move.Paper && m2 == Move.Rock) return 1;
        if (m1 == Move.Scissors && m2 == Move.Paper) return 1;
        return -1;
    }

    function _maybeFinishMatch(uint256 matchId, Match storage m) internal nonReentrant {
        if (m.status == MatchStatus.Finished || m.settled) {
            return;
        }

        if (m.wins1 >= WINS_TO_FINISH || m.wins2 >= WINS_TO_FINISH || m.roundsPlayed >= MAX_ROUNDS) {
            m.status = MatchStatus.Finished;
            _settle(matchId, m);
        }
    }

    function _settle(uint256 matchId, Match storage m) internal {
        if (m.settled) return;
        m.settled = true;

        uint256 pot = uint256(m.wager) * 2;
        uint256 payout1;
        uint256 payout2;
        address winner;

        if (m.wins1 > m.wins2) {
            payout1 = pot;
            winner = m.player1;
        } else if (m.wins2 > m.wins1) {
            payout2 = pot;
            winner = m.player2;
        } else {
            // Draw: refund both
            payout1 = m.wager;
            payout2 = m.wager;
        }

        if (payout1 > 0) {
            (bool ok1, ) = m.player1.call{value: payout1}("");
            if (!ok1) revert TransferFailed();
        }
        if (payout2 > 0) {
            (bool ok2, ) = m.player2.call{value: payout2}("");
            if (!ok2) revert TransferFailed();
        }

        emit MatchFinished(matchId, winner, payout1, payout2);
    }

    // Disallow accidental direct transfers
    receive() external payable {
        revert();
    }

    fallback() external payable {
        revert();
    }
}

