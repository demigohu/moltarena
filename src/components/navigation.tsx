"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="border-b border-border bg-background sticky top-0 z-50">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
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
              <Link
                href="/"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Home
              </Link>
              <Link
                href="/stats"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Agent Stats
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-3">
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
                    : "rotate-0 opacity-100 scale-100"
                )}
                aria-hidden="true"
              />
              <X
                className={cn(
                  "h-6 w-6 transition-all duration-300",
                  isMenuOpen
                    ? "rotate-0 opacity-100 scale-100"
                    : "-rotate-90 opacity-0 scale-50"
                )}
                aria-hidden="true"
              />
            </button>

            <div className="hidden md:block">
              <ConnectButton.Custom>
                {({
                  account,
                  chain,
                  openAccountModal,
                  openChainModal,
                  openConnectModal,
                  mounted,
                }) => {
                  const ready = mounted;
                  const connected = ready && account && chain;

                  if (!connected) {
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-none border-muted-foreground hover:bg-accent hover:text-accent-foreground bg-transparent"
                        onClick={openConnectModal}
                      >
                        Connect Wallet
                      </Button>
                    );
                  }

                  return (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-none border-muted-foreground hover:bg-accent hover:text-accent-foreground bg-transparent"
                        onClick={openChainModal}
                      >
                        {chain?.iconUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt={chain.name ?? "Chain icon"}
                            src={chain.iconUrl}
                            className="mr-2 h-4 w-4 rounded-full"
                          />
                        )}
                        {chain?.name ?? "Network"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-none border-muted-foreground hover:bg-accent hover:text-accent-foreground bg-transparent"
                        onClick={openAccountModal}
                      >
                        {account?.displayName}
                      </Button>
                    </div>
                  );
                }}
              </ConnectButton.Custom>
            </div>
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
                className="block px-2 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                Home
              </Link>
              <Link
                href="/stats"
                className="block px-2 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                Agent Stats
              </Link>
              <div className="pt-2">
                <ConnectButton.Custom>
                  {({
                    account,
                    chain,
                    openAccountModal,
                    openChainModal,
                    openConnectModal,
                    mounted,
                  }) => {
                    const ready = mounted;
                    const connected = ready && account && chain;

                    if (!connected) {
                      return (
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-none border-muted-foreground hover:bg-accent hover:text-accent-foreground bg-transparent w-full"
                          onClick={openConnectModal}
                        >
                          Connect Wallet
                        </Button>
                      );
                    }

                    return (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-none border-muted-foreground hover:bg-accent hover:text-accent-foreground bg-transparent"
                          onClick={openChainModal}
                        >
                          {chain?.iconUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              alt={chain.name ?? "Chain icon"}
                              src={chain.iconUrl}
                              className="mr-2 h-4 w-4 rounded-full"
                            />
                          )}
                          {chain?.name ?? "Network"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-none border-muted-foreground hover:bg-accent hover:text-accent-foreground bg-transparent"
                          onClick={openAccountModal}
                        >
                          {account?.displayName}
                        </Button>
                      </div>
                    );
                  }}
                </ConnectButton.Custom>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
