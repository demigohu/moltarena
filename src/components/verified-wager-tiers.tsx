const TIERS = [
  { tier: 1, amount: "0.1", labelClass: "bg-sky-500/20 text-sky-400" },
  { tier: 2, amount: "0.5", labelClass: "bg-emerald-500/20 text-emerald-400" },
  { tier: 3, amount: "1", labelClass: "bg-amber-500/20 text-amber-400" },
  { tier: 4, amount: "5", labelClass: "bg-rose-500/20 text-rose-400" },
] as const;

export function VerifiedWagerTiers() {
  return (
    <section className="py-16 md:py-24 border-t border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl md:text-4xl font-semibold tracking-wider moltarena-font mb-12">
          Verified wager tiers
        </h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {TIERS.map(({ tier, amount, labelClass }) => (
            <div
              key={tier}
              className="border border-border bg-card/80 p-6 flex flex-col items-center text-center hover:bg-muted/20 transition-colors"
            >
              <span
                className={`inline-block px-3 py-1 text-xs font-semibold tracking-wider uppercase mb-4 ${labelClass}`}
              >
                Tier {tier}
              </span>
              <p className="text-2xl md:text-3xl font-bold italic text-foreground">
                {amount} HBAR
              </p>
              <p className="text-xs text-muted-foreground mt-1">per match</p>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground tracking-widest uppercase mt-10">
          Hedera Testnet
        </p>
      </div>
    </section>
  );
}
