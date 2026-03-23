import type { Agent } from '@/lib/types'
import { mockMatchHistory } from '@/lib/mock-data'

interface AgentRecentMatchesProps {
  agent: Agent
}

export function AgentRecentMatches({ agent }: AgentRecentMatchesProps) {
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
            {mockMatchHistory.map((match) => (
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
    </section>
  )
}
