"use client"

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { mockOngoingMatches } from '@/lib/mock-data'

type Move = 'rock' | 'paper' | 'scissors'

const moves: Move[] = ['rock', 'paper', 'scissors']

type LiveMatchApi = {
  matchId: string
  player1: string
  player2: string
  wager: number
  createdAt: number | string
}

type UiMatch = {
  id: string
  player1: string
  player2: string
  wagerAmount: number
}

function shorten(addr: string) {
  if (!addr) return ''
  const s = addr.toString()
  if (s.length <= 10) return s
  return `${s.slice(0, 6)}...${s.slice(-4)}`
}

function getRandomMove(): Move {
  return moves[Math.floor(Math.random() * moves.length)]
}

function getResult(a: Move, b: Move): 'agent1' | 'agent2' | 'draw' {
  if (a === b) return 'draw'
  if (
    (a === 'rock' && b === 'scissors') ||
    (a === 'paper' && b === 'rock') ||
    (a === 'scissors' && b === 'paper')
  ) {
    return 'agent1'
  }
  return 'agent2'
}

function moveToIcon(move: Move) {
  if (move === 'rock') return '✊'
  if (move === 'paper') return '✋'
  return '✌️'
}

export function OngoingMatches() {
  const [matches, setMatches] = useState<UiMatch[]>(
    mockOngoingMatches.map((m) => ({
      id: m.id,
      player1: m.agent1.name,
      player2: m.agent2.name,
      wagerAmount: m.wagerAmount,
    })),
  )
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [agent1Move, setAgent1Move] = useState<Move>('rock')
  const [agent2Move, setAgent2Move] = useState<Move>('scissors')
  const [result, setResult] = useState<'agent1' | 'agent2' | 'draw'>('agent1')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchLive = async () => {
      try {
        const res = await fetch('/api/match/live')
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`)
        const json = await res.json()
        if (!json?.success || !Array.isArray(json.matches)) return

        const mapped: UiMatch[] = json.matches.map((m: LiveMatchApi) => ({
          id: String(m.matchId),
          player1: shorten(m.player1),
          player2: shorten(m.player2),
          wagerAmount: Number(m.wager ?? 0),
        }))

        if (mapped.length > 0) {
          setMatches(mapped)
          setSelectedMatchId(mapped[0].id)
        }
      } catch (err) {
        console.error('Failed to load live matches', err)
        setError('Failed to load live matches. Showing sample data.')
      }
    }

    void fetchLive()
  }, [])

  const selectedMatch =
    matches.find((m) => m.id === selectedMatchId) ??
    matches[0] ??
    {
      id: mockOngoingMatches[0].id,
      player1: mockOngoingMatches[0].agent1.name,
      player2: mockOngoingMatches[0].agent2.name,
      wagerAmount: mockOngoingMatches[0].wagerAmount,
    }

  const handleSelectMatch = (id: string) => {
    setSelectedMatchId(id)
    setIsDialogOpen(true)
  }

  const handleSimulate = () => {
    const m1 = getRandomMove()
    const m2 = getRandomMove()
    setAgent1Move(m1)
    setAgent2Move(m2)
    setResult(getResult(m1, m2))
  }

  const cardBaseClasses =
    'flex flex-col items-center justify-center border px-4 py-6 min-w-[96px] transition-colors'

  const getCardClasses = (owner: 'agent1' | 'agent2') => {
    const isWinner = result === owner
    const isLoser = result !== 'draw' && result !== owner
    const isDraw = result === 'draw'

    if (isWinner) {
      return `${cardBaseClasses} border-emerald-500 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.4)]`
    }
    if (isLoser) {
      return `${cardBaseClasses} border-rose-500 bg-rose-500/5`
    }
    if (isDraw) {
      return `${cardBaseClasses} border-border bg-muted/40`
    }
    return `${cardBaseClasses} border-border bg-muted/30`
  }

  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <h2 className="text-3xl font-semibold tracking-wider mb-2">Live Matches</h2>
          <p className="text-muted-foreground">Ongoing tournaments in real-time</p>
        </div>

        {error && (
          <p className="mb-4 text-sm text-muted-foreground">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {matches.map((match) => {
            const isSelected = match.id === selectedMatchId || (!selectedMatchId && match.id === selectedMatch.id)

            return (
              <button
                key={match.id}
                type="button"
                onClick={() => handleSelectMatch(match.id)}
                className={`text-left border p-6 hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                  isSelected ? 'border-primary shadow-md bg-muted/60' : 'border-border'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-medium text-green-500">Live</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">${match.wagerAmount}</div>
                    <div className="text-xs text-muted-foreground">Per match</div>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-medium">{match.player1}</h3>
                      <div className="text-xs text-muted-foreground mt-1">Player 1</div>
                    </div>
                  </div>

                  <div className="border-t border-border my-3" />

                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium">{match.player2}</h3>
                      <div className="text-xs text-muted-foreground mt-1">Player 2</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Best-of-5</span>
                  <span className="text-muted-foreground">Match ID: {match.id.toString().slice(0, 8)}</span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Simulation dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-xl border-border/80 bg-background/95">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span className="tracking-wider">Simulation</span>
                {selectedMatch && (
                  <span className="text-xs font-normal text-muted-foreground">
                    Match ID: {selectedMatch.id.toString().slice(0, 8)}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="mt-2">
              <p className="text-sm text-muted-foreground">
                {selectedMatch
                  ? `${selectedMatch.player1} vs ${selectedMatch.player2} — Rock Paper Scissors`
                  : 'Select a live match to start a simulation.'}
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-4">
              <div className="flex items-center justify-center gap-4">
                <div className={getCardClasses('agent1')}>
                  <span className="text-xs font-semibold text-muted-foreground mb-1">
                    {selectedMatch?.player1 ?? 'Player 1'}
                  </span>
                  <span className="text-3xl mb-1">{moveToIcon(agent1Move)}</span>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{agent1Move}</span>
                </div>

                <div className="text-xs font-medium text-muted-foreground">vs</div>

                <div className={getCardClasses('agent2')}>
                  <span className="text-xs font-semibold text-muted-foreground mb-1">
                    {selectedMatch?.player2 ?? 'Player 2'}
                  </span>
                  <span className="text-3xl mb-1">{moveToIcon(agent2Move)}</span>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{agent2Move}</span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <div>
                  {result === 'draw' && <span>Result: Draw</span>}
                  {result === 'agent1' && <span>Result: {selectedMatch?.player1 ?? 'Player 1'} wins</span>}
                  {result === 'agent2' && <span>Result: {selectedMatch?.player2 ?? 'Player 2'} wins</span>}
                </div>
              </div>

              <div className="mt-4 flex justify-center">
                <Button size="sm" className="rounded-none px-8" onClick={handleSimulate}>
                  Simulate Round
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  )
}
