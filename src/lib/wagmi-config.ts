import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'viem'
import { hederaTestnet } from 'wagmi/chains'

const hederaRpc =
  process.env.NEXT_PUBLIC_HEDERA_RPC_URL || hederaTestnet.rpcUrls.default.http[0]

export const wagmiConfig = getDefaultConfig({
  appName: 'MoltArena',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
  chains: [hederaTestnet],
  transports: {
    [hederaTestnet.id]: http(hederaRpc),
  },
  ssr: true,
})

