// Ask the connected wallet to change network, without relying on wagmi's switchChain. wagmi waits for a
// 'chainChanged' event that some wallets never send (or send before the listener is attached), which left the
// network button stuck on "Switching...". Here the wallet request itself decides the outcome: it resolves, the
// user rejects it, or it times out, and wagmi's state is synced from the wallet's real chain id afterwards.
import type { Connector } from 'wagmi'

type AddChain = { chainName: string; nativeCurrency: { name: string; symbol: string; decimals: number }; rpcUrls: string[]; blockExplorerUrls: string[] }

const ADD: Record<number, AddChain> = {
  4663: { chainName: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'], blockExplorerUrls: ['https://robin.etherscan.io'] },
  8453: { chainName: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] },
  42161: { chainName: 'Arbitrum One', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://arb1.arbitrum.io/rpc'], blockExplorerUrls: ['https://arbiscan.io'] },
  56: { chainName: 'BNB Smart Chain', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: ['https://bsc-dataseed.bnbchain.org'], blockExplorerUrls: ['https://bscscan.com'] },
}

export class SwitchError extends Error {
  constructor(public kind: 'rejected' | 'timeout' | 'unsupported' | 'failed', message: string) { super(message) }
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new SwitchError('timeout', 'The wallet did not answer. Open your wallet and confirm the network switch.')), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

const codeOf = (e: any): number | undefined => e?.code ?? e?.data?.originalError?.code ?? e?.cause?.code

export async function switchWalletChain(connector: Connector | undefined, chainId: number, ms = 60_000): Promise<void> {
  const provider: any = await connector?.getProvider?.()
  if (!provider?.request) throw new SwitchError('unsupported', 'No wallet connected.')
  const hex = `0x${chainId.toString(16)}`
  const current = async () => parseInt(String(await provider.request({ method: 'eth_chainId' })), 16)
  if ((await current().catch(() => 0)) !== chainId) {
    try {
      await timeout(provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] }), ms)
    } catch (e: any) {
      if (e instanceof SwitchError) throw e
      const code = codeOf(e)
      if (code === 4001) throw new SwitchError('rejected', 'Network switch cancelled in the wallet.')
      if (code === 4902 && ADD[chainId]) {
        // the wallet does not know this chain yet: add it (the wallet switches to it as part of adding)
        try { await timeout(provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: hex, ...ADD[chainId] }] }), ms) }
        catch (e2: any) {
          if (e2 instanceof SwitchError) throw e2
          if (codeOf(e2) === 4001) throw new SwitchError('rejected', 'Adding the network was cancelled in the wallet.')
          throw new SwitchError('failed', 'The wallet could not add this network. Add it in the wallet and try again.')
        }
      } else {
        throw new SwitchError('failed', 'The wallet could not switch network. Switch it in the wallet and try again.')
      }
    }
  }
  // Sync wagmi with the wallet's real chain, whether or not the wallet emitted 'chainChanged'.
  const now = await current().catch(() => chainId)
  if (now !== chainId) throw new SwitchError('failed', 'The wallet is still on another network. Switch it in the wallet and try again.')
  ;(connector as any)?.onChainChanged?.(hex)
}
