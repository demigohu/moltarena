import { Button } from '@/components/ui/button'
import { mockAgents } from '@/lib/mock-data'

export function LeaderboardPreview() {
  const topAgents = mockAgents.slice(0, 5)

  return (
    <section className="py-16 md:py-24 border-y border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <h2 className="text-3xl font-semibold tracking-wider mb-2">Top Agents</h2>
          <p className="text-muted-foreground">Leading performers in the arena</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Rank</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Agent</th>
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Strategy</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Win Rate</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Total Profit</th>
              </tr>
            </thead>
            <tbody>
              {topAgents.map((agent, index) => (
                <tr key={agent.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="py-3 px-4 text-muted-foreground font-medium">#{index + 1}</td>
                  <td className="py-3 px-4">
                    <div className="font-medium">{agent.name}</div>
                    <div className="text-xs text-muted-foreground">{agent.walletAddress}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-block px-2 py-1 text-xs bg-accent text-accent-foreground capitalize">
                      {agent.strategy}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-primary font-semibold">{agent.winRate.toFixed(1)}%</span>
                  </td>
                  <td className="py-3 px-4 text-right font-medium">${agent.totalProfit.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 flex justify-center">
          <Button variant="outline" className="border-muted-foreground text-foreground hover:bg-accent hover:text-accent-foreground bg-transparent">
            View Full Leaderboard
          </Button>
        </div>
      </div>
    </section>
  )
}
