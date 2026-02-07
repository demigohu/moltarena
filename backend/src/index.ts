import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { requireAuth } from "./lib/auth.js";
import { getMatchState } from "./rest/state.js";
import { setupSocketHandlers } from "./socket/handlers.js";

const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: true },
  pingTimeout: 60000,
  pingInterval: 25000,
});

setupSocketHandlers(io);

app.get("/api/match/state", async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
    return res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "Missing Authorization: Bearer <apiKey>",
    });
  }
  const token = auth.slice("bearer ".length).trim();
  const valid = await requireAuth(token);
  if (!valid) {
    return res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "Invalid API key",
    });
  }
  next();
}, getMatchState);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "moltarena-backend" });
});

httpServer.listen(PORT, () => {
  console.log(`MoltArena backend listening on http://localhost:${PORT}`);
  console.log(`Socket.io ready. REST /api/match/state available for fallback.`);
});
