"use client"

import { useEffect, useState } from 'react'
import { useLiveMatches, type StakeTier } from '@/hooks/useMatches'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Move = 'rock' | 'paper' | 'scissors'

const moves: Move[] = ['rock', 'paper', 'scissors']
const ROUND_DURATION_SECONDS = 60
const STAKE_TIERS: { value: StakeTier | null; label: string }[] = [
  { value: null, label: 'All tiers' },
  { value: '0.1', label: '0.1 MON' },
  { value: '0.5', label: '0.5 MON' },
  { value: '1', label: '1 MON' },
  { value: '5', label: '5 MON' },
]

type UiMatch = {
  id: string
  player1: string
  player2: string
  wagerAmount: number
  status?: string
  player1Locked?: boolean
  player2Locked?: boolean
  stakeTier?: string
}

function shorten(addr: string | null | undefined) {
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
  const [stakeTierFilter, setStakeTierFilter] = useState<StakeTier | null>(null)
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [agent1Move, setAgent1Move] = useState<Move>('rock')
  const [agent2Move, setAgent2Move] = useState<Move>('scissors')
  const [result, setResult] = useState<'agent1' | 'agent2' | 'draw'>('agent1')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [roundProgress, setRoundProgress] = useState(0)

  const { data: liveMatches = [], isLoading, error } = useLiveMatches({ stakeTier: stakeTierFilter })

  const matches: UiMatch[] = liveMatches.map((m) => ({
    id: String(m.matchId),
    player1: m.player1?.name || shorten(m.player1?.address) || 'Player 1',
    player2: m.player2
      ? m.player2.name || shorten(m.player2.address) || 'Player 2'
      : 'Waiting for opponent',
    wagerAmount: Number(m.stake ?? 0),
    status: m.status,
    player1Locked: m.player1StakeLocked,
    player2Locked: m.player2StakeLocked,
    stakeTier: m.stakeTier ?? String(m.stake),
  }))

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsedSeconds = (Date.now() / 1000) % ROUND_DURATION_SECONDS
      setRoundProgress((elapsedSeconds / ROUND_DURATION_SECONDS) * 100)
    }, 500)
    return () => clearInterval(interval)
  }, [])

  const selectedMatch =
    matches.find((m) => m.id === selectedMatchId) ??
    (matches.length > 0 ? matches[0] : null)

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
          <p className="text-muted-foreground mb-4">
            Ongoing tournaments in real-time with ~60s round timers
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Stake tier:</span>
            {STAKE_TIERS.map(({ value, label }) => (
              <button
                key={label}
                type="button"
                onClick={() => setStakeTierFilter(value)}
                className={`px-3 py-1.5 text-sm rounded border transition-colors ${
                  stakeTierFilter === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:bg-muted/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mb-4 text-sm text-muted-foreground">
            {String(error)}
          </p>
        )}

        {isLoading && (
          <p className="mb-4 text-sm text-muted-foreground">Loading matches...</p>
        )}

        {!isLoading && !error && matches.length === 0 && (
          <p className="mb-6 text-sm text-muted-foreground">
            No live matches right now. Check back soon.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {matches.map((match) => {
            const isSelected =
              match.id === selectedMatchId || (!selectedMatchId && selectedMatch && match.id === selectedMatch.id)

            return (
              <button
                key={match.id}
                type="button"
                onClick={() => handleSelectMatch(match.id)}
                className={`text-left border p-6 hover:bg-muted/60 transition-colors transform hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                  isSelected ? 'border-primary shadow-md bg-muted/60' : 'border-border'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-medium text-green-500">Live</span>
                    {match.status && (
                      <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                        {match.status.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{match.wagerAmount} MON</div>
                    <div className="text-xs text-muted-foreground">
                      Tier {match.stakeTier ?? match.wagerAmount}
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-medium">{match.player1}</h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-xs text-muted-foreground">Player 1</span>
                        {match.player1Locked && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-600 rounded">
                            Locked
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border my-3" />

                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium">{match.player2}</h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-xs text-muted-foreground">Player 2</span>
                        {match.player2Locked && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-600 rounded">
                            Locked
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Best-of-5</span>
                  <span className="text-muted-foreground">Match ID: {match.id.toString().slice(0, 8)}</span>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                    <span>Round timer</span>
                    <span>~60s</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted overflow-hidden rounded-full">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${roundProgress}%` }}
                    />
                  </div>
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
