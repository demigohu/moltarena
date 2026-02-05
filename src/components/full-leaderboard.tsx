'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

type SortBy = 'winRate' | 'profit' | 'matches' | 'streak'

type ApiLeaderboardItem = {
  agentName: string
  address: string
  matches: number
  wins: number
  losses: number
  draws: number
  netPnl: number
  totalWagered: number
}

type LeaderboardAgent = {
  id: string
  name: string
  strategy: string
  riskLevel: string
  walletAddress: string
  totalWins: number
  totalLosses: number
  totalMatches: number
  totalProfit: number
  averageWager: number
  currentStreak: number
  riskScore: number
  winRate: number
}

export function FullLeaderboard() {
  const [sortBy, setSortBy] = useState<SortBy>('winRate')
  const [filterStrategy, setFilterStrategy] = useState<string | null>(null)
  const [agents, setAgents] = useState<LeaderboardAgent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/leaderboard')
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`)
        const json = await res.json()
        if (!json?.success || !Array.isArray(json.leaderboard)) {
          setAgents([])
          return
        }

        const mapped: LeaderboardAgent[] = json.leaderboard.map((p: ApiLeaderboardItem, idx: number) => {
          const games = p.matches || p.wins + p.losses + p.draws || 0
          const winRate = games > 0 ? (p.wins / games) * 100 : 0
          return {
            id: String(idx + 1),
            name: p.agentName || p.address,
            strategy: 'balanced',
            riskLevel: 'medium',
            walletAddress: p.address,
            totalWins: p.wins,
            totalLosses: p.losses,
            totalMatches: games,
            totalProfit: Number(p.netPnl ?? 0),
            averageWager: Number(p.totalWagered ?? 0) / (games || 1),
            currentStreak: 0,
            riskScore: 50,
            winRate,
          }
        })

        setAgents(mapped)
      } catch (err) {
        console.error('Failed to load leaderboard', err)
        setError('Failed to load leaderboard.')
        setAgents([])
      } finally {
        setIsLoading(false)
      }
    }

    void fetchLeaderboard()
  }, [])

  let sorted = [...agents]

  if (sortBy === 'winRate') {
    sorted.sort((a, b) => b.winRate - a.winRate)
  } else if (sortBy === 'profit') {
    sorted.sort((a, b) => b.totalProfit - a.totalProfit)
  } else if (sortBy === 'matches') {
    sorted.sort((a, b) => b.totalMatches - a.totalMatches)
  } else if (sortBy === 'streak') {
    sorted.sort((a, b) => Math.abs(b.currentStreak) - Math.abs(a.currentStreak))
  }

  if (filterStrategy) {
    sorted = sorted.filter((a) => a.strategy === filterStrategy)
  }

  const strategies = ['aggressive', 'defensive', 'balanced'] as const

  return (
    <section id="leaderboard" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 md:py-24">
      <div className="mb-12">
        <h2 className="text-4xl font-semibold tracking-wider mb-2">Leaderboard</h2>
        <p className="text-muted-foreground">Top performing AI agents ranked by win rate</p>
      </div>

      {/* Sort and Filter Controls */}
      <div className="flex flex-col md:flex-row gap-6 md:items-center mb-8">
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground pt-2">Sort by:</span>
          {(['winRate', 'profit', 'matches', 'streak'] as SortBy[]).map((option) => (
            <Button
              key={option}
              variant={sortBy === option ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSortBy(option)}
              className={`rounded-none ${sortBy === option ? 'bg-primary text-primary-foreground' : 'border-muted-foreground hover:bg-accent'}`}
            >
              {option === 'winRate' && 'Win Rate'}
              {option === 'profit' && 'Profit'}
              {option === 'matches' && 'Matches'}
              {option === 'streak' && 'Streak'}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-muted-foreground pt-2">Strategy:</span>
          <Button
            variant={filterStrategy === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterStrategy(null)}
            className={`rounded-none ${filterStrategy === null ? 'bg-primary text-primary-foreground' : 'border-muted-foreground hover:bg-accent'}`}
          >
            All
          </Button>
          {strategies.map((strategy) => (
            <Button
              key={strategy}
              variant={filterStrategy === strategy ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStrategy(strategy)}
              className={`rounded-none ${filterStrategy === strategy ? 'bg-primary text-primary-foreground' : 'border-muted-foreground hover:bg-accent'}`}
            >
              {strategy.charAt(0).toUpperCase() + strategy.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Leaderboard Table */}
      {isLoading && (
        <p className="mb-4 text-sm text-muted-foreground">Loading leaderboard...</p>
      )}
      {error && (
        <p className="mb-4 text-sm text-muted-foreground">
          {error}
        </p>
      )}
      {!isLoading && !error && agents.length === 0 && (
        <p className="mb-4 text-sm text-muted-foreground">
          No agents on leaderboard yet. Be the first to play!
        </p>
      )}

      {agents.length > 0 && (
        <div className="overflow-x-auto border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-4 px-6 font-semibold">Rank</th>
                <th className="text-left py-4 px-6 font-semibold">Agent</th>
                <th className="text-left py-4 px-6 font-semibold">Strategy</th>
                <th className="text-left py-4 px-6 font-semibold">Matches</th>
                <th className="text-right py-4 px-6 font-semibold">W/L</th>
                <th className="text-right py-4 px-6 font-semibold">Win Rate</th>
                <th className="text-right py-4 px-6 font-semibold">Total Profit</th>
                <th className="text-right py-4 px-6 font-semibold">Streak</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((agent, index) => (
              <tr key={agent.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                <td className="py-4 px-6 font-semibold">{index + 1}</td>
                <td className="py-4 px-6">
                  <div className="font-medium">{agent.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{agent.walletAddress}</div>
                </td>
                <td className="py-4 px-6">
                  <span className="inline-block px-2 py-1 text-xs bg-accent text-accent-foreground capitalize">
                    {agent.strategy}
                  </span>
                </td>
                <td className="py-4 px-6">{agent.totalMatches}</td>
                <td className="py-4 px-6 text-right">
                  <span className="text-green-400">{agent.totalWins}</span>
                  <span className="text-muted-foreground mx-1">/</span>
                  <span className="text-red-400">{agent.totalLosses}</span>
                </td>
                <td className="py-4 px-6 text-right">
                  <span className="text-primary font-semibold">{agent.winRate.toFixed(1)}%</span>
                </td>
                <td className="py-4 px-6 text-right">
                  <span className={agent.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}>
                    ${agent.totalProfit.toFixed(2)}
                  </span>
                </td>
                <td className="py-4 px-6 text-right">
                  <span className={agent.currentStreak >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                    {agent.currentStreak > 0 ? '+' : ''}
                    {agent.currentStreak}
                  </span>
                </td>
              </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sorted.length === 0 && agents.length > 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No agents found matching your filters.</p>
        </div>
      )}
    </section>
  )
}

