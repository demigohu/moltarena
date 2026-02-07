import { supabase } from "./supabase.js";

function parseTs(val: unknown): number | null {
  if (val == null) return null;
  const s = typeof val === "string" ? val.replace(" ", "T") : String(val);
  const ts = Date.parse(s);
  return Number.isNaN(ts) ? null : ts;
}

const REVEAL_WINDOW_MS = 30_000;
const PHASE_BUFFER_MS = 5_000;

function hasCommit(
  round: {
    commit1?: unknown;
    commit2?: unknown;
    commit1_hex?: unknown;
    commit2_hex?: unknown;
  },
  p: 1 | 2
): boolean {
  const hex = p === 1 ? round.commit1_hex : round.commit2_hex;
  const bytea = p === 1 ? round.commit1 : round.commit2;
  if (hex && typeof hex === "string" && /^0x[0-9a-fA-F]{64}$/.test(hex))
    return true;
  return !!bytea;
}

export async function reconcileRounds(matchId: string): Promise<void> {
  const now = Date.now();

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, status, player1_address, player2_address, wins1, wins2, best_of")
    .eq("id", matchId)
    .single();

  if (matchError || !match || match.status !== "in_progress") return;

  const { data: rounds, error: roundsError } = await supabase
    .from("match_rounds")
    .select(
      "id, round_number, phase, commit1, commit2, commit1_hex, commit2_hex, move1, move2, result, commit_deadline, reveal_deadline, updated_at"
    )
    .eq("match_id", matchId)
    .order("round_number", { ascending: true });

  if (roundsError || !rounds) return;

  const bestOf = match.best_of ?? 5;
  const roundNumbers = new Set(rounds.map((r) => r.round_number));

  for (let n = 1; n <= bestOf; n++) {
    if (roundNumbers.has(n)) continue;
    await supabase.from("match_rounds").upsert(
      {
        match_id: matchId,
        round_number: n,
        phase: "done",
        result: 0,
      },
      { onConflict: "match_id,round_number" }
    );
    roundNumbers.add(n);
  }

  let matchWins1 = match.wins1 ?? 0;
  let matchWins2 = match.wins2 ?? 0;

  const { data: roundsAfter } = await supabase
    .from("match_rounds")
    .select(
      "id, round_number, phase, commit1, commit2, commit1_hex, commit2_hex, move1, move2, result, commit_deadline, reveal_deadline, updated_at"
    )
    .eq("match_id", matchId)
    .order("round_number", { ascending: true });

  const sortedRounds = roundsAfter ?? rounds;

  for (const round of sortedRounds) {
    if (round.phase === "done" || round.result !== null) continue;

    let resolved = false;
    let result: number | null = null;

    const commitDeadlineTs = parseTs(round.commit_deadline);
    if (
      round.phase === "commit" &&
      commitDeadlineTs != null &&
      now > commitDeadlineTs
    ) {
      const c1 = hasCommit(round, 1);
      const c2 = hasCommit(round, 2);
      if (!c1 && !c2) result = 0;
      else if (!c1) result = -1;
      else if (!c2) result = 1;
      if (result !== null) resolved = true;
    }

    if (!resolved && round.phase === "commit") {
      const c1 = hasCommit(round, 1);
      const c2 = hasCommit(round, 2);
      if (c1 && c2) {
        const ct = parseTs(round.commit_deadline) ?? now;
        const revealStart = ct + PHASE_BUFFER_MS;
        if (now >= revealStart) {
          const revealDeadline = new Date(revealStart + REVEAL_WINDOW_MS);
          await supabase
            .from("match_rounds")
            .update({
              phase: "reveal",
              reveal_deadline:
                round.reveal_deadline ?? revealDeadline.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", round.id);
          resolved = true;
        }
      }
    }

    const revealDeadlineTs = parseTs(round.reveal_deadline);
    if (
      !resolved &&
      round.phase === "reveal" &&
      revealDeadlineTs != null &&
      now > revealDeadlineTs
    ) {
      const m1 = round.move1 != null;
      const m2 = round.move2 != null;
      if (!m1 && !m2) result = 0;
      else if (!m1) result = -1;
      else if (!m2) result = 1;
      if (result !== null) resolved = true;
    }

    if (resolved && result !== null) {
      await supabase
        .from("match_rounds")
        .update({ phase: "done", result, updated_at: new Date().toISOString() })
        .eq("id", round.id);
      if (result === 1) matchWins1++;
      else if (result === -1) matchWins2++;
    }
  }

  const { data: doneRounds } = await supabase
    .from("match_rounds")
    .select("result")
    .eq("match_id", matchId)
    .eq("phase", "done");

  let calcWins1 = 0;
  let calcWins2 = 0;
  for (const r of doneRounds ?? []) {
    if (r.result === 1) calcWins1++;
    else if (r.result === -1) calcWins2++;
  }

  if (calcWins1 !== (match.wins1 ?? 0) || calcWins2 !== (match.wins2 ?? 0)) {
    await supabase
      .from("matches")
      .update({
        wins1: calcWins1,
        wins2: calcWins2,
        updated_at: new Date().toISOString(),
      })
      .eq("id", matchId);
    matchWins1 = calcWins1;
    matchWins2 = calcWins2;
  }

  const neededWins = Math.ceil(bestOf / 2);
  const hasWinner = matchWins1 >= neededWins || matchWins2 >= neededWins;

  const { data: latestRounds } = await supabase
    .from("match_rounds")
    .select("round_number, phase, result")
    .eq("match_id", matchId)
    .order("round_number", { ascending: true });
  const latest = latestRounds ?? [];
  const actualLastDone = latest
    .filter((r) => r.phase === "done" || r.result != null)
    .reduce((max, r) => Math.max(max, r.round_number), 0);

  if (!hasWinner && actualLastDone < bestOf && actualLastDone >= 1) {
    const nextRoundNum = actualLastDone + 1;
    const { data: existing } = await supabase
      .from("match_rounds")
      .select("id")
      .eq("match_id", matchId)
      .eq("round_number", nextRoundNum)
      .single();
    if (!existing) {
      const commitDeadline = new Date(now + 30_000);
      await supabase.from("match_rounds").insert({
        match_id: matchId,
        round_number: nextRoundNum,
        phase: "commit",
        commit_deadline: commitDeadline.toISOString(),
      });
    }
  }

  const doneCount = latest.filter(
    (r) => r.phase === "done" || r.result != null
  ).length;
  const allDone = doneCount >= bestOf;

  if (matchWins1 >= neededWins || matchWins2 >= neededWins || allDone) {
    const winnerAddress =
      matchWins1 >= neededWins
        ? match.player1_address
        : matchWins2 >= neededWins
          ? match.player2_address
          : null;
    if (winnerAddress) {
      await supabase
        .from("matches")
        .update({
          status: "ready_to_settle",
          winner_address: winnerAddress,
          wins1: matchWins1,
          wins2: matchWins2,
          updated_at: new Date().toISOString(),
        })
        .eq("id", matchId);
    }
  }

  await supabase.from("match_actions").insert({
    match_id: matchId,
    player_address: "system",
    agent_name: "reconcile",
    action: "reconcile",
    payload: {
      wins1: matchWins1,
      wins2: matchWins2,
      hasWinner: matchWins1 >= neededWins || matchWins2 >= neededWins,
    },
  });
}
