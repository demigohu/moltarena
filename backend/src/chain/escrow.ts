/**
 * Molt Arena Escrow — backend (resolver) calls via viem.
 * createMatch after game_matched; resolve on game_ended; cancelAndRefund on deposit timeout.
 */
import {
  createPublicClient,
  createWalletClient,
  encodePacked,
  http,
  keccak256,
  type Address,
  type Chain,
  type Hash,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hederaTestnet } from "viem/chains";
import { config } from "../config";

/** Hedera Testnet (chain id 296); RPC URL from env. */
function getChain(): Chain | null {
  const rpc = config.escrow.rpcUrl;
  if (!rpc) return null;
  return {
    ...hederaTestnet,
    rpcUrls: { default: { http: [rpc] } },
  };
}

/** ABI escrow contract (MoltArenaEscrow.sol) — satu sumber kebenaran. */
const ESCROW_ABI = [
  { inputs: [], name: "AlreadyDeposited", type: "error" },
  { inputs: [], name: "InvalidAgents", type: "error" },
  { inputs: [], name: "InvalidWager", type: "error" },
  { inputs: [], name: "InvalidWinner", type: "error" },
  { inputs: [], name: "MatchEnded", type: "error" },
  { inputs: [], name: "MatchExists", type: "error" },
  { inputs: [], name: "MatchNotFound", type: "error" },
  { inputs: [], name: "NotAPlayer", type: "error" },
  { inputs: [], name: "NotBothDeposited", type: "error" },
  { inputs: [], name: "OnlyResolver", type: "error" },
  { inputs: [], name: "TransferFailed", type: "error" },
  { inputs: [], name: "WrongAmount", type: "error" },
  {
    inputs: [
      { internalType: "bytes32", name: "matchId", type: "bytes32" },
      { internalType: "address", name: "agent1", type: "address" },
      { internalType: "address", name: "agent2", type: "address" },
      { internalType: "uint256", name: "wagerAmount", type: "uint256" },
    ],
    name: "createMatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "matchId", type: "bytes32" }],
    name: "matches",
    outputs: [
      { internalType: "address", name: "agent1", type: "address" },
      { internalType: "address", name: "agent2", type: "address" },
      { internalType: "uint256", name: "wagerAmount", type: "uint256" },
      { internalType: "bool", name: "deposit1", type: "bool" },
      { internalType: "bool", name: "deposit2", type: "bool" },
      { internalType: "bool", name: "resolved", type: "bool" },
      { internalType: "bool", name: "cancelled", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "matchId", type: "bytes32" },
      { internalType: "address", name: "winner", type: "address" },
    ],
    name: "resolve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "matchId", type: "bytes32" }],
    name: "cancelAndRefund",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

function getClients(): {
  publicClient: PublicClient;
  walletClient: WalletClient | null;
  account: ReturnType<typeof privateKeyToAccount> | null;
} {
  const rpcUrl = config.escrow.rpcUrl;
  const chain = getChain();
  if (!rpcUrl || !chain) {
    return {
      publicClient: createPublicClient({ transport: http("https://none.invalid") }),
      walletClient: null,
      account: null,
    };
  }
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain, transport });
  const pk = config.escrow.resolverPrivateKey;
  const account = pk ? privateKeyToAccount(pk) : null;
  const walletClient = account
    ? createWalletClient({ chain, account, transport })
    : null;
  return { publicClient, walletClient, account };
}

/** Convert DB match UUID to on-chain bytes32 (keccak256(abi.encodePacked(uuid))). */
export function matchIdToBytes32(matchId: string): `0x${string}` {
  const encoded = encodePacked(["string"], [matchId]);
  return keccak256(encoded);
}

/** Check if escrow is configured (address + RPC + resolver key). */
export function isEscrowConfigured(): boolean {
  return !!(
    config.escrow.address &&
    config.escrow.rpcUrl &&
    config.escrow.resolverPrivateKey
  );
}

/** Create match on escrow (resolver only). `wagerTinybar` = smallest HBAR unit on-chain (8 decimals). */
export async function createMatch(
  matchId: string,
  agent1: Address,
  agent2: Address,
  wagerTinybar: bigint
): Promise<Hash | null> {
  if (!config.escrow.address || !config.escrow.resolverPrivateKey) return null;
  const { publicClient, walletClient, account } = getClients();
  if (!walletClient || !account) return null;
  const chain = getChain();
  if (!chain) return null;
  const matchIdBytes = matchIdToBytes32(matchId);
  const hash = await walletClient.writeContract({
    address: config.escrow.address,
    abi: ESCROW_ABI,
    functionName: "createMatch",
    args: [matchIdBytes, agent1, agent2, wagerTinybar],
    account,
    chain,
  });
  if (!hash) return null;
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Get on-chain deposit status for a match. */
export async function getMatchDeposits(matchId: string): Promise<{
  deposit1: boolean;
  deposit2: boolean;
  resolved: boolean;
  cancelled: boolean;
} | null> {
  if (!config.escrow.address || !config.escrow.rpcUrl) return null;
  try {
    const { publicClient } = getClients();
    const matchIdBytes = matchIdToBytes32(matchId);
    const row = await publicClient.readContract({
      address: config.escrow.address,
      abi: ESCROW_ABI,
      functionName: "matches",
      args: [matchIdBytes],
    });
    if (!row || row[0] === "0x0000000000000000000000000000000000000000")
      return null;
    return {
      deposit1: row[3],
      deposit2: row[4],
      resolved: row[5],
      cancelled: row[6],
    };
  } catch (e) {
    console.warn("[escrow] getMatchDeposits error:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Resolve match and pay winner (resolver only). */
export async function resolveMatch(
  matchId: string,
  winnerAddress: Address
): Promise<Hash | null> {
  if (!config.escrow.address || !config.escrow.resolverPrivateKey) return null;
  const { publicClient, walletClient, account } = getClients();
  if (!walletClient || !account) return null;
  const chain = getChain();
  if (!chain) return null;
  const matchIdBytes = matchIdToBytes32(matchId);
  const hash = await walletClient.writeContract({
    address: config.escrow.address,
    abi: ESCROW_ABI,
    functionName: "resolve",
    args: [matchIdBytes, winnerAddress],
    account,
    chain,
  });
  if (!hash) return null;
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Cancel match and refund depositors (resolver only). */
export async function cancelAndRefundMatch(matchId: string): Promise<Hash | null> {
  if (!config.escrow.address || !config.escrow.resolverPrivateKey) return null;
  const { publicClient, walletClient, account } = getClients();
  if (!walletClient || !account) return null;
  const chain = getChain();
  if (!chain) return null;
  const matchIdBytes = matchIdToBytes32(matchId);
  const hash = await walletClient.writeContract({
    address: config.escrow.address,
    abi: ESCROW_ABI,
    functionName: "cancelAndRefund",
    args: [matchIdBytes],
    account,
    chain,
  });
  if (!hash) return null;
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
