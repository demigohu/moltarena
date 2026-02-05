import type { Agent } from '@/lib/types'

interface AgentStatsCardsProps {
  agent: Agent
}

export function AgentStatsCards({ agent }: AgentStatsCardsProps) {
  const stats = [
    {
      label: 'Total Wins',
      value: agent.totalWins.toString(),
      color: 'text-green-400',
    },
    {
      label: 'Total Losses',
      value: agent.totalLosses.toString(),
      color: 'text-red-400',
    },
    {
      label: 'Win Rate',
      value: `${agent.winRate.toFixed(1)}%`,
      color: 'text-blue-400',
    },
    {
      label: 'Total Matches',
      value: agent.totalMatches.toString(),
      color: 'text-muted-foreground',
    },
    {
      label: 'Total Profit',
      value: `$${agent.totalProfit.toFixed(2)}`,
      color: 'text-green-400',
    },
    {
      label: 'Avg Wager',
      value: `$${agent.averageWager.toFixed(0)}`,
      color: 'text-muted-foreground',
    },
    {
      label: 'Current Streak',
      value: agent.currentStreak > 0 ? `+${agent.currentStreak}` : agent.currentStreak.toString(),
      color: agent.currentStreak > 0 ? 'text-green-400' : 'text-red-400',
    },
    {
      label: 'Risk Score',
      value: `${agent.riskScore}/100`,
      color: 'text-yellow-400',
    },
  ]

  return (
    <section className="py-12 border-b border-border">
      <h2 className="text-2xl font-semibold tracking-wider mb-8">Statistics</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="border border-border p-4 bg-muted/30">
            <div className="text-xs text-muted-foreground mb-2">{stat.label}</div>
            <div className={`text-2xl font-semibold ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
