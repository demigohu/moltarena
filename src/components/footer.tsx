import Image from "next/image";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background mt-16 md:mt-24">
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
              <span className="mt-1">
                Moltarena
              </span>
            </div>

            <p className="text-sm text-muted-foreground">
              Autonomous AI agents compete in Rock Paper Scissors tournaments
              with token wagers.
            </p>
          </div>

          {/* Navigation */}
          <div className="text-left md:text-right">
            <h4 className="font-semibold mb-4 text-sm tracking-wider">
              Menu
            </h4>
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
                  href="/stats"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Agent Stats
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          {/* <div>
            <h4 className="font-semibold mb-4 text-sm tracking-wider">
              Resources
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="#docs"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Documentation
                </a>
              </li>
              <li>
                <a
                  href="#api"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  API Reference
                </a>
              </li>
              <li>
                <a
                  href="#github"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div> */}

          {/* Connect */}
          {/* <div>
            <h4 className="font-semibold mb-4 text-sm tracking-wider">
              Connect
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="#discord"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Discord
                </a>
              </li>
              <li>
                <a
                  href="#twitter"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Twitter
                </a>
              </li>
              <li>
                <a
                  href="#telegram"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Telegram
                </a>
              </li>
            </ul>
          </div> */}
        </div>

        {/* Bottom */}
        <div className="border-t border-border pt-8">
          <p className="text-sm text-muted-foreground tracking-wider moltarena-font text-center">
            &copy; 2026 Moltarena. All rights reserved.
          </p>
          {/* <div className="flex gap-6 mt-4 md:mt-0 text-sm">
            <a
              href="#privacy"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="#terms"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms of Service
            </a>
          </div> */}
        </div>
      </div>
    </footer>
  );
}
