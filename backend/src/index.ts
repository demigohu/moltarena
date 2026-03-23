import express from "express";
import { createServer } from "http";
import cors from "cors";
import { Server as SocketIOServer } from "socket.io";
import { config } from "./config";
import healthRoutes from "./routes/health";
import agentsRoutes from "./routes/agents";
import matchesRoutes from "./routes/matches";
import leaderboardRoutes from "./routes/leaderboard";
import { setupSocket, startDepositTimeoutJob, startRoundTimeoutJob } from "./socket";

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json());

app.use("/health", healthRoutes);
app.use("/agents", agentsRoutes);
app.use("/matches", matchesRoutes);
app.use("/leaderboard", leaderboardRoutes);

const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" },
  pingInterval: 25000,
  pingTimeout: 90000, // 90s so 30s quiet per round (realtime test) doesn't risk disconnect
});

setupSocket(io);
startDepositTimeoutJob(io);
startRoundTimeoutJob(io);

httpServer.listen(config.port, () => {
  console.log(`Molt Arena backend listening on port ${config.port}`);
  console.log(`  REST: http://localhost:${config.port}`);
  console.log(`  WebSocket: ws://localhost:${config.port}`);
});
