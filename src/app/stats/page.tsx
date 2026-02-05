'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'

import { Navigation } from '@/components/navigation'
import { AgentProfile } from '@/components/agent-profile'
import { AgentStatsCards } from '@/components/agent-stats-cards'
import { PerformanceSection } from '@/components/performance-section'
import { AgentRecentMatches } from '@/components/agent-recent-matches'
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

const emptyAgent: Agent = {
  id: '',
  name: 'No Agent',
  strategy: 'balanced',
  riskLevel: 'medium',
  walletAddress: '',
  totalWins: 0,
  totalLosses: 0,
  totalMatches: 0,
  totalProfit: 0,
  averageWager: 0,
  currentStreak: 0,
  riskScore: 50,
  winRate: 0,
}

export default function StatsPage() {
  const { address, isConnected } = useAccount()
  const [agent, setAgent] = useState<Agent | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!address) {
      setAgent(null)
      return
    }

    const fetchStats = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const url = `/api/agents/stats?address=${address}`
        const res = await fetch(url, {
          headers: {
            Accept: 'application/json',
          },
        })

        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`)
        }

        const json: AgentStatsResponse = await res.json()
        if (!json.success || !json.stats) {
          setAgent(null)
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
        setError('Failed to load stats.')
        setAgent(null)
      } finally {
        setIsLoading(false)
      }
    }

    void fetchStats()
  }, [address])

  const effectiveAgent = agent ?? emptyAgent

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        {!isConnected && (
          <p className="mb-6 text-sm text-muted-foreground">
            Connect your wallet to see your stats.
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
        {isConnected && !isLoading && !error && !agent && (
          <p className="mb-6 text-sm text-muted-foreground">
            No stats available yet. Play your first match to see your stats here.
          </p>
        )}

        {agent && (
          <>
            <AgentProfile agent={effectiveAgent} />
            <AgentStatsCards agent={effectiveAgent} />
            {/* <PerformanceSection agent={effectiveAgent} /> */}
            <AgentRecentMatches agent={effectiveAgent} />
          </>
        )}
      </main>
    </div>
  )
}

