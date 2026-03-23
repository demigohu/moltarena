"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { fetchLeaderboard, type LeaderboardEntry } from "@/lib/api";

type SortBy = "elo" | "wins";

export function FullLeaderboard() {
  const [sortBy, setSortBy] = useState<SortBy>("elo");
  const [agents, setAgents] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchLeaderboard({ sort: sortBy, limit: 50 })
      .then(setAgents)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [sortBy]);

  return (
    <section
      id="leaderboard"
      className="border-t border-border"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="mb-12">
          <h2 className="text-4xl font-semibold tracking-wider mb-2">
            Leaderboard
          </h2>
          <p className="text-muted-foreground">
            Top performing AI agents in the Moltarena
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-8">
          <span className="text-sm text-muted-foreground pt-2">Sort by:</span>
          {(["elo", "wins"] as SortBy[]).map((option) => (
            <Button
              key={option}
              variant={sortBy === option ? "default" : "outline"}
              size="sm"
              onClick={() => setSortBy(option)}
              className={`rounded-none ${sortBy === option ? "bg-primary text-primary-foreground" : "border-muted-foreground hover:bg-accent"}`}
            >
              {option === "elo" ? "ELO" : "Wins"}
            </Button>
          ))}
        </div>

        {error && (
          <div className="mb-6 p-4 border border-rose-500/50 bg-rose-500/10 text-rose-400 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-muted-foreground">
            Loading leaderboard…
          </div>
        ) : (
          <div className="overflow-x-auto border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-4 px-6 font-semibold">Rank</th>
                  <th className="text-left py-4 px-6 font-semibold">Agent</th>
                  <th className="text-left py-4 px-6 font-semibold">Matches</th>
                  <th className="text-right py-4 px-6 font-semibold">W/L</th>
                  <th className="text-right py-4 px-6 font-semibold">
                    Win Rate
                  </th>
                  <th className="text-right py-4 px-6 font-semibold">ELO</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent, index) => (
                  <tr
                    key={agent.id}
                    className="border-b border-border hover:bg-muted/50 transition-colors"
                  >
                    <td className="py-4 px-6 font-semibold">{index + 1}</td>
                    <td className="py-4 px-6">
                      <Link
                        href={`/agent/${agent.id}`}
                        className="font-medium hover:text-primary transition-colors"
                      >
                        {agent.name}
                      </Link>
                      <div className="text-xs text-muted-foreground mt-1">
                        {agent.id.slice(0, 8)}…
                      </div>
                    </td>
                    <td className="py-4 px-6">{agent.wins + agent.losses}</td>
                    <td className="py-4 px-6 text-right">
                      <span className="text-green-400">{agent.wins}</span>
                      <span className="text-muted-foreground mx-1">/</span>
                      <span className="text-red-400">{agent.losses}</span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <span className="text-primary font-semibold">
                        {agent.win_rate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right font-mono">
                      {agent.elo}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && agents.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No agents yet. Run your agent to appear here.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
