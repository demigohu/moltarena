/**
 * Test backend + on-chain escrow (full flow).
 *
 * Prerequisites:
 * - Backend running (npm run dev) with ESCROW_* dan HEDERA_RPC_URL di .env
 * - Dua wallet punya testnet HBAR di Hedera (untuk deposit)
 *
 * Env (backend/.env atau export):
 *   BASE_URL=http://localhost:4000
 *   HEDERA_RPC_URL=https://testnet.hashio.io/api
 *   ESCROW_ADDRESS=0x...
 *   AGENT1_PRIVATE_KEY=0x...   (wallet agent 1, dapat HBAR)
 *   AGENT2_PRIVATE_KEY=0x...   (wallet agent 2, dapat HBAR)
 *
 * Jalankan: node scripts/test-game-with-escrow.mjs
 * Atau:     npm run test:escrow   (jika script ditambah di package.json)
 *
 * Alur: register 2 agent (dengan wallet_address) → socket auth → join_queue
 *       → game_matched (dapat escrow_address, deposit_match_id_hex, wager_wei)
 *       → deposit HBAR ke contract (kedua wallet) → join_game → main sampai game_ended
 *       → cek payout tx di game_ended
 */

import "dotenv/config";
import { io } from "socket.io-client";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const BASE = process.env.BASE_URL || "http://localhost:4000";
const RPC_URL = process.env.HEDERA_RPC_URL;
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS;
const AGENT1_PK = process.env.AGENT1_PRIVATE_KEY;
const AGENT2_PK = process.env.AGENT2_PRIVATE_KEY;

/** Full escrow ABI (termasuk errors) agar revert ter-decode. */
const ESCROW_ABI = [
  { inputs: [], name: "AlreadyDeposited", type: "error" },
  { inputs: [], name: "InvalidAgents", type: "error" },
  { inputs: [], name: "InvalidWager", type: "error" },
  { inputs: [], name: "InvalidWinner", type: "error" },
  { inputs: [], name: "MatchEnded", type: "error" },
  { inputs: [], name: "MatchExists", type: "error" },
  { inputs: [], name: "MatchNotFound", type: "error" },
  { inputs: [], name: "NotAPlayer", type: "error" },
  { inputs: [], name: "NotBothDeposited", type: "error" },
  { inputs: [], name: "OnlyResolver", type: "error" },
  { inputs: [], name: "TransferFailed", type: "error" },
  { inputs: [], name: "WrongAmount", type: "error" },
  {
    inputs: [{ name: "matchId", type: "bytes32" }],
    name: "deposit",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
];

const chain = {
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { decimals: 18, name: "HBAR", symbol: "HBAR" },
  rpcUrls: { default: { http: [RPC_URL || "https://testnet.hashio.io/api"] } },
};

function requireEnv(name, value) {
  if (!value) {
    console.error(`Env ${name} wajib diisi untuk test escrow.`);
    console.error("Contoh di .env: AGENT1_PRIVATE_KEY=0x..., AGENT2_PRIVATE_KEY=0x..., ESCROW_ADDRESS=0x..., HEDERA_RPC_URL=...");
    process.exit(1);
  }
  return value;
}

async function register(name, walletAddress) {
  const res = await fetch(`${BASE}/agents/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, wallet_address: walletAddress || "0xTest" }),
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

/** Kirim deposit ke escrow (payable). Returns tx hash. */
async function sendDeposit(privateKeyHex, escrowAddress, matchIdHex, wagerWeiBigInt) {
  const account = privateKeyToAccount(privateKeyHex);
  const transport = http(RPC_URL);
  const client = createWalletClient({ account, chain, transport });
  return client.writeContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: "deposit",
    args: [matchIdHex],
    value: wagerWeiBigInt,
    account,
    chain,
  });
}

function getPublicClient() {
  return createPublicClient({ chain, transport: http(RPC_URL) });
}

async function main() {
  console.log("Backend:", BASE);
  console.log("Escrow:", ESCROW_ADDRESS || "(skip on-chain)");
  console.log("");

  const withEscrow = ESCROW_ADDRESS && RPC_URL && AGENT1_PK && AGENT2_PK;
  if (withEscrow) {
    requireEnv("ESCROW_ADDRESS", ESCROW_ADDRESS);
    requireEnv("AGENT1_PRIVATE_KEY", AGENT1_PK);
    requireEnv("AGENT2_PRIVATE_KEY", AGENT2_PK);
  } else {
    console.log("AGENT1_PRIVATE_KEY / AGENT2_PRIVATE_KEY / ESCROW_ADDRESS tidak lengkap → tes tanpa deposit (sama seperti test:local).");
    console.log("");
  }

  try {
    const health = await fetch(`${BASE}/health`);
    if (!health.ok) throw new Error(health.statusText);
  } catch (e) {
    console.error("Backend tidak jalan. Jalankan: npm run dev");
    throw e;
  }

  const wallet1 = withEscrow ? privateKeyToAccount(AGENT1_PK).address : "0xTest1";
  const wallet2 = withEscrow ? privateKeyToAccount(AGENT2_PK).address : "0xTest2";

  console.log("1. Register 2 agents (dengan wallet)...");
  const a1 = await register("EscrowAgent1_" + Date.now(), wallet1);
  const a2 = await register("EscrowAgent2_" + Date.now(), wallet2);
  console.log("   Agent1:", a1.agent_id, "| wallet:", wallet1);
  console.log("   Agent2:", a2.agent_id, "| wallet:", wallet2);

  console.log("2. Connect sockets & authenticate...");
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

  console.log("3. Both join_queue (wager_tier 1 = 0.1 HBAR)...");
  let gameId = null;
  let gameMatchedPayload = null;
  const gameMatched = new Promise((resolve) => {
    const onMatch = (data) => {
      gameId = data.gameId;
      gameMatchedPayload = data;
      resolve(data);
    };
    s1.on("game_matched", onMatch);
    s2.on("game_matched", onMatch);
  });

  s1.emit("join_queue", { wager_tier: 1 });
  s2.emit("join_queue", { wager_tier: 1 });

  await gameMatched;
  console.log("   game_matched, gameId:", gameId);

  if (withEscrow && gameMatchedPayload?.escrow_address && gameMatchedPayload?.deposit_match_id_hex != null) {
    const wagerWei = BigInt(gameMatchedPayload.wager_wei || "100000000000000000"); // 0.1 HBAR (18 decimals) default
    const matchIdHex = gameMatchedPayload.deposit_match_id_hex;
    console.log("4. Deposit HBAR ke escrow (kedua agent)...");
    const [tx1, tx2] = await Promise.all([
      sendDeposit(AGENT1_PK, ESCROW_ADDRESS, matchIdHex, wagerWei),
      sendDeposit(AGENT2_PK, ESCROW_ADDRESS, matchIdHex, wagerWei),
    ]);
    console.log("   Agent1 deposit tx:", tx1);
    console.log("   Agent2 deposit tx:", tx2);
    console.log("   Menunggu konfirmasi deposit on-chain...");
    const publicClient = getPublicClient();
    await Promise.all([
      publicClient.waitForTransactionReceipt({ hash: tx1 }),
      publicClient.waitForTransactionReceipt({ hash: tx2 }),
    ]);
    console.log("   Kedua deposit ter-confirm.");
    s1.emit("deposit_tx", { gameId, txHash: tx1 });
    s2.emit("deposit_tx", { gameId, txHash: tx2 });
  } else {
    console.log("4. (Skip deposit, escrow tidak dipakai atau payload tanpa escrow)");
  }

  console.log("5. Both join_game...");
  s1.emit("join_game", { gameId });
  s2.emit("join_game", { gameId });

  const waitingDeposits = new Promise((resolve) => {
    s1.on("waiting_deposits", (d) => resolve(d));
    s2.on("waiting_deposits", (d) => resolve(d));
  });

  let roundStarted = false;
  const roundStartPromise = new Promise((resolve) => {
    const onStart = () => {
      if (!roundStarted) {
        roundStarted = true;
        resolve();
      }
    };
    s1.on("round_start", onStart);
    s2.on("round_start", onStart);
  });

  await sleep(2000);
  const race = await Promise.race([
    roundStartPromise.then(() => "round_start"),
    waitingDeposits.then(() => "waiting_deposits"),
    sleep(8000).then(() => "timeout"),
  ]);

  if (race === "waiting_deposits") {
    console.log("   Backend mengirim waiting_deposits (belum kedua deposit?). Re-join_game...");
    s1.emit("join_game", { gameId });
    s2.emit("join_game", { gameId });
    await sleep(5000);
  } else if (race === "timeout") {
    console.log("   Timeout menunggu round_start.");
  }

  await sleep(500);

  const choices = ["rock", "paper", "scissors"];
  let roundCount = 0;

  return new Promise((resolve, reject) => {
    s1.on("round_start", (data) => {
      roundCount++;
      console.log("   round_start", data.round, "endsAt", data.endsAt);
    });
    s2.on("round_start", () => {});

    s1.on("round_result", (data) => {
      console.log("   round_result", data.round, data.choice1, "vs", data.choice2, "→ winner", data.winnerAgentId);
    });
    s2.on("round_result", () => {});

    const onGameEnded = (data) => {
      console.log("   game_ended winner:", data.winner, "score:", data.score);
      if (data.txHashPayout) {
        console.log("   payout tx (on-chain):", data.txHashPayout);
      }
      s1.close();
      s2.close();
      resolve();
    };
    s1.on("game_ended", onGameEnded);
    s2.on("game_ended", onGameEnded);

    s1.on("error", (e) => console.warn("socket1 error", e));
    s2.on("error", (e) => console.warn("socket2 error", e));

    const playRound = () => {
      const c1 = choices[Math.floor(Math.random() * 3)];
      const c2 = choices[Math.floor(Math.random() * 3)];
      s1.emit("throw", { choice: c1 });
      s2.emit("throw", { choice: c2 });
    };

    s1.on("round_start", () => setTimeout(playRound, 300));
    setTimeout(playRound, 1500);
  });
}

main()
  .then(() => {
    console.log("\nDone. Full flow (backend + escrow) OK.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Test failed:", err.message || err);
    process.exit(1);
  });
