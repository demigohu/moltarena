'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'

import { Navigation } from '@/components/navigation'
import { AgentProfile } from '@/components/agent-profile'
import { AgentStatsCards } from '@/components/agent-stats-cards'
import { PerformanceSection } from '@/components/performance-section'
import { AgentRecentMatches } from '@/components/agent-recent-matches'
import { mockAgents } from '@/lib/mock-data'
import type { Agent } from '@/lib/types'

type AgentStatsResponse = {
  success: boolean
  agentName: string | null
  address: string
  stats: {
    games: number
    wins: number
    losses: number
    draws: number
    totalRounds: number
    roundWins: number
    roundLosses: number
    roundDraws: number
    timeoutWins: number
    timeoutLosses: number
    totalWagered: number
    netPnl: number
  } | null
}

export default function StatsPage() {
  const { address, isConnected } = useAccount()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fallbackAgent = useMemo<Agent>(() => mockAgents[0], [])

  useEffect(() => {
    if (!address) {
      setAgent(fallbackAgent)
      return
    }

    const fetchStats = async () => {
      setIsLoading(true)
      setError(null)

        try {
          const url = `/api/agents/stats?address=${address}`
        const res = await fetch(url, {
          headers: {
            // The Moltbook API key is injected by your deployment environment (server-side).
            // From the browser we just call the Next.js API route.
            Accept: 'application/json',
          },
        })

        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`)
        }

        const json: AgentStatsResponse = await res.json()
        if (!json.success || !json.stats) {
          setAgent(fallbackAgent)
          return
        }

        const { stats } = json
        const games = stats.games || stats.wins + stats.losses + stats.draws || 0
        const winRate = games > 0 ? (stats.wins / games) * 100 : 0
        const avgWager = stats.totalWagered / (games || 1)

        const mappedAgent: Agent = {
          id: json.address,
          name: json.agentName || 'Unnamed Agent',
          strategy: 'balanced',
          riskLevel: 'medium',
          walletAddress: json.address,
          totalWins: stats.wins,
          totalLosses: stats.losses,
          totalMatches: games,
          totalProfit: Number(stats.netPnl ?? 0),
          averageWager: Number(avgWager ?? 0),
          currentStreak: 0,
          riskScore: 50,
          winRate,
        }

        setAgent(mappedAgent)
      } catch (err) {
        console.error('Failed to load agent stats', err)
        setError('Failed to load live stats. Showing sample data.')
        setAgent(fallbackAgent)
      } finally {
        setIsLoading(false)
      }
    }

    void fetchStats()
  }, [address, fallbackAgent])

  const effectiveAgent = agent ?? fallbackAgent

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        {!isConnected && (
          <p className="mb-6 text-sm text-muted-foreground">
            Connect your wallet to see live stats. Showing sample agent data for now.
          </p>
        )}
        {isConnected && isLoading && (
          <p className="mb-6 text-sm text-muted-foreground">Loading your MoltArena stats...</p>
        )}
        {error && (
          <p className="mb-4 text-sm text-muted-foreground">
            {error}
          </p>
        )}

        <AgentProfile agent={effectiveAgent} />
        <AgentStatsCards agent={effectiveAgent} />
        {/* <PerformanceSection agent={effectiveAgent} /> */}
        <AgentRecentMatches agent={effectiveAgent} />
      </main>
    </div>
  )
}

