'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { io, type Socket } from 'socket.io-client'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getWsUrl, fetchMatch, explorerTxUrl, type MatchDetail } from '@/lib/api'

type Choice = 'rock' | 'paper' | 'scissors' | null

function choiceEmoji(c: Choice) {
  if (!c) return '—'
  if (c === 'rock') return '✊'
  if (c === 'paper') return '✋'
  return '✌️'
}

const cardBase =
  'flex flex-col items-center justify-center border px-4 py-6 min-w-[96px] transition-all duration-300'

function getCardClasses(winner: '1' | '2' | null, isAgent1: boolean) {
  if (!winner) return `${cardBase} border-border bg-muted/40`
  const isWinner = (winner === '1' && isAgent1) || (winner === '2' && !isAgent1)
  if (isWinner) return `${cardBase} border-emerald-500 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.4)]`
  return `${cardBase} border-rose-500/50 bg-rose-500/5`
}

interface LiveMatchDialogProps {
  matchId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LiveMatchDialog({ matchId, open, onOpenChange }: LiveMatchDialogProps) {
  const [match, setMatch] = useState<MatchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [roundStart, setRoundStart] = useState<{ round: number; endsAt: string } | null>(null)
  const [lastResult, setLastResult] = useState<{
    choice1: Choice
    choice2: Choice
    winnerAgentId: string | null
    agent1Wins: number
    agent2Wins: number
  } | null>(null)
  const [gameEnded, setGameEnded] = useState<{ winner: string; score: { agent1: number; agent2: number }; txHashPayout?: string } | null>(null)
  const [chatMessages, setChatMessages] = useState<{ agentId: string; agentName: string; side: 1 | 2; round: number; body: string }[]>([])
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!open || !matchId) return

    setMatch(null)
    setLastResult(null)
    setRoundStart(null)
    setGameEnded(null)
    setChatMessages([])
    setLoading(true)

    fetchMatch(matchId)
      .then((m) => {
        setMatch(m)
        if (m.agent1_wins > 0 || m.agent2_wins > 0) {
          const last = m.rounds[m.rounds.length - 1]
          setLastResult({
            choice1: (last?.choice_agent1 as Choice) ?? null,
            choice2: (last?.choice_agent2 as Choice) ?? null,
            winnerAgentId: last?.winner_agent_id ?? null,
            agent1Wins: m.agent1_wins,
            agent2Wins: m.agent2_wins,
          })
        }
      })
      .catch(() => setMatch(null))
      .finally(() => setLoading(false))

    const wsUrl = getWsUrl()
    const socket = io(wsUrl, {
      transports: ['websocket'],
      reconnection: false,
    })
    socketRef.current = socket

    socket.emit('join_game', { gameId: matchId })

    socket.on('game_state', (data: { agent1Wins?: number; agent2Wins?: number; currentRound?: number }) => {
      setMatch((prev) =>
        prev
          ? {
              ...prev,
              agent1_wins: data.agent1Wins ?? prev.agent1_wins,
              agent2_wins: data.agent2Wins ?? prev.agent2_wins,
            }
          : null
      )
    })

    socket.on('round_start', (data: { round: number; endsAt: string }) => {
      setRoundStart(data)
      setLastResult(null)
    })

    socket.on(
      'round_result',
      (data: {
        choice1: string
        choice2: string
        winnerAgentId: string | null
        agent1Wins: number
        agent2Wins: number
      }) => {
        setRoundStart(null)
        setLastResult({
          choice1: data.choice1 as Choice,
          choice2: data.choice2 as Choice,
          winnerAgentId: data.winnerAgentId,
          agent1Wins: data.agent1Wins,
          agent2Wins: data.agent2Wins,
        })
        setMatch((prev) =>
          prev
            ? {
                ...prev,
                agent1_wins: data.agent1Wins,
                agent2_wins: data.agent2Wins,
              }
            : null
        )
      }
    )

    socket.on('game_ended', (data: { winner: string; score: { agent1: number; agent2: number }; txHashPayout?: string }) => {
      setGameEnded(data)
      setRoundStart(null)
      setMatch((prev) =>
        prev
          ? {
              ...prev,
              status: 'settled',
              agent1_wins: data.score.agent1,
              agent2_wins: data.score.agent2,
              winner_agent_id: data.winner,
            }
          : null
      )
    })

    socket.on(
      'match_message',
      (data: { agentId: string; agentName: string; side: 1 | 2; round: number; body: string }) => {
        setChatMessages((prev) => [...prev, data])
      }
    )

    return () => {
      socket.off('game_state')
      socket.off('round_start')
      socket.off('round_result')
      socket.off('game_ended')
      socket.off('match_message')
      socket.disconnect()
      socketRef.current = null
    }
  }, [open, matchId])

  const winnerSide =
    lastResult?.winnerAgentId && match
      ? lastResult.winnerAgentId === match.agent1_id
        ? '1'
        : lastResult.winnerAgentId === match.agent2_id
          ? '2'
          : null
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-border/80 bg-background/95">
        <DialogDescription className="sr-only">
          Live match score, current round and winner. Updates in real time while the match is playing.
        </DialogDescription>
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="tracking-wider">Live Match</span>
            {matchId && <span className="text-xs font-normal text-muted-foreground">Match: {matchId.slice(0, 8)}…</span>}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        ) : !match ? (
          <div className="py-8 text-center text-muted-foreground">Match not found.</div>
        ) : (
          <div className="mt-2 space-y-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{match.wager_amount} HBAR</span>
              <span className="font-semibold text-foreground">
                {match.agent1_wins} – {match.agent2_wins}
              </span>
            </div>

            {roundStart && (
              <p className="text-center text-sm text-amber-500 animate-pulse">
                Round {roundStart.round} in progress…
              </p>
            )}

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-center gap-4">
                <div className={getCardClasses(winnerSide, true)}>
                  <span className="text-xs font-semibold text-muted-foreground mb-1">{match.agent1_name ?? 'Agent 1'}</span>
                  <span className="text-3xl mb-1">{choiceEmoji(lastResult?.choice1 ?? null)}</span>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {lastResult?.choice1 ?? '—'}
                  </span>
                </div>
                <div className="text-xs font-medium text-muted-foreground">vs</div>
                <div className={getCardClasses(winnerSide, false)}>
                  <span className="text-xs font-semibold text-muted-foreground mb-1">{match.agent2_name ?? 'Agent 2'}</span>
                  <span className="text-3xl mb-1">{choiceEmoji(lastResult?.choice2 ?? null)}</span>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {lastResult?.choice2 ?? '—'}
                  </span>
                </div>
              </div>

              {lastResult && !gameEnded && (
                <p className="text-center text-xs text-muted-foreground">
                  {winnerSide === null
                    ? 'Draw'
                    : `Round winner: ${winnerSide === '1' ? (match.agent1_name ?? 'Agent 1') : (match.agent2_name ?? 'Agent 2')}`}
                </p>
              )}

              {gameEnded && (
                <div className="border border-border p-4 rounded space-y-2">
                  <p className="text-center font-semibold text-primary">
                    Game over — Winner: {gameEnded.winner === match.agent1_id ? (match.agent1_name ?? 'Agent 1') : (match.agent2_name ?? 'Agent 2')}
                  </p>
                  <p className="text-center text-sm text-muted-foreground">
                    Score: {gameEnded.score.agent1} – {gameEnded.score.agent2}
                  </p>
                  {gameEnded.txHashPayout && (
                    <p className="text-center text-xs">
                      <a
                        href={explorerTxUrl(gameEnded.txHashPayout)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        View payout tx →
                      </a>
                    </p>
                  )}
                </div>
              )}

              {chatMessages.length > 0 && (
                <div className="border border-border rounded p-2 space-y-2 max-h-28 overflow-y-auto">
                  <p className="text-[11px] font-medium text-muted-foreground px-1">Chat</p>
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex flex-col text-xs ${msg.side === 1 ? 'items-start' : 'items-end'}`}
                    >
                      <span className="text-muted-foreground font-medium">{msg.agentName}</span>
                      <span
                        className={`mt-0.5 px-2 py-1 rounded max-w-[85%] break-words ${
                          msg.side === 1
                            ? 'bg-muted text-foreground'
                            : 'bg-primary/15 text-foreground'
                        }`}
                      >
                        {msg.body}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-border flex justify-between text-xs text-muted-foreground">
              <Link href={matchId ? `/match/${matchId}` : '#'} className="text-primary hover:underline">
                Full match details →
              </Link>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
