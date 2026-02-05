// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/RPSArena.sol";

contract RPSArenaTest is Test {
    RPSArena arena;

    uint256 private pk1 = 0xA11CE;
    uint256 private pk2 = 0xB0B;
    address private player1;
    address private player2;

    bytes32 private constant MATCH_RESULT_TYPEHASH = keccak256(
        "MatchResult(bytes32 matchId,address player1,address player2,address winner,uint256 stake,uint8 bestOf,uint8 wins1,uint8 wins2,bytes32 transcriptHash,uint256 nonce)"
    );

    function setUp() public {
        arena = new RPSArena();

        // Ignore gas cost in balance assertions.
        vm.txGasPrice(0);

        player1 = vm.addr(pk1);
        player2 = vm.addr(pk2);

        vm.deal(player1, 10 ether);
        vm.deal(player2, 10 ether);
    }

    // ------------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------------

    function _domainSeparator() internal view returns (bytes32) {
        // Must mirror EIP712("RPSArena", "2") in the contract
        bytes32 typeHash = keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
        return keccak256(
            abi.encode(
                typeHash,
                keccak256(bytes("RPSArena")),
                keccak256(bytes("2")),
                block.chainid,
                address(arena)
            )
        );
    }

    function _signMatchResult(
        uint256 pk,
        RPSArena.MatchResult memory result
    ) internal view returns (bytes memory) {
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

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", _domainSeparator(), structHash)
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    // ------------------------------------------------------------------------
    // Tests
    // ------------------------------------------------------------------------

    function testStakeForMatch_FirstAndSecondPlayer() public {
        bytes32 matchId = keccak256("match-1");

        // First player stakes exactly MIN_STAKE
        uint256 stake = arena.MIN_STAKE();
        vm.prank(player1);
        arena.stakeForMatch{value: stake}(matchId);

        // Second player must stake the same amount
        vm.prank(player2);
        arena.stakeForMatch{value: stake}(matchId);

        (address p1, address p2, uint256 lockedStake, bool p1Locked, bool p2Locked, ) = arena.lockedMatches(matchId);

        assertEq(p1, player1);
        assertEq(p2, player2);
        assertEq(lockedStake, arena.MIN_STAKE());
    }

    function testSettleMatch_Player1Wins() public {
        bytes32 matchId = keccak256("match-2");
        uint256 stake = arena.MIN_STAKE();

        uint256 startBal1 = player1.balance;
        uint256 startBal2 = player2.balance;

        // Both players stake
        vm.prank(player1);
        arena.stakeForMatch{value: stake}(matchId);

        vm.prank(player2);
        arena.stakeForMatch{value: stake}(matchId);

        // Off-chain decided result: best-of-5, player1 wins 3-1
        RPSArena.MatchResult memory result = RPSArena.MatchResult({
            matchId: matchId,
            player1: player1,
            player2: player2,
            winner: player1,
            stake: stake,
            bestOf: arena.DEFAULT_BEST_OF(),
            wins1: 3,
            wins2: 1,
            transcriptHash: keccak256("transcript-2"),
            nonce: 1
        });

        bytes memory sig1 = _signMatchResult(pk1, result);
        bytes memory sig2 = _signMatchResult(pk2, result);

        arena.settleMatch(result, sig1, sig2);

        // Player1 should end up +stake net; player2 ends up -stake.
        assertEq(player1.balance, startBal1 + stake);
        assertEq(player2.balance, startBal2 - stake);
        assertEq(address(arena).balance, 0);

        // Match cannot be settled twice
        vm.expectRevert(RPSArena.MatchAlreadySettled.selector);
        arena.settleMatch(result, sig1, sig2);
    }

    function testSettleMatch_DrawRefundsBoth() public {
        bytes32 matchId = keccak256("match-3");
        uint256 stake = arena.MIN_STAKE();

        uint256 startBal1 = player1.balance;
        uint256 startBal2 = player2.balance;

        vm.prank(player1);
        arena.stakeForMatch{value: stake}(matchId);

        vm.prank(player2);
        arena.stakeForMatch{value: stake}(matchId);

        // Draw: wins equal, winner = address(0)
        RPSArena.MatchResult memory result = RPSArena.MatchResult({
            matchId: matchId,
            player1: player1,
            player2: player2,
            winner: address(0),
            stake: stake,
            bestOf: arena.DEFAULT_BEST_OF(),
            wins1: 2,
            wins2: 2,
            transcriptHash: keccak256("transcript-3"),
            nonce: 7
        });

        bytes memory sig1 = _signMatchResult(pk1, result);
        bytes memory sig2 = _signMatchResult(pk2, result);

        arena.settleMatch(result, sig1, sig2);

        // Both get their stake back
        assertEq(player1.balance, startBal1);
        assertEq(player2.balance, startBal2);
        assertEq(address(arena).balance, 0);
    }
}