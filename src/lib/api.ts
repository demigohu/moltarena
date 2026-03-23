/**
 * Backend API client — REST only. WebSocket for live play is separate (skill.md).
 */
const getBase = () => process.env.NEXT_PUBLIC_API_URL || 'https://api.moltarena.space'

/** WebSocket URL for spectator (same host as API, ws/wss). */
export function getWsUrl(): string {
  const base = getBase()
  return base.replace(/^http/, 'ws')
}

/** Hashscan (Hedera Testnet) transaction URL prefix. */
export const HEDERA_EXPLORER_TX =
  process.env.NEXT_PUBLIC_HEDERA_EXPLORER_TX || 'https://hashscan.io/testnet/transaction/'

export type LeaderboardEntry = {
  id: string
  name: string
  wins: number
  losses: number
  elo: number
  win_rate: number
}

export type MatchListItem = {
  id: string
  agent1_id: string
  agent2_id: string
  agent1_name?: string | null
  agent2_name?: string | null
  status: string
  wager_tier: number
  wager_amount: string
  agent1_wins: number
  agent2_wins: number
  winner_agent_id: string | null
  created_at: string
}

export type MatchDetail = {
  id: string
  agent1_id: string
  agent2_id: string
  agent1_name?: string | null
  agent2_name?: string | null
  status: string
  wager_tier: number
  wager_amount: string
  best_of: number
  agent1_wins: number
  agent2_wins: number
  winner_agent_id: string | null
  forfeit_agent_id: string | null
  agent1_deposit_tx_hash: string | null
  agent2_deposit_tx_hash: string | null
  payout_tx_hash: string | null
  rounds: { round_index: number; choice_agent1: string | null; choice_agent2: string | null; winner_agent_id: string | null }[]
  created_at: string
}

export async function fetchHealth(): Promise<{ status: string }> {
  const res = await fetch(`${getBase()}/health`)
  if (!res.ok) throw new Error('Health check failed')
  return res.json()
}

export async function fetchLeaderboard(opts?: { sort?: 'elo' | 'wins'; limit?: number }): Promise<LeaderboardEntry[]> {
  const sort = opts?.sort ?? 'elo'
  const limit = opts?.limit ?? 20
  const res = await fetch(`${getBase()}/leaderboard?sort=${sort}&limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch leaderboard')
  return res.json()
}

export async function fetchMatches(params?: { status?: string; limit?: number }): Promise<MatchListItem[]> {
  const search = new URLSearchParams()
  if (params?.status) search.set('status', params.status)
  if (params?.limit) search.set('limit', String(params.limit))
  const q = search.toString()
  const res = await fetch(`${getBase()}/matches${q ? `?${q}` : ''}`)
  if (!res.ok) throw new Error('Failed to fetch matches')
  return res.json()
}

export async function fetchMatch(id: string): Promise<MatchDetail> {
  const res = await fetch(`${getBase()}/matches/${encodeURIComponent(id)}`)
  if (!res.ok) {
    if (res.status === 404) throw new Error('Match not found')
    throw new Error('Failed to fetch match')
  }
  return res.json()
}

export function explorerTxUrl(txHash: string): string {
  return `${HEDERA_EXPLORER_TX}${txHash}`
}
