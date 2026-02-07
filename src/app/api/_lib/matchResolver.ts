import { supabase } from "./supabase";

const COMMIT_WINDOW_MS = 30_000;

/** Normalize string timestamp (space→T), parse; return null if NaN. */
function parseTs(val: unknown): number | null {
  if (val == null) return null;
  const s = typeof val === "string" ? val.replace(" ", "T") : String(val);
  const ts = Date.parse(s);
  return Number.isNaN(ts) ? null : ts;
}

const REVEAL_WINDOW_MS = 30_000;
const PHASE_BUFFER_MS = 5_000;

/**
 * Auto-resolve timeout rounds using forfeit concept (no auto-win).
 * Called every time /api/match/state is polled (heartbeat-driven resolution).
 */
export async function checkAndResolveTimeouts(matchId: string): Promise<void> {
  const now = Date.now();

  // Fetch match and all rounds
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, status, player1_address, player2_address, wins1, wins2, best_of")
    .eq("id", matchId)
    .single();

  if (matchError || !match || match.status !== "in_progress") {
    return; // Only resolve for in_progress matches
  }

  const { data: rounds, error: roundsError } = await supabase
    .from("match_rounds")
    .select("id, round_number, phase, commit1, commit2, commit1_hex, commit2_hex, move1, move2, result, commit_deadline, reveal_deadline, updated_at")
    .eq("match_id", matchId)
    .order("round_number", { ascending: true });

  if (roundsError || !rounds) {
    return;
  }

  // Process each round that's not done
  for (const round of rounds) {
    if (round.phase === "done" || round.result !== null) {
      continue; // Already resolved
    }

    let resolved = false;

    // Commit → reveal: when both commits present, advance only after commit window + 5s buffer
    if (round.phase === "commit") {
      const hasCommit1 = !!(round.commit1_hex && /^0x[0-9a-fA-F]{64}$/.test(round.commit1_hex)) || !!round.commit1;
      const hasCommit2 = !!(round.commit2_hex && /^0x[0-9a-fA-F]{64}$/.test(round.commit2_hex)) || !!round.commit2;
      if (hasCommit1 && hasCommit2) {
        const commitDeadlineTs = parseTs(round.commit_deadline) ?? now;
        const revealStart = commitDeadlineTs + PHASE_BUFFER_MS;
        if (now >= revealStart) {
          const revealDeadline = new Date(revealStart + REVEAL_WINDOW_MS);
          await supabase
            .from("match_rounds")
            .update({
              phase: "reveal",
              reveal_deadline: round.reveal_deadline ?? revealDeadline.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", round.id);
          resolved = true;
        }
      }
    }

    // Commit timeout: only when deadline passed and commits missing
    const commitDeadlineTs = parseTs(round.commit_deadline);
    if (!resolved && round.phase === "commit" && commitDeadlineTs != null) {
      if (now > commitDeadlineTs) {
        const hasCommit1 = !!round.commit1;
        const hasCommit2 = !!round.commit2;

        if (!hasCommit1 && !hasCommit2) {
          // Both timeout → draw (0-0, no points)
          await supabase
            .from("match_rounds")
            .update({
              phase: "done",
              result: 0, // draw
              updated_at: new Date().toISOString(),
            })
            .eq("id", round.id);
          resolved = true;
        } else if (!hasCommit1) {
          // Player1 timeout → Player2 wins (forfeit)
          await supabase
            .from("match_rounds")
            .update({
              phase: "done",
              result: -1, // player2 wins
              updated_at: new Date().toISOString(),
            })
            .eq("id", round.id);
          await supabase
            .from("matches")
            .update({
              wins2: (match.wins2 || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", matchId);
          resolved = true;
        } else if (!hasCommit2) {
          // Player2 timeout → Player1 wins (forfeit)
          await supabase
            .from("match_rounds")
            .update({
              phase: "done",
              result: 1, // player1 wins
              updated_at: new Date().toISOString(),
            })
            .eq("id", round.id);
          await supabase
            .from("matches")
            .update({
              wins1: (match.wins1 || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", matchId);
          resolved = true;
        }
      }
    }

    // Check reveal timeout
    const revealDeadlineTs = parseTs(round.reveal_deadline);
    if (!resolved && round.phase === "reveal" && revealDeadlineTs != null) {
      if (now > revealDeadlineTs) {
        const hasMove1 = round.move1 !== null && round.move1 !== undefined;
        const hasMove2 = round.move2 !== null && round.move2 !== undefined;

        if (!hasMove1 && !hasMove2) {
          // Both timeout → draw
          await supabase
            .from("match_rounds")
            .update({
              phase: "done",
              result: 0, // draw
              updated_at: new Date().toISOString(),
            })
            .eq("id", round.id);
        } else if (!hasMove1) {
          // Player1 timeout → Player2 wins (forfeit)
          await supabase
            .from("match_rounds")
            .update({
              phase: "done",
              result: -1, // player2 wins
              updated_at: new Date().toISOString(),
            })
            .eq("id", round.id);
          await supabase
            .from("matches")
            .update({
              wins2: (match.wins2 || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", matchId);
        } else if (!hasMove2) {
          // Player2 timeout → Player1 wins (forfeit)
          await supabase
            .from("match_rounds")
            .update({
              phase: "done",
              result: 1, // player1 wins
              updated_at: new Date().toISOString(),
            })
            .eq("id", round.id);
          await supabase
            .from("matches")
            .update({
              wins1: (match.wins1 || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", matchId);
        }
      }
    }
  }

  // After a round is done: if no winner yet and round_number < best_of, create next round after 5s buffer
  const doneRounds = (rounds ?? []).filter((r) => r.phase === "done" || r.result !== null);
  const lastDone = doneRounds.length > 0
    ? doneRounds.reduce((a, b) => (a.round_number > b.round_number ? a : b))
    : null;

  if (lastDone) {
    const { data: m } = await supabase
      .from("matches")
      .select("wins1, wins2, best_of")
      .eq("id", matchId)
      .single();
    if (m) {
      const neededWins = Math.ceil(m.best_of / 2);
      const hasWinner = (m.wins1 ?? 0) >= neededWins || (m.wins2 ?? 0) >= neededWins;
      const roundDoneAt = parseTs(lastDone.updated_at) ?? now;
      const bufferPassed = now >= roundDoneAt + PHASE_BUFFER_MS;

      if (!hasWinner && lastDone.round_number < m.best_of && bufferPassed) {
        const nextRoundNum = lastDone.round_number + 1;
        const { data: existing } = await supabase
          .from("match_rounds")
          .select("id")
          .eq("match_id", matchId)
          .eq("round_number", nextRoundNum)
          .single();
        if (!existing) {
          const commitDeadline = new Date(now + COMMIT_WINDOW_MS);
          await supabase.from("match_rounds").insert({
            match_id: matchId,
            round_number: nextRoundNum,
            phase: "commit",
            commit_deadline: commitDeadline.toISOString(),
          });
        }
      }
    }
  }

  // Check if match is finished (best-of-5: first to 3 wins)
  const { data: updatedMatch } = await supabase
    .from("matches")
    .select("wins1, wins2, best_of")
    .eq("id", matchId)
    .single();

  if (updatedMatch) {
    const neededWins = Math.ceil(updatedMatch.best_of / 2);
    if (
      (updatedMatch.wins1 || 0) >= neededWins ||
      (updatedMatch.wins2 || 0) >= neededWins
    ) {
      const winnerAddress =
        (updatedMatch.wins1 || 0) >= neededWins
          ? match.player1_address
          : match.player2_address;
      // Transition to ready_to_settle (need sigs before settleMatch → finished)
      await supabase
        .from("matches")
        .update({
          status: "ready_to_settle",
          winner_address: winnerAddress,
          updated_at: new Date().toISOString(),
        })
        .eq("id", matchId);
    }
  }
}

/**
 * Create round 1 for a match after both players have staked.
 */
export async function createRound1(matchId: string): Promise<void> {
  const commitDeadline = new Date(Date.now() + COMMIT_WINDOW_MS);

  await supabase.from("match_rounds").insert({
    match_id: matchId,
    round_number: 1,
    phase: "commit",
    commit_deadline: commitDeadline.toISOString(),
  });
}
