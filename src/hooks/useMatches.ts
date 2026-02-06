"use client";

import { useQuery } from "@tanstack/react-query";

export type StakeTier = "0.1" | "0.5" | "1" | "5";

export type LiveMatch = {
  matchId: string;
  status: string;
  stake: number | string;
  stakeTier?: string;
  player1: { address: string; name: string | null };
  player2: { address: string; name: string | null } | null;
  player1StakeLocked?: boolean;
  player2StakeLocked?: boolean;
  wins1: number;
  wins2: number;
  createdAt: string | number;
};

type LiveApiResponse = {
  success: boolean;
  total: number;
  matches: LiveMatch[];
};

async function fetchLiveMatches(
  stakeTier?: StakeTier | null,
  status?: string
): Promise<LiveMatch[]> {
  const params = new URLSearchParams();
  if (stakeTier) params.set("stake_tier", stakeTier);
  if (status) params.set("status", status);
  const qs = params.toString();
  const url = `/api/match/live${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  const json: LiveApiResponse = await res.json();
  if (!json?.success) throw new Error("Invalid response");
  return json.matches ?? [];
}

export function useLiveMatches(options?: {
  stakeTier?: StakeTier | null;
  status?: string;
  enabled?: boolean;
}) {
  const { stakeTier, status, enabled = true } = options ?? {};
  return useQuery({
    queryKey: ["matches", "live", stakeTier ?? "all", status ?? "default"],
    queryFn: () => fetchLiveMatches(stakeTier, status),
    enabled: enabled && typeof window !== "undefined",
    staleTime: 5000,
  });
}

export type MatchDetail = {
  matchId: string;
  status: string;
  stake: number | string;
  stakeTier?: string;
  bestOf: number;
  player1: { address: string; name: string | null };
  player2: { address: string; name: string | null };
  wins1: number;
  wins2: number;
  winner: string | null;
  player1StakeLocked?: boolean;
  player2StakeLocked?: boolean;
  onchainMatchId?: string;
  chainId?: number;
  createdAt: string;
};

export type MatchStateResponse = {
  success: boolean;
  match: MatchDetail;
  currentRoundNumber: number | null;
  rounds: Array<{
    roundNumber: number;
    phase: string;
    myCommit: string | null;
    opponentCommit: string | null;
    myMove: number | null;
    opponentMove: number | null;
    result: number | null;
    commitDeadline: string | null;
    revealDeadline: string | null;
  }>;
  actionNeeded: string | null;
  nextAction?: {
    action: string;
    message: string;
    roundNumber?: number;
    deadline?: string;
    canCommit?: boolean;
    canReveal?: boolean;
  };
  matchResult?: Record<string, unknown>;
};

async function fetchMatchState(
  matchId: string,
  address: string
): Promise<MatchStateResponse | null> {
  const res = await fetch(
    `/api/match/state?matchId=${encodeURIComponent(matchId)}&address=${encodeURIComponent(address)}`
  );
  if (!res.ok) return null;
  const json = await res.json();
  if (!json?.success) return null;
  return json;
}

export function useMatchState(matchId: string | null, address: string | null) {
  return useQuery({
    queryKey: ["match", "state", matchId, address],
    queryFn: () => fetchMatchState(matchId!, address!),
    enabled: !!matchId && !!address && typeof window !== "undefined",
    staleTime: 3000,
  });
}
