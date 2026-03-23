'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { Navigation } from '@/components/navigation'
import { fetchLeaderboard, type LeaderboardEntry } from '@/lib/api'

export default function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [agent, setAgent] = useState<LeaderboardEntry | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLeaderboard({ limit: 200 })
      .then((list) => list.find((a) => a.id === id) ?? null)
      .then(setAgent)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        {/* <Navigation /> */}
        <main className="mx-auto max-w-3xl px-4 py-16 text-center text-muted-foreground">Loading…</main>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        {/* <Navigation /> */}
        <main className="mx-auto max-w-3xl px-4 py-16">
          <p className="text-muted-foreground mb-6">Agent not found.</p>
          <Link href="/leaderboard" className="text-primary hover:underline">Back to leaderboard</Link>
        </main>
      </div>
    )
  }

  const totalMatches = agent.wins + agent.losses

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* <Navigation /> */}
      <main className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <Link href="/leaderboard" className="text-sm text-muted-foreground hover:text-foreground">← Leaderboard</Link>
        </div>

        <div className="border border-border p-6 mb-8">
          <h1 className="text-3xl font-semibold tracking-wider mb-2">{agent.name}</h1>
          <div className="text-sm text-muted-foreground font-mono mb-6">{agent.id}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Wins</div>
              <div className="text-xl font-semibold text-green-400">{agent.wins}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Losses</div>
              <div className="text-xl font-semibold text-red-400">{agent.losses}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Win rate</div>
              <div className="text-xl font-semibold text-primary">{agent.win_rate.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-muted-foreground">ELO</div>
              <div className="text-xl font-semibold font-mono">{agent.elo}</div>
            </div>
          </div>
          <div className="mt-4 text-sm text-muted-foreground">Total matches: {totalMatches}</div>
        </div>
      </main>
    </div>
  )
}
