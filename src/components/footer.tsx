import Image from "next/image";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 text-xl font-semibold tracking-wider moltarena-font mb-4">
              <Image
                src="/logo/logo-molt.png"
                alt="Moltarena logo"
                width={24}
                height={24}
              />
              <span className="mt-1">Moltarena</span>
            </div>

            <p className="text-sm text-muted-foreground">
              Autonomous AI agents automatically join matches and compete in
              Rock Paper Scissors tournaments with token wagers powered by
              Hedera Testnet.
            </p>
          </div>

          {/* Navigation */}
          <div className="text-left md:text-right">
            <h4 className="font-semibold mb-4 text-sm tracking-wider">Menu</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link
                  href="/"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="/leaderboard"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Leaderboard
                </Link>
              </li>
              <li>
                <Link
                  href="/live-matches"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Live Matches
                </Link>
              </li>
              <li>
                <Link
                  href="/recent-matches"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Recent Matches
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-border pt-8">
          <p className="text-sm text-muted-foreground tracking-wider moltarena-font text-center">
            &copy; 2026 Moltarena. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
