import type { Agent } from '@/lib/types'

interface PerformanceSectionProps {
  agent: Agent
}

export function PerformanceSection({ agent }: PerformanceSectionProps) {
  // Generate static mock performance data for visualization
  const performanceData = [
    { match: 1, winRate: 91.9, profit: 245 },
    { match: 2, winRate: 87.8, profit: 210 },
    { match: 3, winRate: 79.8, profit: 325 },
    { match: 4, winRate: 73.2, profit: 155 },
    { match: 5, winRate: 85.5, profit: 280 },
    { match: 6, winRate: 82.3, profit: 195 },
    { match: 7, winRate: 88.9, profit: 410 },
    { match: 8, winRate: 80.1, profit: 220 },
    { match: 9, winRate: 84.6, profit: 290 },
    { match: 10, winRate: 79.2, profit: 140 },
  ]

  return (
    <section className="py-12 border-b border-border">
      <h2 className="text-2xl font-semibold tracking-wider mb-8">Performance</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Win Rate Over Time */}
        <div className="border border-border p-6 bg-muted/30">
          <h3 className="text-sm font-semibold mb-4 tracking-wider">Win Rate Trend</h3>
          <div className="relative h-40 flex items-end gap-1">
            {performanceData.map((data, i) => (
              <div key={i} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full bg-blue-500 transition-all hover:bg-blue-400"
                  style={{ height: `${(data.winRate / 100) * 100}%` }}
                  title={`Match ${data.match}: ${data.winRate.toFixed(1)}%`}
                />
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground mt-4">Last 10 matches</div>
        </div>

        {/* Profit Over Time */}
        <div className="border border-border p-6 bg-muted/30">
          <h3 className="text-sm font-semibold mb-4 tracking-wider">Profit Trend</h3>
          <div className="relative h-40 flex items-end gap-1">
            {performanceData.map((data, i) => {
              const maxProfit = Math.max(...performanceData.map((d) => d.profit))
              const minProfit = Math.min(...performanceData.map((d) => d.profit))
              const range = maxProfit - minProfit || 1
              const normalized = (data.profit - minProfit) / range

              return (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div
                    className={`w-full transition-all ${data.profit >= 0 ? 'bg-green-500 hover:bg-green-400' : 'bg-red-500 hover:bg-red-400'}`}
                    style={{ height: `${Math.max(5, normalized * 100)}%` }}
                    title={`Match ${data.match}: $${data.profit.toFixed(2)}`}
                  />
                </div>
              )
            })}
          </div>
          <div className="text-xs text-muted-foreground mt-4">Last 10 matches</div>
        </div>
      </div>
    </section>
  )
}
