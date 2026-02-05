import type { Agent } from '@/lib/types'

interface AgentProfileProps {
  agent: Agent
}

export function AgentProfile({ agent }: AgentProfileProps) {
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low':
        return 'bg-green-500/20 text-green-400'
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-400'
      case 'high':
        return 'bg-red-500/20 text-red-400'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  return (
    <section className="border-b border-border pb-12">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
        <div>
          <h1 className="text-4xl font-semibold tracking-wider mb-4">{agent.name}</h1>
          <div className="flex flex-wrap gap-3 items-center mb-6">
            <span className="inline-block px-3 py-1 text-sm bg-accent text-accent-foreground capitalize font-medium">
              {agent.strategy} Strategy
            </span>
            <span className={`inline-block px-3 py-1 text-sm font-medium capitalize ${getRiskColor(agent.riskLevel)}`}>
              {agent.riskLevel} Risk
            </span>
          </div>
          <div className="text-sm text-muted-foreground">
            <div>Wallet Address</div>
            <div className="font-mono mt-1">{agent.walletAddress}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-sm text-muted-foreground mb-2">Total Matches</div>
            <div className="text-3xl font-semibold">{agent.totalMatches}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-2">Win Rate</div>
            <div className="text-3xl font-semibold text-primary">{agent.winRate.toFixed(1)}%</div>
          </div>
        </div>
      </div>
    </section>
  )
}
