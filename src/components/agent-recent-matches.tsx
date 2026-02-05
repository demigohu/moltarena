'use client'

import type { Agent } from '@/lib/types'
import { useEffect, useState } from 'react'
import type { MatchHistory as MatchHistoryItem } from '@/lib/types'

type HistoryApiItem = {
  matchId: string
  opponent: string
  result: 'win' | 'loss' | 'draw'
  wager: number
  profitLoss: number
  finishedAt: number
  txHash: string | null
}

interface AgentRecentMatchesProps {
  agent: Agent
}

export function AgentRecentMatches({ agent }: AgentRecentMatchesProps) {
  const [history, setHistory] = useState<MatchHistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!agent.walletAddress) {
      setHistory([])
      return
    }

    const fetchHistory = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/match/history-public?address=${agent.walletAddress}`)
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`)
        const json = await res.json()
        if (!json?.success || !Array.isArray(json.history)) {
          setHistory([])
          return
        }

        const mapped: MatchHistoryItem[] = json.history.map((h: HistoryApiItem, idx: number) => ({
          id: h.matchId ?? String(idx),
          opponent: {
            name: h.opponent || 'Unknown',
            walletAddress: h.opponent || '',
          },
          result: h.result,
          wager: h.wager,
          score: '-',
          profitLoss: h.profitLoss,
          txHash: h.txHash ?? '0x',
          timestamp: new Date(h.finishedAt),
        }))

        setHistory(mapped)
      } catch (err) {
        console.error('Failed to load agent match history', err)
        setError('Failed to load match history.')
        setHistory([])
      } finally {
        setIsLoading(false)
      }
    }

    void fetchHistory()
  }, [agent.walletAddress])

  const formatTime = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return date.toLocaleDateString()
  }

  return (
    <section className="py-12">
      <h2 className="text-2xl font-semibold tracking-wider mb-8">Recent Matches</h2>

      {isLoading && (
        <p className="mb-4 text-sm text-muted-foreground">Loading recent matches...</p>
      )}
      {error && (
        <p className="mb-4 text-sm text-muted-foreground">
          {error}
        </p>
      )}
      {!agent.walletAddress && (
        <p className="mb-4 text-sm text-muted-foreground">
          Connect wallet to view match history.
        </p>
      )}
      {!isLoading && !error && history.length === 0 && agent.walletAddress && (
        <p className="mb-4 text-sm text-muted-foreground">
          No match history yet. Play your first match to see results here.
        </p>
      )}

      {history.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Opponent</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Result</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Round Score</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Wager</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">P/L</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Time</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Tx Hash</th>
              </tr>
            </thead>
            <tbody>
              {history.map((match) => (
              <tr key={match.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                <td className="py-3 px-4 font-medium">{match.opponent.name}</td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-block px-2 py-1 text-xs font-semibold ${
                      match.result === 'win'
                        ? 'bg-green-500/20 text-green-400'
                        : match.result === 'loss'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                    }`}
                  >
                    {match.result.toUpperCase()}
                  </span>
                </td>
                <td className="py-3 px-4 text-muted-foreground font-mono">{match.score}</td>
                <td className="py-3 px-4 text-right">${match.wager.toFixed(2)}</td>
                <td className={`py-3 px-4 text-right font-semibold ${match.profitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {match.profitLoss >= 0 ? '+' : ''} ${match.profitLoss.toFixed(2)}
                </td>
                <td className="py-3 px-4 text-muted-foreground text-xs">{formatTime(match.timestamp)}</td>
                <td className="py-3 px-4 text-muted-foreground text-xs font-mono">
                  <a href="#" className="hover:text-foreground transition-colors">
                    {match.txHash.slice(0, 8)}...
                  </a>
                </td>
              </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
