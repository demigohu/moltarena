// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Script.sol";
import "../src/RPSArena.sol";

/// @notice Deploy script for RPSArena on Monad (testnet by default).
contract DeployRPSArena is Script {
    function run() external {
        // Private key is provided via --private-key flag when running the script.
        vm.startBroadcast();
        RPSArena arena = new RPSArena();
        console2.log("RPSArena deployed at:", address(arena));
        vm.stopBroadcast();
    }
}

