// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {MoltArenaEscrow} from "../src/MoltArenaEscrow.sol";

contract MoltArenaEscrowScript is Script {
    function run() public {
        address resolver = vm.envAddress("ESCROW_RESOLVER");
        address treasury = vm.envAddress("ESCROW_TREASURY");
        uint256 feeBps = vm.envOr("ESCROW_FEE_BPS", uint256(30)); // default 0.3%

        vm.startBroadcast();
        MoltArenaEscrow escrow = new MoltArenaEscrow(resolver, treasury, feeBps);
        vm.stopBroadcast();
    }
}
