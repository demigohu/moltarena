// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/RPSArena.sol";

contract RPSArenaTest is Test {
    RPSArena arena;

    address player1 = address(0xA1);
    address player2 = address(0xB2);

    uint256 constant WAGER = 1 ether;

    function setUp() public {
        arena = new RPSArena();

        vm.deal(player1, 10 ether);
        vm.deal(player2, 10 ether);
    }

    function _computeCommit(
        uint256 matchId,
        uint8 round,
        address player,
        RPSArena.Move move,
        bytes32 salt
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(matchId, round, player, move, salt));
    }

    function test_EnqueueAndCreateMatch() public {
        vm.prank(player1);
        uint256 matchId1 = arena.enqueue{value: WAGER}(WAGER);
        assertEq(matchId1, 0, "first enqueue should not create match");

        vm.prank(player2);
        uint256 matchId2 = arena.enqueue{value: WAGER}(WAGER);
        assertEq(matchId2, 1, "second enqueue should create match 1");

        (
            address p1,
            address p2,
            uint256 wager,
            uint8 roundsPlayed,
            uint8 wins1,
            uint8 wins2,
            RPSArena.MatchStatus status,
            bool settled
        ) = arena.getMatch(matchId2);

        assertEq(p1, player1);
        assertEq(p2, player2);
        assertEq(wager, WAGER);
        assertEq(roundsPlayed, 0);
        assertEq(wins1, 0);
        assertEq(wins2, 0);
        assertEq(uint8(status), uint8(RPSArena.MatchStatus.WaitingCommits));
        assertFalse(settled);
    }

    function test_FullMatch_Player1Wins3to0() public {
        // Enqueue and create match
        vm.prank(player1);
        arena.enqueue{value: WAGER}(WAGER);

        vm.prank(player2);
        uint256 matchId = arena.enqueue{value: WAGER}(WAGER);

        // Round 1: player1 Rock, player2 Scissors (p1 win)
        _playRound(matchId, 1, RPSArena.Move.Rock, RPSArena.Move.Scissors);

        // Round 2: player1 Paper, player2 Rock (p1 win)
        _playRound(matchId, 2, RPSArena.Move.Paper, RPSArena.Move.Rock);

        // Round 3: player1 Scissors, player2 Paper (p1 win, match finishes)
        _playRound(matchId, 3, RPSArena.Move.Scissors, RPSArena.Move.Paper);

        (
            ,
            ,
            ,
            uint8 roundsPlayed,
            uint8 wins1,
            uint8 wins2,
            RPSArena.MatchStatus status,
            bool settled
        ) = arena.getMatch(matchId);

        assertEq(wins1, 3);
        assertEq(wins2, 0);
        assertEq(roundsPlayed, 3);
        assertEq(uint8(status), uint8(RPSArena.MatchStatus.Finished));
        assertTrue(settled);

        // Contract should have no leftover funds and player1 should receive pot
        assertEq(address(arena).balance, 0);
        assertEq(player1.balance, 10 ether - WAGER + 2 * WAGER);
        assertEq(player2.balance, 10 ether - WAGER);
    }

    function test_DrawMatch_RefundsBoth() public {
        vm.prank(player1);
        arena.enqueue{value: WAGER}(WAGER);

        vm.prank(player2);
        uint256 matchId = arena.enqueue{value: WAGER}(WAGER);

        // Play 5 draw rounds (both choose Rock)
        for (uint8 r = 1; r <= 5; r++) {
            _playRound(matchId, r, RPSArena.Move.Rock, RPSArena.Move.Rock);
        }

        (
            ,
            ,
            ,
            uint8 roundsPlayed,
            uint8 wins1,
            uint8 wins2,
            RPSArena.MatchStatus status,
            bool settled
        ) = arena.getMatch(matchId);

        assertEq(roundsPlayed, 5);
        assertEq(wins1, 0);
        assertEq(wins2, 0);
        assertEq(uint8(status), uint8(RPSArena.MatchStatus.Finished));
        assertTrue(settled);

        // Both should have their wager refunded
        assertEq(player1.balance, 10 ether);
        assertEq(player2.balance, 10 ether);
        assertEq(address(arena).balance, 0);
    }

    function test_CommitTimeout_GivesRoundWinOnly() public {
        vm.prank(player1);
        arena.enqueue{value: WAGER}(WAGER);

        vm.prank(player2);
        uint256 matchId = arena.enqueue{value: WAGER}(WAGER);

        // Only player1 commits for round 1
        bytes32 salt1 = keccak256("salt1");
        bytes32 commit1 = _computeCommit(
            matchId,
            1,
            player1,
            RPSArena.Move.Rock,
            salt1
        );

        vm.prank(player1);
        arena.commitMove(matchId, 1, commit1);

        // Fast forward past commit deadline
        vm.warp(block.timestamp + 61);

        // Anyone can claim timeout; use player1
        vm.prank(player1);
        arena.claimCommitTimeout(matchId, 1);

        (
            ,
            ,
            ,
            uint8 roundsPlayed,
            uint8 wins1,
            uint8 wins2,
            RPSArena.MatchStatus status,
            bool settled
        ) = arena.getMatch(matchId);

        assertEq(roundsPlayed, 1);
        assertEq(wins1, 1);
        assertEq(wins2, 0);
        assertEq(uint8(status), uint8(RPSArena.MatchStatus.WaitingCommits));
        assertFalse(settled);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _playRound(
        uint256 matchId,
        uint8 round,
        RPSArena.Move move1,
        RPSArena.Move move2
    ) internal {
        bytes32 salt1 = keccak256(abi.encodePacked("salt", matchId, round, "p1"));
        bytes32 salt2 = keccak256(abi.encodePacked("salt", matchId, round, "p2"));

        bytes32 commit1 = _computeCommit(matchId, round, player1, move1, salt1);
        bytes32 commit2 = _computeCommit(matchId, round, player2, move2, salt2);

        vm.prank(player1);
        arena.commitMove(matchId, round, commit1);

        vm.prank(player2);
        arena.commitMove(matchId, round, commit2);

        // Immediately reveal both (within timeout)
        vm.prank(player1);
        arena.revealMove(matchId, round, move1, salt1);

        vm.prank(player2);
        arena.revealMove(matchId, round, move2, salt2);
    }
}

