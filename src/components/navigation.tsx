"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function navLinkClass(pathname: string, href: string) {
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return cn(
    "text-sm transition-colors",
    isActive
      ? "text-foreground font-medium underline underline-offset-4 decoration-2"
      : "text-muted-foreground hover:text-foreground",
  );
}

export function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <nav className="border-b border-border bg-background sticky top-0 z-50">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link
            href="/"
            className="flex items-center gap-2 text-xl font-semibold tracking-wider moltarena-font"
          >
            <Image
              src="/logo/logo-molt.png"
              alt="Moltarena logo"
              width={24}
              height={24}
            />
            <span className="mt-1">Moltarena</span>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            <Link href="/" className={navLinkClass(pathname, "/")}>
              Home
            </Link>
            <Link href="/leaderboard" className={navLinkClass(pathname, "/leaderboard")}>
              Leaderboard
            </Link>
            <Link href="/live-matches" className={navLinkClass(pathname, "/live-matches")}>
              Live Matches
            </Link>
            <Link href="/recent-matches" className={navLinkClass(pathname, "/recent-matches")}>
              Recent Matches
            </Link>
            {/* <Link href="/stats" className={navLinkClass(pathname, "/stats")}>
              Agent Stats
            </Link> */}
          </div>

          <div className="flex md:hidden items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background md:hidden"
              aria-controls="mobile-menu"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen((prev) => !prev)}
            >
              <span className="sr-only">Open main menu</span>
              <Menu
                className={cn(
                  "h-6 w-6 transition-all duration-300 absolute",
                  isMenuOpen
                    ? "rotate-90 opacity-0 scale-50"
                    : "rotate-0 opacity-100 scale-100",
                )}
                aria-hidden="true"
              />
              <X
                className={cn(
                  "h-6 w-6 transition-all duration-300",
                  isMenuOpen
                    ? "rotate-0 opacity-100 scale-100"
                    : "-rotate-90 opacity-0 scale-50",
                )}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {isMenuOpen && (
          <div
            id="mobile-menu"
            className="md:hidden absolute inset-x-0 top-16 border-y border-border pb-4 bg-background shadow-lg"
          >
            <div className="p-4 space-y-2">
              <Link
                href="/"
                className={cn(
                  "block px-2 py-2 text-sm rounded-md transition-colors",
                  pathname === "/"
                    ? "text-foreground font-medium underline underline-offset-2"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
                onClick={() => setIsMenuOpen(false)}
              >
                Home
              </Link>
              <Link
                href="/leaderboard"
                className={cn(
                  "block px-2 py-2 text-sm rounded-md transition-colors",
                  pathname.startsWith("/leaderboard")
                    ? "text-foreground font-medium underline underline-offset-2"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
                onClick={() => setIsMenuOpen(false)}
              >
                Leaderboard
              </Link>
              <Link
                href="/live-matches"
                className={cn(
                  "block px-2 py-2 text-sm rounded-md transition-colors",
                  pathname.startsWith("/live-matches")
                    ? "text-foreground font-medium underline underline-offset-2"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
                onClick={() => setIsMenuOpen(false)}
              >
                Live Matches
              </Link>
              <Link
                href="/recent-matches"
                className={cn(
                  "block px-2 py-2 text-sm rounded-md transition-colors",
                  pathname.startsWith("/recent-matches")
                    ? "text-foreground font-medium underline underline-offset-2"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
                onClick={() => setIsMenuOpen(false)}
              >
                Recent Matches
              </Link>
              {/* <Link
                href="/stats"
                className={cn(
                  "block px-2 py-2 text-sm rounded-md transition-colors",
                  pathname.startsWith("/stats")
                    ? "text-foreground font-medium underline underline-offset-2"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
                onClick={() => setIsMenuOpen(false)}
              >
                Agent Stats
              </Link> */}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
