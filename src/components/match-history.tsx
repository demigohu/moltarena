'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'

import { Button } from '@/components/ui/button'
import { mockMatchHistory } from '@/lib/mock-data'
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

export function MatchHistory() {
  const { address, isConnected } = useAccount()
  const [history, setHistory] = useState<MatchHistoryItem[]>(mockMatchHistory)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!address) {
      setHistory(mockMatchHistory)
      return
    }

    const fetchHistory = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/match/history-public?address=${address}`)
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`)
        const json = await res.json()
        if (!json?.success || !Array.isArray(json.history)) {
          setHistory(mockMatchHistory)
          return
        }

        const mapped: MatchHistoryItem[] = json.history.map((h: HistoryApiItem, idx: number) => ({
          id: h.matchId ?? String(idx),
          opponent: {
            ...mockMatchHistory[0].opponent,
            name: h.opponent,
            walletAddress: h.opponent,
          },
          result: h.result,
          wager: h.wager,
          score: '-', // Score per round tidak tersedia dari GhostGraph untuk sekarang
          profitLoss: h.profitLoss,
          txHash: h.txHash ?? '0x',
          timestamp: new Date(h.finishedAt),
        }))

        if (mapped.length > 0) {
          setHistory(mapped)
        } else {
          setHistory(mockMatchHistory)
        }
      } catch (err) {
        console.error('Failed to load match history', err)
        setError('Failed to load live match history. Showing sample data.')
        setHistory(mockMatchHistory)
      } finally {
        setIsLoading(false)
      }
    }

    void fetchHistory()
  }, [address])

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
    <section className="py-16 md:py-24 border-t border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <h2 className="text-3xl font-semibold tracking-wider mb-2">Recent Matches</h2>
          <p className="text-muted-foreground">Your match history and results</p>
        </div>

        {!isConnected && (
          <p className="mb-4 text-sm text-muted-foreground">
            Connect your wallet to see your on-chain match history. Showing sample data.
          </p>
        )}
        {isConnected && isLoading && (
          <p className="mb-4 text-sm text-muted-foreground">Loading your match history...</p>
        )}
        {error && (
          <p className="mb-4 text-sm text-muted-foreground">
            {error}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Opponent</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Result</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Score</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Wager</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">P/L</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Time</th>
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
                  <td className="py-3 px-4 text-muted-foreground">{match.score}</td>
                  <td className="py-3 px-4 text-right">${match.wager.toFixed(2)}</td>
                  <td className={`py-3 px-4 text-right font-semibold ${match.profitLoss >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {match.profitLoss >= 0 ? '+' : ''} ${match.profitLoss.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-muted-foreground text-xs">{formatTime(match.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 flex justify-center">
          <Button variant="outline" className="rounded-none border-muted-foreground text-foreground hover:bg-accent hover:text-accent-foreground bg-transparent">
            View All History
          </Button>
        </div>
      </div>
    </section>
  )
}
