// Ask the connected wallet to change network, without relying on wagmi's switchChain. wagmi waits for a
// 'chainChanged' event that some wallets never send (or send before the listener is attached), which left the
// network button stuck on "Switching...". Here every wallet call has a timeout, the wallet request itself decides the
// outcome (resolves, rejected, or no answer), and wagmi's state is synced from the wallet's real chain id afterwards.
// A wallet that switched without answering the request is detected by polling eth_chainId while we wait.
import type { Connector } from 'wagmi'

type AddChain = { chainName: string; nativeCurrency: { name: string; symbol: string; decimals: number }; rpcUrls: string[]; blockExplorerUrls: string[] }

const ADD: Record<number, AddChain> = {
  4663: { chainName: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'], blockExplorerUrls: ['https://robin.etherscan.io'] },
  8453: { chainName: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] },
  42161: { chainName: 'Arbitrum One', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://arb1.arbitrum.io/rpc'], blockExplorerUrls: ['https://arbiscan.io'] },
  56: { chainName: 'BNB Smart Chain', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: ['https://bsc-dataseed.bnbchain.org'], blockExplorerUrls: ['https://bscscan.com'] },
}

export class SwitchError extends Error {
  constructor(public kind: 'rejected' | 'timeout' | 'unsupported' | 'failed' | 'cancelled', message: string) { super(message) }
}

const NO_ANSWER = 'The wallet did not answer. Open your wallet, approve or reject the pending request, then try again.'
function timeout<T>(p: Promise<T>, ms: number, msg = NO_ANSWER): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new SwitchError('timeout', msg)), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

const codeOf = (e: any): number | undefined => e?.code ?? e?.data?.originalError?.code ?? e?.cause?.code
const errText = (e: any) => String(e?.message || e?.data?.message || '')

async function providerOf(connector: Connector | undefined): Promise<any> {
  let p: any = null
  try { p = await timeout(Promise.resolve(connector?.getProvider?.()), 5_000) } catch { /* fall back below */ }
  if (!p?.request && typeof window !== 'undefined') p = (window as any).ethereum
  if (!p?.request) throw new SwitchError('unsupported', 'No wallet connected.')
  return p
}

// signal: abort the wait (the user picked another network or clicked Cancel). The wallet prompt itself cannot be
// withdrawn, but the button stops waiting.
export async function switchWalletChain(connector: Connector | undefined, chainId: number, opts: { ms?: number; signal?: AbortSignal } = {}): Promise<void> {
  const ms = opts.ms ?? 45_000
  const provider = await providerOf(connector)
  const hex = `0x${chainId.toString(16)}`
  const current = async () => parseInt(String(await timeout(provider.request({ method: 'eth_chainId' }), 5_000)), 16)
  const sync = () => { try { (connector as any)?.onChainChanged?.(hex) } catch { /* wagmi will catch up on the next event */ } }
  if ((await current().catch(() => 0)) === chainId) { sync(); return }

  // Resolve as soon as either the request answers or the wallet is seen on the target chain.
  const request = (method: string, params: unknown[]) => new Promise<void>((resolve, reject) => {
    let done = false
    const finish = (fn: () => void) => { if (!done) { done = true; clearInterval(poll); clearTimeout(t); opts.signal?.removeEventListener('abort', onAbort); fn() } }
    const onAbort = () => finish(() => reject(new SwitchError('cancelled', 'Network switch cancelled.')))
    opts.signal?.addEventListener('abort', onAbort)
    const t = setTimeout(() => finish(() => reject(new SwitchError('timeout', NO_ANSWER))), ms)
    const poll = setInterval(async () => { if ((await current().catch(() => 0)) === chainId) finish(resolve) }, 1_500)
    Promise.resolve(provider.request({ method, params })).then(() => finish(resolve), (e: any) => finish(() => reject(e)))
  })

  try {
    await request('wallet_switchEthereumChain', [{ chainId: hex }])
  } catch (e: any) {
    if (e instanceof SwitchError) throw e
    const code = codeOf(e)
    if (code === 4001) throw new SwitchError('rejected', 'Network switch cancelled in the wallet.')
    if (code === -32002 || /already pending/i.test(errText(e))) throw new SwitchError('failed', 'Your wallet already has a request waiting. Open the wallet, approve or reject it, then try again.')
    if ((code === 4902 || /unrecognized chain|not been added|unknown chain/i.test(errText(e))) && ADD[chainId]) {
      try { await request('wallet_addEthereumChain', [{ chainId: hex, ...ADD[chainId] }]) }
      catch (e2: any) {
        if (e2 instanceof SwitchError) throw e2
        if (codeOf(e2) === 4001) throw new SwitchError('rejected', 'Adding the network was cancelled in the wallet.')
        throw new SwitchError('failed', 'The wallet could not add this network. Add it in the wallet and try again.')
      }
    } else {
      throw new SwitchError('failed', `The wallet could not switch network${errText(e) ? ` (${errText(e).slice(0, 80)})` : ''}. Switch it in the wallet and try again.`)
    }
  }
  const now = await current().catch(() => chainId)
  if (now !== chainId) throw new SwitchError('failed', 'The wallet is still on another network. Switch it in the wallet and try again.')
  sync()
}
