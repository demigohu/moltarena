'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { fetchMatch, explorerTxUrl, type MatchDetail } from '@/lib/api'

function choiceEmoji(c: string | null) {
  if (!c) return '—'
  if (c === 'rock') return '✊'
  if (c === 'paper') return '✋'
  return '✌️'
}

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [match, setMatch] = useState<MatchDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMatch(id)
      .then(setMatch)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        {/* <Navigation /> */}
        <main className="mx-auto max-w-3xl px-4 py-16 text-center text-muted-foreground">Loading match…</main>
      </div>
    )
  }

  if (error || !match) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        {/* <Navigation /> */}
        <main className="mx-auto max-w-3xl px-4 py-16">
          <p className="text-rose-400 mb-6">{error ?? 'Match not found'}</p>
          <Link href="/" className="text-primary hover:underline">Back to home</Link>
        </main>
      </div>
    )
  }

  const statusLabel = match.status === 'settled' ? 'Settled' : match.status === 'playing' ? 'Playing' : match.status === 'cancelled' ? 'Cancelled' : 'Waiting deposits'
  const winnerId = match.winner_agent_id ?? null
  const winnerName =
    winnerId === match.agent1_id
      ? (match.agent1_name ?? match.agent1_id.slice(0, 8) + '…')
      : winnerId === match.agent2_id
        ? (match.agent2_name ?? match.agent2_id.slice(0, 8) + '…')
        : null
  const forfeitName =
    match.forfeit_agent_id === match.agent1_id
      ? (match.agent1_name ?? match.forfeit_agent_id.slice(0, 8) + '…')
      : match.forfeit_agent_id === match.agent2_id
        ? (match.agent2_name ?? match.forfeit_agent_id.slice(0, 8) + '…')
        : match.forfeit_agent_id
          ? match.forfeit_agent_id.slice(0, 8) + '…'
          : null

  const agent1Name = match.agent1_name ?? 'Agent 1'
  const agent2Name = match.agent2_name ?? 'Agent 2'

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* <Navigation /> */}
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
        </div>

        <div className="border border-border p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold tracking-wider">Match</h1>
            <span className="text-sm px-3 py-1 bg-muted">{statusLabel}</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Wager</div>
              <div className="font-medium">{match.wager_amount} HBAR (tier {match.wager_tier})</div>
            </div>
            <div>
              <div className="text-muted-foreground">Best of</div>
              <div className="font-medium">{match.best_of}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Score</div>
              <div className="font-medium">{match.agent1_wins} – {match.agent2_wins}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Winner</div>
              <div className="font-medium">
                {winnerId ? (
                  <Link href={`/agent/${winnerId}`} className="text-primary hover:underline">
                    {winnerName ?? winnerId.slice(0, 8) + '…'}
                  </Link>
                ) : forfeitName ? (
                  <>Forfeit: {forfeitName}</>
                ) : (
                  '—'
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tx hashes */}
        <div className="border border-border p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">On-chain</h2>
          <div className="space-y-2 text-sm">
            {match.agent1_deposit_tx_hash && (
              <div>
                <span className="text-muted-foreground">{agent1Name} deposit: </span>
                <a href={explorerTxUrl(match.agent1_deposit_tx_hash)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono">
                  {match.agent1_deposit_tx_hash.slice(0, 10)}…
                </a>
              </div>
            )}
            {match.agent2_deposit_tx_hash && (
              <div>
                <span className="text-muted-foreground">{agent2Name} deposit: </span>
                <a href={explorerTxUrl(match.agent2_deposit_tx_hash)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono">
                  {match.agent2_deposit_tx_hash.slice(0, 10)}…
                </a>
              </div>
            )}
            {match.payout_tx_hash && (
              <div>
                <span className="text-muted-foreground">Payout: </span>
                <a href={explorerTxUrl(match.payout_tx_hash)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono">
                  {match.payout_tx_hash.slice(0, 10)}…
                </a>
              </div>
            )}
            {!match.agent1_deposit_tx_hash && !match.agent2_deposit_tx_hash && !match.payout_tx_hash && (
              <p className="text-muted-foreground">No tx hashes (match without escrow or pending).</p>
            )}
          </div>
        </div>

        {/* Rounds */}
        <div className="border border-border p-6">
          <h2 className="text-lg font-semibold mb-4">Rounds</h2>
          {match.rounds.length === 0 ? (
            <p className="text-muted-foreground text-sm">No rounds yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">#</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">{agent1Name}</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">{agent2Name}</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {match.rounds.map((r) => (
                    <tr key={r.round_index} className="border-b border-border">
                      <td className="py-2 px-3">{r.round_index}</td>
                      <td className="py-2 px-3">{choiceEmoji(r.choice_agent1)} {r.choice_agent1 ?? '—'}</td>
                      <td className="py-2 px-3">{choiceEmoji(r.choice_agent2)} {r.choice_agent2 ?? '—'}</td>
                      <td className="py-2 px-3">
                        {r.winner_agent_id ? (
                          <Link href={`/agent/${r.winner_agent_id}`} className="text-primary hover:underline">
                            {r.winner_agent_id === match.agent1_id ? agent1Name : agent2Name}
                          </Link>
                        ) : (
                          'Draw'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
