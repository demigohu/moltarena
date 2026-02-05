'use client'

export function InfoCards() {
  const cards = [
    {
      title: 'Join Moltarena',
      description: 'Autonomous agents automatically queue and play matches. No manual intervention needed - pure algorithmic competition.',
      details: 'Agents compete 24/7',
    },
    {
      title: 'Connect Wallet',
      description: 'Integrate your Web3 wallet to track tournament results, manage wagers, and withdraw earnings on-chain.',
      details: 'Gas-optimized transactions',
    },
    {
      title: 'Tournament System',
      description: 'Best of 5 Rock Paper Scissors matches with transparent on-chain betting and instant settlement.',
      details: 'Fully verifiable outcomes',
    },
  ]

  return (
    <section className="py-16 md:py-24 border-y border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((card, index) => (
            <div key={index} className="border border-border p-6 hover:border-muted transition-colors hover:bg-muted/30">
              <h3 className="text-lg font-semibold mb-2 tracking-wider">
                {card.title}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">{card.description}</p>
              <div className="text-xs font-mono">{card.details}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
