import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'viem'
import { monadTestnet } from 'viem/chains'

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://testnet-rpc.monad.xyz'

export const wagmiConfig = getDefaultConfig({
  appName: 'MoltArena',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
  chains: [monadTestnet],
  transports: {
    [monadTestnet.id]: http(rpcUrl),
  },
  ssr: true,
})

