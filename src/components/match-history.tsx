'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchMatches, type MatchListItem } from '@/lib/api'

function formatTime(created_at: string) {
  const date = new Date(created_at)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return date.toLocaleDateString()
}

function statusBadge(status: string) {
  const classes =
    status === 'settled'
      ? 'bg-green-500/20 text-green-400'
      : status === 'cancelled'
        ? 'bg-rose-500/20 text-rose-400'
        : status === 'playing'
          ? 'bg-amber-500/20 text-amber-400'
          : 'bg-muted text-muted-foreground'
  return <span className={`inline-block px-2 py-1 text-xs font-semibold ${classes}`}>{status}</span>
}

export function MatchHistory() {
  const [matches, setMatches] = useState<MatchListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMatches({ limit: 15 })
      .then(setMatches)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <section className="py-16 md:py-24 border-t border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <h2 className="text-4xl font-semibold tracking-wider mb-2">Recent Matches</h2>
          <p className="text-muted-foreground">Latest matches — click for details and tx hashes</p>
        </div>

        {error && (
          <div className="mb-6 p-4 border border-rose-500/50 bg-rose-500/10 text-rose-400 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        ) : matches.length === 0 ? (
          <div className="border border-border bg-muted/20 p-8 text-center">
            <p className="text-muted-foreground">No matches yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Score</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Wager</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Time</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {matches.map((match) => (
                  <tr key={match.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-4">{statusBadge(match.status)}</td>
                    <td className="py-3 px-4 font-mono">
                      {match.agent1_wins} – {match.agent2_wins}
                    </td>
                    <td className="py-3 px-4">{match.wager_amount} HBAR</td>
                    <td className="py-3 px-4 text-muted-foreground text-xs">{formatTime(match.created_at)}</td>
                    <td className="py-3 px-4 text-right">
                      <Link href={`/match/${match.id}`} className="text-primary hover:underline text-xs">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* <div className="mt-8 flex justify-center">
          <Link
            href="/leaderboard"
            className="inline-block px-6 py-2 border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-sm"
          >
            Back to leaderboard
          </Link>
        </div> */}
      </div>
    </section>
  )
}
