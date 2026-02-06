/**
 * On-chain RPS Arena service (viem/wagmi).
 * Uses RPS_ARENA_ADDRESS and ABI from src/lib/rpsArena.ts
 */

import {
  type WalletClient,
  type PublicClient,
  type Hash,
  type Hex,
} from "viem";
import { monadTestnet } from "viem/chains";
import { RPS_ARENA_ADDRESS, RPS_ARENA_ABI } from "@/lib/rpsArena";

// MatchResult struct for EIP-712
export type MatchResultStruct = {
  matchId: Hex;
  player1: Hex;
  player2: Hex;
  winner: Hex;
  stake: bigint;
  bestOf: number;
  wins1: number;
  wins2: number;
  transcriptHash: Hex;
  nonce: bigint;
};

export type EIP712Domain = {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Hex;
  salt?: Hex;
};

/**
 * Get EIP-712 domain from contract.
 */
export async function getDomain(
  publicClient: PublicClient
): Promise<EIP712Domain> {
  const result = await publicClient.readContract({
    address: RPS_ARENA_ADDRESS,
    abi: RPS_ARENA_ABI,
    functionName: "eip712Domain",
    args: [],
  });

  const [fields, name, version, chainId, verifyingContract, salt] = result;
  return {
    name: name as string,
    version: version as string,
    chainId: Number(chainId),
    verifyingContract: verifyingContract as Hex,
    ...(salt && (salt as Hex) !== "0x" ? { salt: salt as Hex } : {}),
  };
}

/**
 * Stake for a match on-chain.
 * @returns tx hash
 */
export async function stakeForMatch(
  walletClient: WalletClient,
  matchIdBytes32: Hex,
  valueWei: bigint
): Promise<Hash> {
  const [account] = walletClient.account ? [walletClient.account] : await walletClient.getAddresses();
  if (!account) throw new Error("No wallet connected");

  const hash = await walletClient.writeContract({
    address: RPS_ARENA_ADDRESS,
    abi: RPS_ARENA_ABI,
    functionName: "stakeForMatch",
    args: [matchIdBytes32],
    value: valueWei,
    account,
    chain: monadTestnet,
  });
  console.log("[rpsArenaService] stakeForMatch tx:", hash);
  return hash;
}

/**
 * Watch for StakeLocked events for a match.
 */
export function watchStakeLocked(
  publicClient: PublicClient,
  matchIdBytes32: Hex,
  onStakeLocked: (args: { player: Hex; stake: bigint }) => void
): () => void {
  const unwatch = publicClient.watchContractEvent({
    address: RPS_ARENA_ADDRESS,
    abi: RPS_ARENA_ABI,
    eventName: "StakeLocked",
    args: { matchId: matchIdBytes32 },
    onLogs: (logs) => {
      for (const log of logs) {
        onStakeLocked({
          player: (log.args as { player: Hex }).player,
          stake: (log.args as { stake: bigint }).stake,
        });
      }
    },
  });
  return unwatch;
}

// EIP-712 type hash for MatchResult (from contract)
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

/**
 * Sign MatchResult with EIP-712.
 */
export async function signResult(
  walletClient: WalletClient,
  domain: EIP712Domain,
  result: MatchResultStruct
): Promise<Hex> {
  const [account] = walletClient.account ? [walletClient.account] : await walletClient.getAddresses();
  if (!account) throw new Error("No wallet connected");

  const signature = await walletClient.signTypedData({
    account,
    domain: {
      name: domain.name,
      version: domain.version,
      chainId: domain.chainId,
      verifyingContract: domain.verifyingContract,
      ...(domain.salt ? { salt: domain.salt } : {}),
    },
    types: {
      MatchResult: MATCH_RESULT_TYPE,
    },
    primaryType: "MatchResult",
    message: {
      matchId: result.matchId,
      player1: result.player1,
      player2: result.player2,
      winner: result.winner,
      stake: result.stake,
      bestOf: result.bestOf,
      wins1: result.wins1,
      wins2: result.wins2,
      transcriptHash: result.transcriptHash,
      nonce: result.nonce,
    },
  });
  console.log("[rpsArenaService] signResult sig:", signature);
  return signature as Hex;
}

/**
 * Settle match on-chain. Requires both sig1 and sig2.
 * Errors: StakeMismatch, MatchNotReady, ECDSAInvalidSignature, etc.
 */
export async function settleMatch(
  walletClient: WalletClient,
  result: MatchResultStruct,
  sig1: Hex,
  sig2: Hex
): Promise<Hash> {
  const [account] = walletClient.account ? [walletClient.account] : await walletClient.getAddresses();
  if (!account) throw new Error("No wallet connected");

  const resultStruct = {
    matchId: result.matchId,
    player1: result.player1,
    player2: result.player2,
    winner: result.winner,
    stake: result.stake,
    bestOf: result.bestOf,
    wins1: result.wins1,
    wins2: result.wins2,
    transcriptHash: result.transcriptHash,
    nonce: result.nonce,
  };

  const hash = await walletClient.writeContract({
    address: RPS_ARENA_ADDRESS,
    abi: RPS_ARENA_ABI,
    functionName: "settleMatch",
    args: [resultStruct, sig1 as `0x${string}`, sig2 as `0x${string}`],
    account,
    chain: monadTestnet,
  });
  console.log("[rpsArenaService] settleMatch tx:", hash);
  return hash;
}

/**
 * Convert API matchResult (string stake) to service MatchResultStruct.
 */
export function toMatchResultStruct(api: {
  matchId: string;
  player1: string;
  player2: string;
  winner: string;
  stake: string;
  bestOf: number;
  wins1: number;
  wins2: number;
  transcriptHash: string;
  nonce: number;
}): MatchResultStruct {
  return {
    matchId: api.matchId as Hex,
    player1: api.player1 as Hex,
    player2: api.player2 as Hex,
    winner: api.winner as Hex,
    stake: BigInt(api.stake),
    bestOf: api.bestOf,
    wins1: api.wins1,
    wins2: api.wins2,
    transcriptHash: api.transcriptHash as Hex,
    nonce: BigInt(api.nonce),
  };
}
