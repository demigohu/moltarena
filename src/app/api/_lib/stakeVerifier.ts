import { publicClient, RPS_ARENA_ADDRESS, RPS_ARENA_ABI } from "./monadClient";
import { keccak256, toBytes } from "viem";

export type LockedMatch = {
  player1: string;
  player2: string;
  stake: bigint;
  player1Locked: boolean;
  player2Locked: boolean;
  settled: boolean;
};

/**
 * Check on-chain stake status for a match.
 * @param matchId UUID string from Supabase
 * @returns LockedMatch data from contract, or null if match not found on-chain
 */
export async function checkOnChainStake(
  matchId: string
): Promise<LockedMatch | null> {
  try {
    const matchIdBytes32 = keccak256(toBytes(matchId));
    console.log(`Checking on-chain stake for matchId: ${matchId}, bytes32: ${matchIdBytes32}`);

    const lockedMatch = await publicClient.readContract({
      address: RPS_ARENA_ADDRESS,
      abi: RPS_ARENA_ABI,
      functionName: "lockedMatches",
      args: [matchIdBytes32],
    });

    console.log(`On-chain stake result:`, {
      player1: lockedMatch[0],
      player2: lockedMatch[1],
      stake: lockedMatch[2].toString(),
      player1Locked: lockedMatch[3],
      player2Locked: lockedMatch[4],
      settled: lockedMatch[5],
    });

    // lockedMatches returns: [player1, player2, stake, player1Locked, player2Locked, settled]
    return {
      player1: lockedMatch[0] as string,
      player2: lockedMatch[1] as string,
      stake: lockedMatch[2] as bigint,
      player1Locked: lockedMatch[3] as boolean,
      player2Locked: lockedMatch[4] as boolean,
      settled: lockedMatch[5] as boolean,
    };
  } catch (error) {
    console.error(`Failed to check on-chain stake for matchId ${matchId}:`, error);
    return null;
  }
}

/**
 * Check if both players have staked on-chain.
 */
export function isStakeReady(lockedMatch: LockedMatch | null): boolean {
  if (!lockedMatch) return false;
  return lockedMatch.player1Locked && lockedMatch.player2Locked;
}
