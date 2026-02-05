import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'viem'
import { mainnet } from 'wagmi/chains'

export const wagmiConfig = getDefaultConfig({
  appName: 'MoltArena',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
  chains: [mainnet],
  transports: {
    [mainnet.id]: http(),
  },
  ssr: true,
})

