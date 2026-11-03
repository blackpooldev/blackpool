'use client'

import '@rainbow-me/rainbowkit/styles.css'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRef } from 'react'
import { WagmiProvider, createConfig, fallback, http } from 'wagmi'
import { base, mainnet, arbitrum, bsc } from 'wagmi/chains'
import { defineChain } from 'viem'
import { injected, walletConnect } from 'wagmi/connectors'

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

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

// Create factory functions to ensure fresh instances
const createConnectors = () => {
    const list: any[] = []

    // Always allow injected browser wallets (MetaMask, Coinbase, etc.)
    list.push(injected())

    // Add WalletConnect if configured
    if (wcProjectId) {
        try {
            list.push(walletConnect({ projectId: wcProjectId }))
        } catch (err) {
            console.warn('Could not initialize WalletConnect:', err)
        }
    }

    return list
}

const createWagmiConfig = (connectors: any[]) => {
    return createConfig({
        ssr: true,
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
                <RainbowKitProvider initialChain={robinhood} locale="en-US">
                    {children}
                </RainbowKitProvider>
            </WagmiProvider>
        </QueryClientProvider>
    )
}
