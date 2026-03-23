/**
 * Test in-match chat (bluffing) — realtime WITH on-chain deposit.
 *
 * Env (di backend/.env atau export): BASE_URL, HEDERA_RPC_URL, ESCROW_ADDRESS,
 *   AGENT1_PRIVATE_KEY, AGENT2_PRIVATE_KEY.
 * Optional: ROUND_DELAY_SECONDS=5 (detik tunggu per round sebelum throw; default 5).
 *
 * Usage: npm run test:chat
 * (Backend: npm run dev di terminal lain)
 *
 * Flow: register 2 agents → connect → authenticate → join_queue → game_matched
 *       → deposit HBAR ke escrow (kedua) → deposit_tx → join_game
 *       → round_start → chat (bluff) → throw → round_result → … → game_ended
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

const ROUND_DELAY_SECONDS = parseInt(process.env.ROUND_DELAY_SECONDS || "5", 10);

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
  {
    inputs: [{ internalType: "bytes32", name: "matchId", type: "bytes32" }],
    name: "matches",
    outputs: [
      { internalType: "address", name: "agent1", type: "address" },
      { internalType: "address", name: "agent2", type: "address" },
      { internalType: "uint256", name: "wagerAmount", type: "uint256" },
      { internalType: "bool", name: "deposit1", type: "bool" },
      { internalType: "bool", name: "deposit2", type: "bool" },
      { internalType: "bool", name: "resolved", type: "bool" },
      { internalType: "bool", name: "cancelled", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
];

const chain = {
  id: 296,
  name: "Hedera Testnet",
  nativeCurrency: { decimals: 18, name: "HBAR", symbol: "HBAR" },
  rpcUrls: { default: { http: [RPC_URL || "https://testnet.hashio.io/api"] } },
};

const HEDERA_WEIBAR_PER_TINYBAR = 10n ** 10n;
const MAX_WAGER_TINYBAR_SANE = 6n * 10n ** 8n;

function requireEnv(name, value) {
  if (!value) {
    console.error(`Env ${name} wajib untuk test chat on-chain.`);
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

async function sendDeposit(privateKeyHex, escrowAddress, matchIdHex, txValueWeibar) {
  const account = privateKeyToAccount(privateKeyHex);
  const transport = http(RPC_URL);
  const client = createWalletClient({ account, chain, transport });
  const hash = await client.writeContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: "deposit",
    args: [matchIdHex],
    value: txValueWeibar,
    account,
    chain,
  });
  return hash;
}

function getPublicClient() {
  return createPublicClient({ chain, transport: http(RPC_URL) });
}

async function resolveHederaDepositTxValue(publicClient, escrowAddress, matchIdHex, payloadWagerWei) {
  const row = await publicClient.readContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: "matches",
    args: [matchIdHex],
  });
  const agent1 = row[0];
  const tinybar = row[2];
  if (agent1 === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      "Match tidak ada di escrow ini. Samakan ESCROW_ADDRESS + HEDERA_RPC_URL di .env test dengan server API; pastikan createMatch resolver sukses."
    );
  }
  if (tinybar > MAX_WAGER_TINYBAR_SANE) {
    throw new Error(
      "matches.wagerAmount on-chain terlalu besar untuk tinybar (8 desimal). Data lama dari parseUnits(...,18)? Restart backend terbaru dan buat match baru."
    );
  }
  const txValue = tinybar * HEDERA_WEIBAR_PER_TINYBAR;
  let fromPayload = null;
  try {
    if (payloadWagerWei != null && String(payloadWagerWei).length > 0) {
      fromPayload = BigInt(String(payloadWagerWei).split(".")[0]);
    }
  } catch {
    /* ignore */
  }
  if (fromPayload != null && fromPayload !== txValue) {
    console.warn("wager_wei socket != tinybar*1e10 dari kontrak; memakai kontrak:", {
      socket: fromPayload.toString(),
      computedTxValue: txValue.toString(),
      tinybar: tinybar.toString(),
    });
  }
  return txValue;
}

async function main() {
  console.log("Backend:", BASE);
  console.log("Test: in-match chat (bluff) + on-chain deposit.");
  console.log("Round delay:", ROUND_DELAY_SECONDS, "s per round.\n");

  requireEnv("HEDERA_RPC_URL", RPC_URL);
  requireEnv("ESCROW_ADDRESS", ESCROW_ADDRESS);
  requireEnv("AGENT1_PRIVATE_KEY", AGENT1_PK);
  requireEnv("AGENT2_PRIVATE_KEY", AGENT2_PK);

  const health = await fetch(`${BASE}/health`);
  if (!health.ok) throw new Error("Backend tidak jalan. Jalankan: npm run dev");

  const wallet1 = privateKeyToAccount(AGENT1_PK).address;
  const wallet2 = privateKeyToAccount(AGENT2_PK).address;

  console.log("1. Register 2 agents...");
  const a1 = await register("Bluffer1_" + Date.now(), wallet1);
  const a2 = await register("Bluffer2_" + Date.now(), wallet2);
  console.log("   Agent1:", a1.agent_id.slice(0, 8), "| Agent2:", a2.agent_id.slice(0, 8));

  console.log("2. Connect & authenticate...");
  const s1 = connectSocket();
  const s2 = connectSocket();
  const p1 = new Promise((resolve, reject) => {
    s1.on("authenticated", resolve);
    s1.on("auth_error", reject);
  });
  const p2 = new Promise((resolve, reject) => {
    s2.on("authenticated", resolve);
    s2.on("auth_error", reject);
  });
  s1.emit("authenticate", { apiKey: a1.api_key });
  s2.emit("authenticate", { apiKey: a2.api_key });
  await Promise.all([p1, p2]);
  console.log("   OK.");

  console.log("3. join_queue (wager_tier 1)...");
  let gameId = null;
  let gameMatchedPayload = null;
  const gameMatched = new Promise((resolve) => {
    const onMatch = (d) => {
      gameId = d.gameId;
      gameMatchedPayload = d;
      resolve(d);
    };
    s1.on("game_matched", onMatch);
    s2.on("game_matched", onMatch);
  });
  s1.emit("join_queue", { wager_tier: 1 });
  s2.emit("join_queue", { wager_tier: 1 });
  await gameMatched;
  console.log("   game_matched, gameId:", gameId?.slice(0, 8) + "…");

  const matchIdHex = gameMatchedPayload?.deposit_match_id_hex;
  if (!matchIdHex) throw new Error("game_matched missing deposit_match_id_hex");
  const publicClientForWager = getPublicClient();
  const depositTxValue = await resolveHederaDepositTxValue(
    publicClientForWager,
    ESCROW_ADDRESS,
    matchIdHex,
    gameMatchedPayload?.wager_wei
  );
  console.log("   deposit tx `value` (JSON-RPC weibar) =", depositTxValue.toString());

  console.log("4. Deposit HBAR ke escrow...");
  const [tx1, tx2] = await Promise.all([
    sendDeposit(AGENT1_PK, ESCROW_ADDRESS, matchIdHex, depositTxValue),
    sendDeposit(AGENT2_PK, ESCROW_ADDRESS, matchIdHex, depositTxValue),
  ]);
  console.log("   Agent1 tx:", tx1);
  console.log("   Agent2 tx:", tx2);
  console.log("   Menunggu konfirmasi...");
  const publicClient = getPublicClient();
  await Promise.all([
    publicClient.waitForTransactionReceipt({ hash: tx1 }),
    publicClient.waitForTransactionReceipt({ hash: tx2 }),
  ]);
  console.log("   Kedua deposit ter-confirm.");
  s1.emit("deposit_tx", { gameId, txHash: tx1 });
  s2.emit("deposit_tx", { gameId, txHash: tx2 });

  function reAuthAndJoin(socket, apiKey, gid) {
    if (!gid) return;
    socket.emit("authenticate", { apiKey });
    socket.once("authenticated", () => {
      socket.emit("join_game", { gameId: gid });
    });
  }
  s1.on("connect", () => reAuthAndJoin(s1, a1.api_key, gameId));
  s2.on("connect", () => reAuthAndJoin(s2, a2.api_key, gameId));

  console.log("5. join_game (tunggu round_start atau waiting_deposits)...");
  s1.emit("join_game", { gameId });
  s2.emit("join_game", { gameId });

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
  const waitingDepositsPromise = new Promise((resolve) => {
    s1.on("waiting_deposits", (d) => resolve(d));
    s2.on("waiting_deposits", (d) => resolve(d));
  });

  const first = await Promise.race([
    roundStartPromise.then(() => "round_start"),
    waitingDepositsPromise.then(() => "waiting_deposits"),
    sleep(15000).then(() => "timeout"),
  ]);

  if (first === "waiting_deposits") {
    console.log("   waiting_deposits. Re-join_game setiap 5s...");
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      await sleep(5000);
      s1.emit("join_game", { gameId });
      s2.emit("join_game", { gameId });
      const next = await Promise.race([
        roundStartPromise.then(() => "round_start"),
        sleep(8000).then(() => null),
      ]);
      if (next === "round_start") break;
    }
    if (!roundStarted) {
      console.error("   Timeout: round_start tidak diterima.");
      process.exit(1);
    }
  } else if (first === "timeout") {
    console.error("   Timeout 15s.");
    process.exit(1);
  }

  console.log("   round_start diterima. Main + chat (bluff) dimulai.\n");

  const choices = ["rock", "paper", "scissors"];
  const bluffs = [
    ["I'm going rock!", "paper"],
    ["Paper for sure.", "scissors"],
    ["Scissors this round.", "rock"],
    ["Rock again!", "paper"],
    ["Bet you expect paper.", "scissors"],
  ];
  const roundDelayMs = ROUND_DELAY_SECONDS * 1000;

  return new Promise((resolve, reject) => {
    let roundCount = 1; // first round already started before we attached listeners

    s1.on("round_start", (data) => {
      roundCount++;
      console.log("   round_start", data.round, "| tunggu", ROUND_DELAY_SECONDS, "s...");
    });
    s2.on("round_start", () => {});

    s1.on("match_message", (data) => {
      console.log("   [chat] Agent", data.side, `"${data.agentName}":`, data.body);
    });
    s2.on("match_message", (data) => {
      console.log("   [chat] Agent", data.side, `"${data.agentName}":`, data.body);
    });

    s1.on("round_result", (data) => {
      console.log(
        "   round_result",
        data.round,
        data.choice1,
        "vs",
        data.choice2,
        "→ winner",
        data.winnerAgentId ?? "draw"
      );
    });
    s2.on("round_result", () => {});

    s1.on("game_ended", (data) => {
      console.log("\n   game_ended winner:", data.winner?.slice(0, 8), "score:", data.score);
      if (data.txHashPayout) console.log("   payout tx:", data.txHashPayout);
      s1.close();
      s2.close();
      resolve();
    });
    s2.on("game_ended", () => {});

    s1.on("error", (e) => console.warn("   s1 error", e?.error));
    s2.on("error", (e) => console.warn("   s2 error", e?.error));

    const playRound = async () => {
      const idx = (roundCount - 1) % bluffs.length;
      const [bluff1, throw1] = bluffs[idx];
      const c2 = choices[Math.floor(Math.random() * 3)];

      await sleep(300);
      s1.emit("chat", { body: bluff1 });
      await sleep(200);
      s2.emit("chat", { body: `Round ${roundCount} — bring it!` });
      await sleep(400);
      s1.emit("throw", { choice: throw1 });
      s2.emit("throw", { choice: c2 });
    };

    s1.on("round_start", () => setTimeout(() => playRound(), roundDelayMs));
    setTimeout(() => playRound(), roundDelayMs);
  });
}

main()
  .then(() => {
    console.log("\nDone. Chat (bluff) + on-chain flow OK.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Test failed:", err.message || err);
    process.exit(1);
  });
