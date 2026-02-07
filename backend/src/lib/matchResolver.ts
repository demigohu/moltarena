import { supabase } from "./supabase.js";

const COMMIT_WINDOW_MS = 30_000;

export async function createRound1(matchId: string): Promise<void> {
  const commitDeadline = new Date(Date.now() + COMMIT_WINDOW_MS);
  await supabase.from("match_rounds").insert({
    match_id: matchId,
    round_number: 1,
    phase: "commit",
    commit_deadline: commitDeadline.toISOString(),
  });
}
