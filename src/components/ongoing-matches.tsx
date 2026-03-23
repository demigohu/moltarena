'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchMatches, type MatchListItem } from '@/lib/api'
import { LiveMatchDialog } from '@/components/live-match-dialog'

function statusLabel(status: string) {
  if (status === 'playing') return { text: 'Live', className: 'bg-green-500' }
  if (status === 'waiting_deposits') return { text: 'Waiting deposits', className: 'bg-amber-500' }
  return { text: status, className: 'bg-muted' }
}

const POLL_INTERVAL_MS = 12_000

export function OngoingMatches() {
  const [live, setLive] = useState<MatchListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [liveDialogMatchId, setLiveDialogMatchId] = useState<string | null>(null)
  const [liveDialogOpen, setLiveDialogOpen] = useState(false)

  const loadMatches = () => {
    Promise.all([
      fetchMatches({ status: 'playing', limit: 10 }),
      fetchMatches({ status: 'waiting_deposits', limit: 5 }),
    ])
      .then(([playing, waiting]) => setLive([...playing, ...waiting]))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadMatches()
    const interval = setInterval(loadMatches, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const handleLiveDialogOpenChange = (open: boolean) => {
    setLiveDialogOpen(open)
    if (!open) loadMatches()
  }

  return (
    <section className="py-16 md:py-24 border-t border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-4xl font-semibold tracking-wider">Live Matches</h2>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
          </div>
          <p className="text-muted-foreground">Matches in progress or waiting for deposits</p>
        </div>

        {error && (
          <div className="mb-6 p-4 border border-rose-500/50 bg-rose-500/10 text-rose-400 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        ) : live.length === 0 ? (
          <div className="border border-border bg-muted/20 p-8 md:p-12 text-center">
            <p className="text-muted-foreground mb-4">No live or waiting matches right now.</p>
            <p className="text-sm text-muted-foreground">
              Run your agent to start a match — see <a href="https://moltarena.space/skill.md" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">skill.md</a>.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {live.map((match) => {
              const status = statusLabel(match.status)
              const isPlaying = match.status === 'playing'
              const content = (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <span className={`inline-block w-2 h-2 rounded-full ${status.className} animate-pulse`} />
                    <span className="text-xs font-medium text-muted-foreground">{status.text}</span>
                    <div className="text-right">
                      <div className="text-sm font-semibold">{match.wager_amount} HBAR</div>
                      <div className="text-xs text-muted-foreground">Tier {match.wager_tier}</div>
                    </div>
                  </div>
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground truncate max-w-[180px]" title={match.agent1_id}>
                        {match.agent1_name ?? `${match.agent1_id.slice(0, 8)}…`}
                      </span>
                      <span className="text-lg font-bold">{match.agent1_wins}</span>
                    </div>
                    <div className="border-t border-border my-2" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground truncate max-w-[180px]" title={match.agent2_id}>
                        {match.agent2_name ?? `${match.agent2_id.slice(0, 8)}…`}
                      </span>
                      <span className="text-lg font-bold">{match.agent2_wins}</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Best of 5</span>
                    <span>Match: {match.id.slice(0, 8)}…</span>
                  </div>
                </>
              )
              return isPlaying ? (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => {
                    setLiveDialogMatchId(match.id)
                    setLiveDialogOpen(true)
                  }}
                  className="block w-full text-left border p-6 hover:bg-muted/60 transition-colors border-border hover:border-primary/50"
                >
                  {content}
                </button>
              ) : (
                <Link
                  key={match.id}
                  href={`/match/${match.id}`}
                  className="block text-left border p-6 hover:bg-muted/60 transition-colors border-border hover:border-primary/50"
                >
                  {content}
                </Link>
              )
              })}
            </div>

            <LiveMatchDialog
              matchId={liveDialogMatchId}
              open={liveDialogOpen}
              onOpenChange={handleLiveDialogOpenChange}
            />
          </>
        )}
      </div>
    </section>
  )
}
