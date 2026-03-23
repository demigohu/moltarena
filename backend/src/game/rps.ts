import type { RpsChoice } from "./constants";

/**
 * Resolve one RPS round. Returns winner agent id or null for draw.
 */
export function resolveRound(
  choice1: RpsChoice | null,
  choice2: RpsChoice | null,
  agent1Id: string,
  agent2Id: string
): string | null {
  if (!choice1 || !choice2) return null;
  if (choice1 === choice2) return null;

  const beats: Record<RpsChoice, RpsChoice> = {
    rock: "scissors",
    paper: "rock",
    scissors: "paper",
  };

  if (beats[choice1] === choice2) return agent1Id;
  if (beats[choice2] === choice1) return agent2Id;
  return null;
}
