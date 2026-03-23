/**
 * In-memory matchmaking queue per wager_tier.
 * PRD: 2 agent tier sama → buat match, emit game_matched.
 * If escrow configured, createMatch on-chain and require agent wallet_address.
 */
import { getSupabase } from "../db/supabase";
import { getWagerAmount, WagerTier, DEPOSIT_TIMEOUT_MINUTES, BEST_OF } from "./constants";
import { isEscrowConfigured, createMatch as createEscrowMatch, matchIdToBytes32 } from "../chain/escrow";
import { parseUnits } from "viem";
import { isAddress } from "viem";

export type QueuedAgent = {
  agentId: string;
  agentName: string;
  socketId: string;
  wagerTier: WagerTier;
  joinedAt: Date;
};

const queues: Record<WagerTier, QueuedAgent[]> = {
  1: [],
  2: [],
  3: [],
  4: [],
};

export function getQueue(tier: WagerTier): QueuedAgent[] {
  return queues[tier];
}

export function addToQueue(entry: QueuedAgent): void {
  const q = queues[entry.wagerTier];
  if (!q.some((e) => e.agentId === entry.agentId)) {
    q.push(entry);
  }
}

export function removeFromQueue(agentId: string): void {
  for (const tier of [1, 2, 3, 4] as WagerTier[]) {
    queues[tier] = queues[tier].filter((e) => e.agentId !== agentId);
  }
}

/**
 * Try to match two agents in the same tier. Returns match id if created, null otherwise.
 * When escrow createMatch succeeds, escrow is set so client can deposit.
 */
export async function tryMatch(
  tier: WagerTier
): Promise<
  | { matchId: string; agent1: QueuedAgent; agent2: QueuedAgent; escrow?: { matchIdHex: string; wagerWei: string } }
  | null
> {
  const q = queues[tier];
  if (q.length < 2) return null;

  const [agent1, agent2] = q.splice(0, 2);
  const depositTimeoutAt = new Date(Date.now() + DEPOSIT_TIMEOUT_MINUTES * 60 * 1000);
  const wagerAmount = getWagerAmount(tier);

  const supabase = getSupabase();
  const { data: match, error } = await supabase
    .from("matches")
    .insert({
      agent1_id: agent1.agentId,
      agent2_id: agent2.agentId,
      status: "waiting_deposits",
      wager_tier: tier,
      wager_amount: String(wagerAmount),
      best_of: BEST_OF,
      deposit_timeout_at: depositTimeoutAt.toISOString(),
    })
    .select("id")
    .single();

  if (error || !match) return null;

  let escrow: { matchIdHex: string; wagerWei: string } | undefined;
  if (isEscrowConfigured()) {
    const { data: a1 } = await supabase.from("agents").select("wallet_address").eq("id", agent1.agentId).single();
    const { data: a2 } = await supabase.from("agents").select("wallet_address").eq("id", agent2.agentId).single();
    const addr1 = a1?.wallet_address?.trim();
    const addr2 = a2?.wallet_address?.trim();
    if (addr1 && addr2 && isAddress(addr1) && isAddress(addr2)) {
      const wagerWei = parseUnits(String(wagerAmount), 18);
      const txHash = await createEscrowMatch(match.id, addr1 as `0x${string}`, addr2 as `0x${string}`, wagerWei);
      if (txHash) {
        escrow = {
          matchIdHex: matchIdToBytes32(match.id),
          wagerWei: wagerWei.toString(),
        };
      }
    }
  }

  return { matchId: match.id, agent1, agent2, escrow };
}
