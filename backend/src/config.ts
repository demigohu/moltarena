import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? "4000", 10),
  supabase: {
    url: process.env.SUPABASE_URL ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  },
  escrow: {
    address: process.env.ESCROW_ADDRESS as `0x${string}` | undefined,
    /** Hedera Testnet JSON-RPC (e.g. https://testnet.hashio.io/api). */
    rpcUrl: process.env.HEDERA_RPC_URL ?? "",
    resolverPrivateKey: process.env.ESCROW_RESOLVER_PRIVATE_KEY as `0x${string}` | undefined,
  },
} as const;
