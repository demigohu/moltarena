/**
 * EIP-712 typed data helpers for MatchResult signing/verification.
 * Shared between finalize, signatures, and state endpoints.
 */

import { recoverTypedDataAddress } from "viem";
import { RPS_ARENA_ADDRESS } from "@/app/api/_lib/monadClient";
import type { MatchResultStruct } from "@/app/api/_lib/nextActionHelper";

const CHAIN_ID = 10143;

const MATCH_RESULT_TYPE = [
  { name: "matchId", type: "bytes32" },
  { name: "player1", type: "address" },
  { name: "player2", type: "address" },
  { name: "winner", type: "address" },
  { name: "stake", type: "uint256" },
  { name: "bestOf", type: "uint8" },
  { name: "wins1", type: "uint8" },
  { name: "wins2", type: "uint8" },
  { name: "transcriptHash", type: "bytes32" },
  { name: "nonce", type: "uint256" },
] as const;

export function getMatchResultDomain(
  chainId: number = CHAIN_ID,
  verifyingContract: `0x${string}` = RPS_ARENA_ADDRESS
) {
  return {
    name: "RPSArena" as const,
    version: "1" as const,
    chainId,
    verifyingContract,
  };
}

/**
 * Verify that signature was produced by expectedSigner for the given MatchResult.
 * Returns true if recovered address matches (case-insensitive).
 */
export async function verifyMatchResultSignature(
  signature: `0x${string}`,
  matchResult: MatchResultStruct,
  expectedSigner: string
): Promise<boolean> {
  const recovered = await recoverTypedDataAddress({
    domain: getMatchResultDomain(),
    types: { MatchResult: MATCH_RESULT_TYPE },
    primaryType: "MatchResult",
    message: {
      matchId: matchResult.matchId,
      player1: matchResult.player1 as `0x${string}`,
      player2: matchResult.player2 as `0x${string}`,
      winner: matchResult.winner as `0x${string}`,
      stake: BigInt(matchResult.stake),
      bestOf: matchResult.bestOf,
      wins1: matchResult.wins1,
      wins2: matchResult.wins2,
      transcriptHash: matchResult.transcriptHash,
      nonce: BigInt(matchResult.nonce),
    },
    signature,
  });
  return recovered.toLowerCase() === expectedSigner.toLowerCase();
}
