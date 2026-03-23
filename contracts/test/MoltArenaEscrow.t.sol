// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MoltArenaEscrow} from "../src/MoltArenaEscrow.sol";

contract MoltArenaEscrowTest is Test {
    MoltArenaEscrow public escrow;

    address resolver;
    address treasury;
    address agent1;
    address agent2;
    uint256 constant FEE_BPS = 100; // 1%
    uint256 constant WAGER = 1 ether;
    bytes32 matchId;

    function setUp() public {
        resolver = makeAddr("resolver");
        treasury = makeAddr("treasury");
        agent1 = makeAddr("agent1");
        agent2 = makeAddr("agent2");
        matchId = keccak256(abi.encodePacked("match-uuid-1"));

        vm.deal(agent1, 10 ether);
        vm.deal(agent2, 10 ether);

        vm.prank(resolver);
        escrow = new MoltArenaEscrow(resolver, treasury, FEE_BPS);
    }

    function test_CreateMatch() public {
        vm.prank(resolver);
        escrow.createMatch(matchId, agent1, agent2, WAGER);

        (address a1, address a2, uint256 wager,,, bool resolved, bool cancelled) = escrow.matches(matchId);
        assertEq(a1, agent1);
        assertEq(a2, agent2);
        assertEq(wager, WAGER);
        assertFalse(resolved);
        assertFalse(cancelled);
    }

    function test_CreateMatch_RevertWhenNotResolver() public {
        vm.prank(agent1);
        vm.expectRevert(MoltArenaEscrow.OnlyResolver.selector);
        escrow.createMatch(matchId, agent1, agent2, WAGER);
    }

    function test_CreateMatch_RevertWhenInvalidAgents() public {
        vm.startPrank(resolver);
        vm.expectRevert(MoltArenaEscrow.InvalidAgents.selector);
        escrow.createMatch(matchId, address(0), agent2, WAGER);
        vm.expectRevert(MoltArenaEscrow.InvalidAgents.selector);
        escrow.createMatch(matchId, agent1, agent1, WAGER);
        vm.stopPrank();
    }

    function test_CreateMatch_RevertWhenInvalidWager() public {
        vm.prank(resolver);
        vm.expectRevert(MoltArenaEscrow.InvalidWager.selector);
        escrow.createMatch(matchId, agent1, agent2, 0);
    }

    function test_Deposit_Both_Then_Resolve() public {
        vm.prank(resolver);
        escrow.createMatch(matchId, agent1, agent2, WAGER);

        vm.prank(agent1);
        escrow.deposit{value: WAGER}(matchId);
        vm.prank(agent2);
        escrow.deposit{value: WAGER}(matchId);

        assertEq(escrow.matchBalance(matchId), 2 * WAGER);

        uint256 winnerBalBefore = agent1.balance;
        vm.prank(resolver);
        escrow.resolve(matchId, agent1);

        uint256 fee = (2 * WAGER * FEE_BPS) / 10000;
        uint256 payout = 2 * WAGER - fee;
        assertEq(agent1.balance, winnerBalBefore + payout);
        assertEq(treasury.balance, fee);
    }

    function test_Deposit_RevertWhenWrongAmount() public {
        vm.prank(resolver);
        escrow.createMatch(matchId, agent1, agent2, WAGER);

        vm.prank(agent1);
        vm.expectRevert(MoltArenaEscrow.WrongAmount.selector);
        escrow.deposit{value: WAGER / 2}(matchId);
    }

    function test_Deposit_RevertWhenNotPlayer() public {
        vm.deal(treasury, 10 ether);
        vm.prank(resolver);
        escrow.createMatch(matchId, agent1, agent2, WAGER);

        vm.prank(treasury);
        vm.expectRevert(MoltArenaEscrow.NotAPlayer.selector);
        escrow.deposit{value: WAGER}(matchId);
    }

    function test_Resolve_RevertWhenNotBothDeposited() public {
        vm.prank(resolver);
        escrow.createMatch(matchId, agent1, agent2, WAGER);
        vm.prank(agent1);
        escrow.deposit{value: WAGER}(matchId);

        vm.prank(resolver);
        vm.expectRevert(MoltArenaEscrow.NotBothDeposited.selector);
        escrow.resolve(matchId, agent1);
    }

    function test_Resolve_RevertWhenInvalidWinner() public {
        vm.prank(resolver);
        escrow.createMatch(matchId, agent1, agent2, WAGER);
        vm.prank(agent1);
        escrow.deposit{value: WAGER}(matchId);
        vm.prank(agent2);
        escrow.deposit{value: WAGER}(matchId);

        vm.prank(resolver);
        vm.expectRevert(MoltArenaEscrow.InvalidWinner.selector);
        escrow.resolve(matchId, treasury);
    }

    function test_CancelAndRefund() public {
        vm.prank(resolver);
        escrow.createMatch(matchId, agent1, agent2, WAGER);
        vm.prank(agent1);
        escrow.deposit{value: WAGER}(matchId);
        vm.prank(agent2);
        escrow.deposit{value: WAGER}(matchId);

        uint256 a1Before = agent1.balance;
        uint256 a2Before = agent2.balance;

        vm.prank(resolver);
        escrow.cancelAndRefund(matchId);

        assertEq(agent1.balance, a1Before + WAGER);
        assertEq(agent2.balance, a2Before + WAGER);
    }

    function test_CancelAndRefund_PartialDeposits() public {
        vm.prank(resolver);
        escrow.createMatch(matchId, agent1, agent2, WAGER);
        vm.prank(agent1);
        escrow.deposit{value: WAGER}(matchId);
        // agent2 did not deposit

        uint256 a1Before = agent1.balance;
        vm.prank(resolver);
        escrow.cancelAndRefund(matchId);
        assertEq(agent1.balance, a1Before + WAGER);
    }
}
