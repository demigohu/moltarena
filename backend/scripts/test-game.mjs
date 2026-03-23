/**
 * Test backend lokal: simulasikan 2 agent dari sini.
 * Pastikan backend jalan (npm run dev), lalu: npm run test:local
 *
 * Alur: register 2 agent → 2 socket connect → authenticate → join_queue (tier 1)
 *       → game_matched → join_game (kedua) → throw bergantian sampai game_ended.
 */

import { io } from "socket.io-client";

const BASE = process.env.BASE_URL || "http://localhost:4000";

async function register(name) {
  const res = await fetch(`${BASE}/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, wallet_address: "0xTest" }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function connectSocket() {
  return io(BASE, { transports: ["websocket"] });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("Cek backend di", BASE, "...");
  try {
    const health = await fetch(`${BASE}/health`);
    if (!health.ok) throw new Error(health.statusText);
  } catch (e) {
    console.error("\nBackend tidak jalan atau tidak bisa diakses.");
    console.error("Jalankan dulu di terminal lain:  npm run dev");
    console.error("Lalu pastikan .env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) sudah diisi.\n");
    throw e;
  }

  console.log("1. Register 2 agents...");
  const a1 = await register("TestAgent1_" + Date.now());
  const a2 = await register("TestAgent2_" + Date.now());
  console.log("   Agent1:", a1.agent_id, "| Agent2:", a2.agent_id);

  console.log("2. Connect 2 sockets & authenticate...");
  const s1 = connectSocket();
  const s2 = connectSocket();

  const p1 = new Promise((resolve, reject) => {
    s1.on("authenticated", (d) => resolve(d));
    s1.on("auth_error", (e) => reject(e));
  });
  const p2 = new Promise((resolve, reject) => {
    s2.on("authenticated", (d) => resolve(d));
    s2.on("auth_error", (e) => reject(e));
  });

  s1.emit("authenticate", { apiKey: a1.api_key });
  s2.emit("authenticate", { apiKey: a2.api_key });
  await Promise.all([p1, p2]);
  console.log("   Both authenticated.");

  console.log("3. Both join_queue (wager_tier 1)...");
  let gameId = null;
  const gameMatched = new Promise((resolve) => {
    const onMatch = (data) => {
      gameId = data.gameId;
      resolve(data);
    };
    s1.on("game_matched", onMatch);
    s2.on("game_matched", onMatch);
  });

  s1.emit("join_queue", { wager_tier: 1 });
  s2.emit("join_queue", { wager_tier: 1 });

  await gameMatched;
  console.log("   game_matched, gameId:", gameId);

  console.log("4. Both join_game...");
  s1.emit("join_game", { gameId });
  s2.emit("join_game", { gameId });
  await sleep(500);

  const choices = ["rock", "paper", "scissors"];
  let roundCount = 0;

  return new Promise((resolve, reject) => {
    const onRoundStart = (data) => {
      roundCount++;
      console.log("   round_start", data.round, "endsAt", data.endsAt);
    };
    const onRoundResult = (data) => {
      console.log("   round_result", data.round, data.choice1, "vs", data.choice2, "→ winner", data.winnerAgentId);
    };
    const onGameEnded = (data) => {
      console.log("   game_ended winner:", data.winner, "score:", data.score);
      s1.close();
      s2.close();
      resolve();
    };

    s1.on("round_start", onRoundStart);
    s2.on("round_start", onRoundStart);
    s1.on("round_result", onRoundResult);
    s2.on("round_result", onRoundResult);
    s1.on("game_ended", onGameEnded);
    s2.on("game_ended", onGameEnded);

    const playRound = () => {
      const c1 = choices[Math.floor(Math.random() * 3)];
      const c2 = choices[Math.floor(Math.random() * 3)];
      s1.emit("throw", { choice: c1 });
      s2.emit("throw", { choice: c2 });
    };

    s1.on("round_start", () => setTimeout(playRound, 200));
    s2.on("round_start", () => {});
  });
}

main()
  .then(() => {
    console.log("Done. Backend flow OK.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Test failed:", err.message || err);
    process.exit(1);
  });
