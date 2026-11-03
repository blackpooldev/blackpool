'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRef } from 'react'
import { WagmiProvider, createConfig, createStorage, fallback, http } from 'wagmi'
import { base, mainnet, arbitrum, bsc } from 'wagmi/chains'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'

// Robinhood Chain (Arbitrum Orbit L2, ETH gas). Not a wagmi built-in, so defined here.
// chainId 4663 verified via eth_chainId; explorer: robin.etherscan.io.
const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: 'https://robin.etherscan.io' },
  },
})

// wagmi keeps its connection state here instead of browser storage (gone when the tab closes).
const memory = new Map<string, string>()
const memoryStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => { memory.set(k, v) },
  removeItem: (k: string) => { memory.delete(k) },
}

// Create factory functions to ensure fresh instances
const createConnectors = () => {
    const list: any[] = []

    // Injected browser wallets only (MetaMask, Rabby, Coinbase Wallet, mobile in-app browsers)
    list.push(injected())

    return list
}

const createWagmiConfig = (connectors: any[]) => {
    return createConfig({
        ssr: true,
        storage: createStorage({ storage: memoryStorage }), // in memory only, never written to the browser
        chains: [robinhood, base, mainnet, arbitrum, bsc],
        connectors,
        transports: {
            [base.id]: fallback([http(process.env.NEXT_PUBLIC_BASE_RPC_URL), http()]),
            [robinhood.id]: http(),
            [mainnet.id]: http(),
            [arbitrum.id]: http(),
            [bsc.id]: http(),
        },
    })
}

export function EvmProviders({ children }: { children: React.ReactNode }) {
    // Use refs to ensure config is created once per component instance
    const configRef = useRef<ReturnType<typeof createConfig> | null>(null)
    const queryClientRef = useRef<QueryClient | null>(null)

    if (configRef.current === null) {
        const connectors = createConnectors()
        configRef.current = createWagmiConfig(connectors)
    }

    if (queryClientRef.current === null) {
        queryClientRef.current = new QueryClient()
    }

    return (
        <QueryClientProvider client={queryClientRef.current}>
            <WagmiProvider config={configRef.current}>
                {children}
            </WagmiProvider>
        </QueryClientProvider>
    )
}
