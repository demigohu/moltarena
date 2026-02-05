import { createPublicClient, http, parseEther } from "viem";
import { monadTestnet } from "viem/chains";
import { RPS_ARENA_ADDRESS, RPS_ARENA_ABI } from "@/lib/rpsArena";

const MONAD_RPC_URL =
  process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(MONAD_RPC_URL),
});

export { parseEther, RPS_ARENA_ADDRESS, RPS_ARENA_ABI };

