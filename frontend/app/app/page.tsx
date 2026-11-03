'use client';
import { ethers } from 'ethers';
import { useEffect, useState, useRef } from "react";
import {
  useAccount,
  useBalance,
  useConnections,
  useDisconnect,
  useSignMessage,
  useReadContract,
  useWalletClient
} from 'wagmi';
import { erc20Abi, formatUnits } from 'viem';
import { base } from 'wagmi/chains';
import { EvmWalletSelector } from "../components/WalletSelector";
import { UserPanel } from "../components/UserPanel";
import { ChainSwitcher } from "../components/ChainSwitcher";
import { DepositModal } from "../components/DepositModal";
import { LightRays } from "../components/LightRays";
import { StepperModal, type Step } from "../components/Stepper";
import { switchWalletChain } from "../lib/walletChain";
import { BridgeWatch } from "../components/BridgeWatch";
import { TxResult, explorerHomeUrl, explorerName } from "../components/TxResult";
import { SlippageControl } from "../components/Slippage";
import { createAndRegisterBurner, listRecoverableBurners, markBurnerSwept, burnerWallet, registryAuthSigFromSignIn, type BurnerState } from "../lib/burner";
import { useUsdPrice, fmtUsd } from "../lib/useUsdPrice";
import { LOCAL_ZK_PATHS, zkCall, zkWarm, onZkProgress } from "../lib/zkClient";

// Empty string = same-origin. /api/* is proxied by a Next.js rewrite to the backend on :4002 (see next.config.ts).
const API_URL = process.env.NEXT_PUBLIC_API_URL || ''
// SACRED: this message seeds the key derivation (keccak256(sig) -> encryptionKey -> utxoPrivateKey).
// MUST stay byte-identical to src/encryption.js SIGN_IN_MESSAGE. Changing it makes existing private balances undetectable.
const SIGN_MESSAGE = 'Welcome to Blackpool\n\nSign this message to access your private account.\n\n- Gas free: no transaction is sent\n- Your private account keys are derived from this signature\n- It cannot move funds from your wallet or approve spending\n- Only sign it on blackpool.cash or the Blackpool CLI'

// destination asset labels (1Click keys) — for the swap/bridge dropdown and quote labels.
// swap = same chain (Base). bridge = cross-chain (Ethereum/BSC/Arbitrum).
const ASSET_LABELS: Record<string, { symbol: string, chain: string, logo: string, chainLogo: string }> = {
  // Base (swap destinations)
  base_usdc:  { symbol: 'USDC',  chain: 'Base',     logo: '/token_logos/usdc.png',  chainLogo: '/token_logos/base.png' },
  base_eth:   { symbol: 'ETH',   chain: 'Base',     logo: '/token_logos/eth.png',   chainLogo: '/token_logos/base.png' },
  base_cbbtc: { symbol: 'cbBTC', chain: 'Base',     logo: '/token_logos/cbbtc.png', chainLogo: '/token_logos/base.png' },
  // Ethereum L1 (bridge)
  eth_eth:    { symbol: 'ETH',   chain: 'Ethereum', logo: '/token_logos/eth.png',   chainLogo: '/token_logos/ethereum.png' },
  eth_usdc:   { symbol: 'USDC',  chain: 'Ethereum', logo: '/token_logos/usdc.png',  chainLogo: '/token_logos/ethereum.png' },
  eth_usdt:   { symbol: 'USDT',  chain: 'Ethereum', logo: '/token_logos/usdt.png',  chainLogo: '/token_logos/ethereum.png' },
  // BSC (bridge)
  bsc_bnb:    { symbol: 'BNB',   chain: 'BSC',      logo: '/token_logos/bnb.png',   chainLogo: '/token_logos/bsc.png' },
  bsc_usdc:   { symbol: 'USDC',  chain: 'BSC',      logo: '/token_logos/usdc.png',  chainLogo: '/token_logos/bsc.png' },
  bsc_usdt:   { symbol: 'USDT',  chain: 'BSC',      logo: '/token_logos/usdt.png',  chainLogo: '/token_logos/bsc.png' },
  // Arbitrum (bridge)
  arb_eth:    { symbol: 'ETH',   chain: 'Arbitrum', logo: '/token_logos/eth.png',   chainLogo: '/token_logos/arbitrum.png' },
  arb_usdc:   { symbol: 'USDC',  chain: 'Arbitrum', logo: '/token_logos/usdc.png',  chainLogo: '/token_logos/arbitrum.png' },
  arb_usdt:   { symbol: 'USDT',  chain: 'Arbitrum', logo: '/token_logos/usdt.png',  chainLogo: '/token_logos/arbitrum.png' },
  // Solana (bridge-only destination, base58 recipient). XRP parked (1Click has no destination tag).
  sol_sol:    { symbol: 'SOL',   chain: 'Solana',   logo: '/token_logos/sol.png',   chainLogo: '/token_logos/solana.png' },
  sol_usdc:   { symbol: 'USDC',  chain: 'Solana',   logo: '/token_logos/usdc.png',  chainLogo: '/token_logos/solana.png' },
  sol_usdt:   { symbol: 'USDT',  chain: 'Solana',   logo: '/token_logos/usdt.png',  chainLogo: '/token_logos/solana.png' },
  // Robinhood (bridge via 1Click — indexed since 2026-09-18, chain id 'hood')
  hood_eth:   { symbol: 'ETH',   chain: 'Robinhood', logo: '/token_logos/eth.png',  chainLogo: '/token_logos/robinhood.png?v=2' },
  hood_usdg:  { symbol: 'USDG',  chain: 'Robinhood', logo: '/token_logos/usdg.png?v=1', chainLogo: '/token_logos/robinhood.png?v=2' },
}
// Recipient format per destination chain (EVM default). 1Click has no XRP destination tag: self-custody r-address only.
const RECIPIENT_RE: Record<string, RegExp> = { Solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, XRP: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/ }
// "0.25 USDC (Base)"-style label for a 1Click asset key; unknown keys fall back to the raw key.
const assetLabel = (k: string) => (ASSET_LABELS[k] ? `${ASSET_LABELS[k].symbol} (${ASSET_LABELS[k].chain})` : k)
const recipientValid = (toAsset: string, addr: string) => (RECIPIENT_RE[ASSET_LABELS[toAsset]?.chain || ''] || /^0x[a-fA-F0-9]{40}$/).test(addr)
const NON_EVM_DESTS = ['sol_sol', 'sol_usdc', 'sol_usdt']
// swap = same-chain destination (the origin token is excluded in the UI)
const SWAP_DESTINATIONS = ['base_usdc', 'base_eth', 'base_cbbtc']
// Every cross-chain bridge goes through NEAR Intents 1Click (Robinhood included since 2026-09-18).
// NB: eth/bsc destinations are bridge-only (no pool there); base/robinhood/arb/bsc have shielded pools.
const BRIDGE_DESTINATIONS_FROM_BASE = ['hood_eth', 'hood_usdg', 'eth_usdc', 'eth_eth', 'eth_usdt', 'bsc_usdc', 'bsc_usdt', 'bsc_bnb', 'arb_usdc', 'arb_eth', 'arb_usdt', ...NON_EVM_DESTS]
const BRIDGE_DESTINATIONS_FROM_RH = ['base_eth', 'base_usdc', 'arb_eth', 'arb_usdc', 'arb_usdt', 'eth_eth', 'eth_usdc', 'eth_usdt', 'bsc_bnb', 'bsc_usdc', 'bsc_usdt', ...NON_EVM_DESTS]
const BRIDGE_DESTINATIONS_FROM_ARB = ['base_eth', 'base_usdc', 'hood_eth', 'hood_usdg', 'eth_eth', 'eth_usdc', 'eth_usdt', 'bsc_bnb', 'bsc_usdc', 'bsc_usdt', ...NON_EVM_DESTS]
const BRIDGE_DESTINATIONS_FROM_BSC = ['base_eth', 'base_usdc', 'arb_eth', 'arb_usdc', 'arb_usdt', 'eth_eth', 'eth_usdc', 'eth_usdt', 'hood_eth', 'hood_usdg', ...NON_EVM_DESTS]
// legacy alias (Base default) kept so existing references resolve
const BRIDGE_DESTINATIONS = BRIDGE_DESTINATIONS_FROM_BASE
type Tab = 'send' | 'swap' | 'bridge'

// ===== Multi-chain registries (base + robinhood) =====
// Each pool chain exposes a native pool ('eth') and a stablecoin pool. Switching the wallet network
// swaps the whole pool set. Bridge-only chains (arb/bnb/eth L1) are not here.
type ChainKey = 'base' | 'robinhood' | 'arbitrum' | 'bsc'

// Format a decimal string (or number) to at most 3 decimal places for display (no trailing zeros).
// NEVER use for tx amounts (those need full precision). Only for user-facing labels/stepper/balance.
const fmt3 = (v: string | number): string => {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n)) return '0'
  // FLOOR to 3 decimals (never round up): this value doubles as the MAX-button fill, and rounding
  // 0.0378 up to 0.038 would make MAX exceed the real balance → deposit fails "insufficient funds".
  const floored = Math.floor(n * 1000) / 1000
  return floored.toFixed(3).replace(/\.?0+$/, '') || '0'
}
const CHAIN_POOLS: Record<ChainKey, { label: string; pools: string[]; stable: string }> = {
  base: { label: 'Base', pools: ['eth', 'usdc'], stable: 'usdc' },
  robinhood: { label: 'Robinhood', pools: ['eth', 'usdg'], stable: 'usdg' },
  arbitrum: { label: 'Arbitrum', pools: ['eth', 'usdc'], stable: 'usdc' },
  bsc: { label: 'BSC', pools: ['bnb', 'usdc', 'usdt'], stable: 'usdt' },
  // Arc (Circle L1) REMOVED: its RPC (rpc.blockdaemon.mainnet.arc.io) returns 401, and because
  // chainsToScan derives from Object.keys(CHAIN_POOLS) every burner scan hit that dead endpoint and
  // stalled. The backend dropped arc from CHAIN_DEFS for the same reason, so this keeps both sides in
  // sync. Re-add here (and in ChainKey + the backend) once an authorized Arc RPC exists.
}
// per "chain:pool" token metadata
// Minimum size for any flow that pays the withdraw fee -- send, swap and bridge all start with a
// relayer withdraw, so they share one floor instead of each carrying its own number.
//
// The fee is flatFee + 0.35%, and at flat 0.00015 ETH a 0.001 ETH withdraw pays ~15.35%. Below
// 0.001 that ratio climbs fast, and apiServer.js rejects anything where fee*2 >= amount outright
// (hard floor 0.00030211 ETH at this flat fee), so the user would hit a backend error instead of a
// clear message. Stablecoin flows keep their own larger floor -- their flat fee is denominated in
// the token, not ETH.
const MIN_TX_NATIVE = 0.001   // ETH / BNB: swap, bridge, send
const MIN_TX_STABLE = 2       // USDC / USDG / USDT

const POOL_META: Record<string, { symbol: string; logo: string; decimals: number; isNative: boolean; minDeposit: number }> = {
  // minDeposit is the floor for shielding into a pool. It exists because the withdraw fee is
  // flatFee + 0.35%, so a deposit close to the flat fee is largely consumed on the way out.
  //
  // Operator set these for a low, uniform entry point -- they are NOT derived from a fee-ratio
  // rule. Every stablecoin pool is a flat 3 units (~$3) so shielding costs the same on every
  // chain regardless of that pool's flat fee. Native pools are 0.001 ETH / 0.01 BNB.
  //
  // Fee at the floor, worth knowing before touching these (flat fees themselves are unchanged):
  //   base:usdc      flat 1 USDC   -> fee 1.0105 on a 3 deposit = ~34%
  //   other stables  flat 0.5      -> fee 0.5105 on a 3 deposit = ~17%
  //   ETH pools      flat 0.00015  -> ~15.35% at the 0.001 floor
  //   BNB pool       flat 0.001    -> ~10.35% at the 0.01 floor
  //
  // SHARP EDGE on base:usdc, accepted deliberately: its flat fee is 1 USDC while MIN_TX_STABLE is
  // 2, and the relayer refuses any withdraw where fee*2 >= amount. At a 2 USDC withdraw the fee is
  // 1.007, so fee*2 = 2.014 -- refused. A user who shields exactly 3 on Base USDC must withdraw
  // more than ~2.03 in one go, not 2. Every other stablecoin pool (flat 0.5) clears that at 2.
  // Do not "fix" this by dropping MIN_TX_STABLE below the fee*2 point.
  'base:eth': { symbol: 'ETH', logo: '/token_logos/eth.png', decimals: 18, isNative: true, minDeposit: 0.001 },
  'base:usdc': { symbol: 'USDC', logo: '/token_logos/usdc.png', decimals: 6, isNative: false, minDeposit: 3 },
  'robinhood:eth': { symbol: 'ETH', logo: '/token_logos/eth.png', decimals: 18, isNative: true, minDeposit: 0.001 },
  'robinhood:usdg': { symbol: 'USDG', logo: '/token_logos/usdg.png?v=1', decimals: 6, isNative: false, minDeposit: 3 },
  'arbitrum:eth': { symbol: 'ETH', logo: '/token_logos/eth.png', decimals: 18, isNative: true, minDeposit: 0.001 },
  'arbitrum:usdc': { symbol: 'USDC', logo: '/token_logos/usdc.png', decimals: 6, isNative: false, minDeposit: 3 },
  'bsc:bnb': { symbol: 'BNB', logo: '/token_logos/bnb.png', decimals: 18, isNative: true, minDeposit: 0.01 },
  'bsc:usdc': { symbol: 'USDC', logo: '/token_logos/usdc.png', decimals: 18, isNative: false, minDeposit: 3 },
  'bsc:usdt': { symbol: 'USDT', logo: '/token_logos/usdt.png', decimals: 18, isNative: false, minDeposit: 3 },
  // Arc: the pool holds USDC via its ERC-20 interface (6 decimals @ 0x3600..), so isNative=false and
  // decimals=6 — matching Base USDC, NOT BSC's 18-decimal stables. The 18-decimal "native" view of
  // the same USDC is only used for gas; never for pool amounts.
  // 'arc:usdc' REMOVED with the rest of the arc wiring (dead 401 RPC — see CHAIN_POOLS above).
}
// map wallet chainId -> our chain key (only pool chains); others => null (bridge-only / unsupported)
const CHAIN_ID_TO_KEY: Record<number, ChainKey> = { 8453: 'base', 4663: 'robinhood', 42161: 'arbitrum', 56: 'bsc' }
// Per-chain DEX (SwapRouter02-compatible V3) for same-chain swap. Base/Robinhood/Arbitrum use
// Uniswap V3; BSC uses PancakeSwap V3. Robinhood WETH/USDG deepest pool is fee tier 500
// (verified: 1132 WETH / 1.55M USDG); Base ETH/USDC uses tier 100; BSC WBNB/USDT uses tier 100.
const DEX: Record<ChainKey, { router: string; quoter: string; weth: string; stable: string; fee: number }> = {
  base: { router: '0x2626664c2603336E57B271c5C0b26F421741e481', quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a', weth: '0x4200000000000000000000000000000000000006', stable: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', fee: 100 },
  robinhood: { router: '0xcaf681a66d020601342297493863e78c959e5cb2', quoter: '0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7', weth: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73', stable: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', fee: 500 },
  arbitrum: { router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e', weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', stable: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', fee: 500 },
  // BSC uses PancakeSwap V3. Router = SmartRouter (SwapRouter02-compatible) at 0x13f4EA83…568Dd4.
  // The old 0x1b81D6…13eB14 address is NOT SmartRouter — it lacks the exactInputSingle selector
  // (04e45aaf) so real txs revert 0x even though eth_call to unknown selectors doesn't. Verified
  // via bytecode inspection + estimateGas: OFFICIAL executes in ~200k gas, wrong one reverts.
  // Deepest WBNB/USDT pool is fee tier 100. stable = USDT (6x deeper than USDC on BSC).
  bsc: { router: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4', quoter: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997', weth: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', stable: '0x55d398326f99059fF775485246999027B3197955', fee: 100 },
  // Arc entry REMOVED along with the rest of the arc wiring (dead 401 RPC — see CHAIN_POOLS above).
}
// Same-chain private swap needs (a) two distinct pool assets on the chain and (b) a V3 router.
// Arc fails both: USDC is simultaneously the gas token and the only pool, so a "swap" there would be
// USDC->USDC through a zero-address router. Gate the Swap tab on this instead of hardcoding chain
// checks at each call site.
const isSwapSupported = (chain: ChainKey) =>
  CHAIN_POOLS[chain].pools.length > 1 && DEX[chain].router !== '0x0000000000000000000000000000000000000000'

// Send a burner tx that tolerates "already known" / nonce-race errors: if the exact tx was already
// broadcast (RPC returns -32000 "already known", or a nonce clash), don't treat it as fatal — poll
// the burner's on-chain nonce and return once it advances (i.e. the tx mined). Mirrors the logic
// that recoverBurner already used successfully; extracted so the swap reshield path shares it.
async function sendBurnerResilient(
  bw: ethers.Wallet,
  provider: ethers.Provider,
  burnerAddr: string,
  tx: { to: string, data: string, value?: bigint, gasLimit?: bigint, maxFeePerGas?: bigint, maxPriorityFeePerGas?: bigint },
) {
  try {
    const req: { to: string, data: string, value: bigint, gasLimit?: bigint, maxFeePerGas?: bigint, maxPriorityFeePerGas?: bigint } = { to: tx.to, data: tx.data, value: tx.value || BigInt(0) }
    if (tx.gasLimit) req.gasLimit = tx.gasLimit
    if (tx.maxFeePerGas) req.maxFeePerGas = tx.maxFeePerGas
    if (tx.maxPriorityFeePerGas) req.maxPriorityFeePerGas = tx.maxPriorityFeePerGas
    const r = await bw.sendTransaction(req)
    await r.wait()
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).toLowerCase()
    if (/already known|nonce too low|replacement (transaction )?underpriced|transaction already/.test(msg)) {
      const n0 = await provider.getTransactionCount(burnerAddr, 'latest'); const t0 = Date.now()
      while (Date.now() - t0 < 120000) {
        await new Promise(r => setTimeout(r, 4000))
        if (await provider.getTransactionCount(burnerAddr, 'latest') > n0) return
      }
      return
    }
    throw e
  }
}

async function apiPost(path: string, body: Record<string, unknown>, timeoutMs = 60000) {
  // Balance, payments, deposits and swaps are proved on this device (lib/zkClient.ts -> /zk/worker.js).
  // The sign-in signature never leaves the browser: it is stripped from every request that does go out.
  if (LOCAL_ZK_PATHS.has(path)) return zkCall(path, body)
  if ('signature' in body) { const { signature: _drop, ...rest } = body; body = rest }
  // timeout so a stalled request on mobile aborts (and callers can retry) instead of hanging.
  // 60s default for slow mobile networks; proofs are built locally and never hit this timeout.
  // 429: the request was rejected before the handler ran, so waiting and resending is always safe.
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      const json = await res.json().catch(() => ({}))
      if (res.status === 429 && attempt < 4) {
        const wait = Math.min(Math.max(Number(json?.retryAfter) || 5, 1), 30)
        await new Promise(r => setTimeout(r, wait * 1000))
        continue
      }
      if (!res.ok) {
        throw new Error(json?.error || `API error ${res.status}`)
      }
      return json
    } finally {
      clearTimeout(to)
    }
  }
}

// Retry an API POST with backoff. Safe for idempotent/dry calls and for proof-prep (nothing is
// on-chain until the returned tx is broadcast). Rethrows the LAST error after `attempts` tries.
async function apiPostRetry(path: string, body: Record<string, unknown>, attempts = 4, onRetry?: (n: number) => void) {
  let lastErr: unknown
  for (let i = 1; i <= attempts; i++) {
    try { return await apiPost(path, body) }
    catch (e) {
      lastErr = e
      // a real 4xx business error (e.g. "no unspent UTXOs") shouldn't be retried forever
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase()
      if (/no unspent|insufficient|invalid|unknown pool|too small|not available/.test(msg)) throw e
      if (i === attempts) break
      onRetry?.(i)
      await new Promise(r => setTimeout(r, Math.min(2000 * i, 8000)))
    }
  }
  throw lastErr
}

async function apiGet(path: string) {
  const res = await fetch(`${API_URL}${path}`)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `API error ${res.status}`)
  return json
}

const ChevronIcon = () => (
  <div className="icon">
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12.7071 14.7071C12.3166 15.0976 11.6834 15.0976 11.2929 14.7071L6.29289 9.70711C5.90237 9.31658 5.90237 8.68342 6.29289 8.29289C6.68342 7.90237 7.31658 7.90237 7.70711 8.29289L12 12.5858L16.2929 8.29289C16.6834 7.90237 17.3166 7.90237 17.7071 8.29289C18.0976 8.68342 18.0976 9.31658 17.7071 9.70711L12.7071 14.7071Z"></path></svg>
  </div>
)

const WalletIcon = () => (
  <div className="icon">
    <svg fill="currentColor" viewBox="0 0 36 36" version="1.1"><title>wallet-line</title><path d="M32,15H31V9a1,1,0,0,0-1-1H6a1,1,0,0,1-1-.82V6.82A1,1,0,0,1,6,6H29.58a1,1,0,0,0,0-2H6A3,3,0,0,0,3,7a3.08,3.08,0,0,0,0,.36V27.93A4.1,4.1,0,0,0,7.13,32H30a1,1,0,0,0,1-1V25h1a1,1,0,0,0,1-1V16A1,1,0,0,0,32,15ZM29,30H7.13A2.11,2.11,0,0,1,5,27.93V9.88A3.11,3.11,0,0,0,6,10H29v5H22a5,5,0,0,0,0,10h7Zm2-7H22a3,3,0,0,1,0-6H31Z"></path></svg>
  </div>
)

export default function Home() {
  const [tab, setTab] = useState<Tab>('send');
  const [isUpdatingBalance, setIsUpdatingBalance] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // Local proving progress: only annotates an operation that is already showing a status line.
  useEffect(() => onZkProgress((p) => {
    if (p.stage === 'download' && typeof p.pct === 'number') setStatus((s) => (s ? `downloading proving key (first time only) ${p.pct}%` : s))
    else if (p.stage === 'prove') setStatus((s) => (s ? 'generating ZK proof on this device...' : s))
  }), [])
  const [depositTx, setDepositTx] = useState<string | null>(null);

  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawTx, setWithdrawTx] = useState<string | null>(null);
  const [withdrawChain, setWithdrawChain] = useState<string>('Base'); // chain for withdrawTx explorer link
  const [bridgeDestTx, setBridgeDestTx] = useState<{ chain: string, hash: string } | null>(null);
  const [isTrading, setIsTrading] = useState<boolean>(false);
  const [withdrawRecipient, setWithdrawRecipient] = useState<string>('');
  const [showDeposit, setShowDeposit] = useState(false);
  // Stepper modal state: steps + active step index. null = hidden.
  const [stepper, setStepper] = useState<{ steps: Step[], active: number, error: string | null, info?: string | null } | null>(null);
  // stuck-burner recovery: {pool, amount} when a prior swap left funds on a burner (reshield failed)
  const [stuckBurner, setStuckBurner] = useState<{ pool: string, raw: bigint, display: string, sym: string, chain: ChainKey, privateKey: string } | null>(null);
  const autoRecoverRef = useRef<string | null>(null); // burner address we've already auto-triggered recovery for
  // set when a burner exists but the current signature can't decrypt it (wallet gave
  // a different signature than when it was saved) — funds are on-chain but this session can't sign for them
  const [burnerSigMismatch, setBurnerSigMismatch] = useState<string | null>(null);
  const [slippage, setSlippage] = useState(100); // basis points; 100 = 1% (Smart default)

  // active chain (derived from wallet network) + origin pool within that chain's pool set.
  const [activeChain, setActiveChain] = useState<ChainKey>('robinhood')
  const [activePool, setActivePool] = useState<string>('eth')
  // resolve token meta for the current chain:pool; fall back to base:eth if a stale combo appears.
  const poolMetaKey = `${activeChain}:${activePool}`
  const meta = POOL_META[poolMetaKey] || POOL_META['base:eth']
  const poolSym = meta.symbol
  // backward-compat shim: some render code still reads poolMeta[activePool].{symbol,logo}
  const poolMeta: Record<string, { symbol: string; logo: string; decimals: number }> = Object.fromEntries(
    CHAIN_POOLS[activeChain].pools.map(p => {
      const m = POOL_META[`${activeChain}:${p}`]
      return [p, { symbol: m.symbol, logo: m.logo, decimals: m.decimals }]
    })
  )
  // same-chain swap destination = the OTHER pool on this chain. Native pool (eth/bnb) -> chain
  // stablecoin (USDC on base, USDG on robinhood, USDT on bsc); stablecoin pool -> native. Drives
  // the swap tab labels/logo. meta.isNative distinguishes the native pool generically (bnb != eth).
  const nativePool = CHAIN_POOLS[activeChain].pools[0] // native is always first (eth/bnb)
  const swapDestPool = meta.isNative ? CHAIN_POOLS[activeChain].stable : nativePool
  const swapDestMeta = POOL_META[`${activeChain}:${swapDestPool}`] || POOL_META['base:usdc']

  // Send: second recipient ("+" style, max 2 — the circuit has 2 outputs). null = single.
  const [recipient2, setRecipient2] = useState<string | null>(null)
  const [withdrawAmount2, setWithdrawAmount2] = useState('')

  // swap/bridge state
  const [swapAmount, setSwapAmount] = useState('')
  // Same-chain swap preview (Uniswap V3 quote). Destination is always the OTHER pool token
  // (ETH pool -> USDC, USDC pool -> ETH), so no `swapToAsset` picker needed. No recipient either —
  // the output re-shields back into the user's own private balance via a one-time burner.
  const [swapQuote, setSwapQuote] = useState<{ amountOut: string, timeEstimate: number, symbol: string } | null>(null)
  const [bridgeAmount, setBridgeAmount] = useState('')
  const [bridgeRecipient, setBridgeRecipient] = useState('')
  const [bridgeToAsset, setBridgeToAsset] = useState('eth_usdc') // destination chain+token
  const [bridgeQuote, setBridgeQuote] = useState<{ amountOut: string, timeEstimate: number, symbol: string } | null>(null)
  const [bridgeLimit, setBridgeLimit] = useState<string | null>(null) // route minimum from the solver network, shown under the route row
  const [bridgeUnavailable, setBridgeUnavailable] = useState(false) // solver has no route/quote for this pair right now
  const [bridgeChecking, setBridgeChecking] = useState(false)

  const { address, isConnected, connector, chainId: walletChainId } = useAccount()

  // Derive activeChain from the wallet's network. If the wallet is on a pool chain (base/robinhood),
  // follow it and reset the pool to that chain's native pool when it changes. If the wallet is on a
  // bridge-only / unsupported chain, keep the last pool chain (the ChainSwitcher shows a nudge).
  useEffect(() => {
    const key = walletChainId ? CHAIN_ID_TO_KEY[walletChainId] : undefined
    if (key && key !== activeChain) {
      setActiveChain(key)
      // reset to the new chain's native pool. Most chains have 'eth' (Base/RH/Arbitrum);
      // BSC's native pool is 'bnb'. Read from CHAIN_POOLS so this stays generic.
      setActivePool(CHAIN_POOLS[key].pools[0])
      // reset bridge destination to a valid one for the new origin chain. RH bridges only to Base
      // (reverse routers); Arbitrum bridges to Base via 1Click; Base bridges out to RH/L1/L2.
      setBridgeToAsset(key === 'base' ? 'hood_eth' : 'base_eth')
      // Arc (and any single-asset chain) has no same-chain Swap; if the user was on the Swap tab,
      // fall back to Send so they don't land on a hidden/broken tab.
      if (!isSwapSupported(key)) setTab(t => (t === 'swap' ? 'send' : t))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletChainId])

  const [storedSig, setStoredSig] = useState<string | null>(null)
  const [privateBalance, setPrivateBalance] = useState(0)
  // Exact balance string straight from the API (never round-tripped through JS Number). MAX uses this
  // so it can't overshoot the on-chain UTXO by 1 wei — Number(18-decimal-string) rounds and String()
  // it back produces e.g. ...976903 for a ...976902 UTXO, which made withdraw revert "insufficient
  // balance". privateBalance (Number) stays for display + comparisons only.
  const [privateBalanceRaw, setPrivateBalanceRaw] = useState('0')
  // Non-null = the last balance read FAILED, so privateBalance (default 0) is not trustworthy.
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [utxoCount, setUtxoCount] = useState(0)
  const [privateBalanceChanged, setPrivateBalanceChanged] = useState(0)
  const { signMessage } = useSignMessage()
  // Registry auth signature — derived locally from the sign-in signature (see lib/burner.ts), so the wallet is
  // prompted exactly once per session. Cached in memory only. The backend ecrecovers it to the
  // derived owner address but CANNOT obtain the encryption key from it (non-custodial).
  const authSigRef = useRef<string | null>(null)
  const getRegistryAuthSig = async (): Promise<string> => {
    if (authSigRef.current) return authSigRef.current
    const sig = (address ? getStoredSignature(address) : null) ?? storedSig
    if (!sig) throw new Error('sign in first')
    const s = await registryAuthSigFromSignIn(sig)
    authSigRef.current = s
    return s
  }
  // wallet balances for the deposit modal, scoped to the active chain. Native (ETH) on the active
  // chain's id, plus the active chain's stablecoin (USDC on base / USDG on robinhood).
  const activeChainId = activeChain === 'robinhood' ? 4663 : activeChain === 'arbitrum' ? 42161 : activeChain === 'bsc' ? 56 : base.id
  const activeStableToken = DEX[activeChain].stable as `0x${string}`
  const { data: balance } = useBalance({ address, chainId: activeChainId })
  const { data: stableRaw } = useReadContract({ address: activeStableToken, abi: erc20Abi, functionName: 'balanceOf', args: address ? [address] : undefined, chainId: activeChainId, query: { enabled: !!address } })
  const { data: stableDecimals } = useReadContract({ address: activeStableToken, abi: erc20Abi, functionName: 'decimals', chainId: activeChainId })
  // shown in the deposit modal: native for the eth pool, stablecoin for the non-native pool
  const depositWalletBalance = meta.isNative
    ? (balance ? fmt3(formatUnits(balance.value, balance.decimals)) : undefined)
    : (stableRaw !== undefined && stableDecimals !== undefined ? fmt3(formatUnits(stableRaw, stableDecimals)) : undefined)

  const { data: walletClient } = useWalletClient()
  // Wallet on a chain without pools (Ethereum mainnet, a testnet, …): the UI would otherwise show the default chain
  // while every signed tx goes to the wrong network. Ask the wallet to switch once per connection; if the user
  // declines, keep a banner with a retry button and block wallet-signed txs until it matches.
  const wrongNetwork = isConnected && !!walletChainId && !CHAIN_ID_TO_KEY[walletChainId]
  const autoSwitchedRef = useRef<string | null>(null)
  const switchTo = async (chainId: number) => {
    try { await switchWalletChain(connector, chainId); return true } catch { return false }
  }
  useEffect(() => {
    if (!wrongNetwork || !address) return
    const key = `${address}:${walletChainId}`
    if (autoSwitchedRef.current === key) return
    autoSwitchedRef.current = key
    switchTo(4663) // Robinhood Chain is the default pool chain
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrongNetwork, address, walletChainId])
  // Guard for anything the user's wallet signs: the wallet must be on the chain the UI is operating on.
  const ensureWalletChain = async (): Promise<boolean> => {
    if (walletChainId === activeChainId) return true
    const ok = await switchTo(activeChainId)
    if (!ok) setStatus(`Switch your wallet to ${CHAIN_POOLS[activeChain].label} to continue`)
    return ok
  }
  const { disconnectAsync } = useDisconnect()
  const connections = useConnections()

  useEffect(() => {
    if (!isConnected || !address) {
      setStoredSig(null)
      authSigRef.current = null
      return
    }
    const sig = getStoredSignature(address)
    authSigRef.current = null
    setStoredSig(sig)
    if (!sig) handleSign()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address])

  useEffect(() => {
    if (!address) return
    // On a balance-changing action (deposit/swap/recovery), the indexer needs a few seconds to pick
    // up the new commitment — a single immediate fetch returns stale data (hence "refresh to see it").
    // Poll a few times with backoff so the balance updates on its own.
    let cancelled = false
    const poll = async () => {
      const delays = [300, 2000, 4000, 6000, 8000]
      let prev: number | null = null
      for (const d of delays) {
        await new Promise(r => setTimeout(r, d))
        if (cancelled) return
        const v = await updatePrivateBalance()
        if (v !== null && prev !== null && v !== prev) break // balance moved — done
        if (v !== null) prev = v
      }
    }
    poll()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privateBalanceChanged, address, storedSig, activePool])

  // detect a stuck burner (prior swap whose reshield failed) + AUTO-RESUME it in the background.
  // Burner keys are DERIVED from the signature (+nonce), so we can SCAN derived addresses for
  // stranded on-chain funds from the signature alone — then finish recovery automatically.
  // The burner signs its own txs (no wallet popup), so this runs seamlessly without a click.
  useEffect(() => {
    let cancelled = false
    const scanOnce = async () => {
      if (cancelled) return
      if (!address || !storedSig) { setStuckBurner(null); setBurnerSigMismatch(null); return }
      const sig = getStoredSignature(address)
      if (!sig) { setStuckBurner(null); return }
      try {
        // Candidate burners to check for stranded funds, across every chain (funds bridged from Base sit on a
        // Base burner even after switching networks). Source: the encrypted registry — every Blackpool burner
        // is registered at creation, decrypted locally with the sign-in signature.
        const candidates: { address: string, privateKey: string }[] = []
        
        // Registry burners (random + registered). The auth sig is derived from the sign-in sig — no extra prompt.
        let authSig = authSigRef.current
        if (!authSig) {
          try { authSig = await registryAuthSigFromSignIn(sig); authSigRef.current = authSig } catch { /* no auth sig: nothing to scan */ }
        }
        
        if (authSig) {
          try {
            const reg = await listRecoverableBurners(sig, authSig)
            for (const b of reg) if (!candidates.some(c => c.address.toLowerCase() === b.address.toLowerCase())) candidates.push({ address: b.address, privateKey: b.privateKey })
          } catch { /* registry unavailable: nothing to scan this time */ }
        }
        let hit: { privateKey: string, address: string, pool: string, raw: bigint, chain: ChainKey } | null = null
        const chainsToScan = Object.keys(CHAIN_POOLS) as ChainKey[]
        const orderedChains = chainsToScan.includes('base') ? ['base', ...chainsToScan.filter(c => c !== 'base')] as ChainKey[] : chainsToScan
        let hitMeta: { symbol: string, decimals: number, isNative: boolean } | null = null
        for (const chain of orderedChains) {
          if (cancelled) return
          const p = readProvider(chain)
          const stablePool = CHAIN_POOLS[chain].stable
          const stableTok = DEX[chain].stable
          const stableMeta = POOL_META[`${chain}:${stablePool}`]
          // stable dust threshold scales with decimals: 10000 wei on 6-dec (base/arb/rh) = 0.01 USDC;
          // on 18-dec (BSC) the same 10000 wei is basically nothing, so scale to 10^(dec-2).
          const stableDustFloor = BigInt(10) ** BigInt(Math.max(0, stableMeta.decimals - 2))
          // native pool key per chain (eth on base/rh/arb, bnb on bsc). CHAIN_POOLS.pools[0] is native.
          const nativePoolKey = CHAIN_POOLS[chain].pools[0]
          const nativeMeta = POOL_META[`${chain}:${nativePoolKey}`]
          const stableC = new ethers.Contract(stableTok, ['function balanceOf(address) view returns (uint256)'], p)
          for (const c of candidates) {
            if (cancelled) return
            const stableBal: bigint = await stableC.balanceOf(c.address)
            if (stableBal >= stableDustFloor) { hit = { ...c, pool: stablePool, raw: stableBal, chain }; hitMeta = stableMeta; break }
            // On single-pool chains (Arc: USDC is the gas token AND the only pool) the "native" and
            // "stable" pools are the same asset — its native-view balance is just the 18-decimal
            // mirror of the ERC-20 balance we already checked. Checking it again would mis-credit the
            // pool with an 18-decimal number into a 6-decimal pool, so skip the native branch there.
            if (nativePoolKey === stablePool) continue
            const nativeBal = await p.getBalance(c.address)
            if (nativeBal >= ethers.parseEther('0.0002')) { hit = { ...c, pool: nativePoolKey, raw: nativeBal, chain }; hitMeta = nativeMeta; break }
          }
          if (hit) break
        }
        if (cancelled) return
        setBurnerSigMismatch(null)
        if (!hit) { setStuckBurner(null); return }
        const isNativePool = hitMeta?.isNative ?? (hit.pool === 'eth')
        const sym = hitMeta?.symbol || (isNativePool ? 'ETH' : 'USDC')
        const display = fmt3(ethers.formatUnits(hit.raw, isNativePool ? 18 : (hitMeta?.decimals || 6)))
        setStuckBurner({ pool: hit.pool, raw: hit.raw, display, sym, chain: hit.chain, privateKey: hit.privateKey })
        // Auto-resume ONCE per detected burner — never on a repeating timer. A previous version retried
        // every 20s and, for a burner holding only dust (below the pool minimum), each attempt broadcast
        // a reverting deposit and burned gas forever ("data: 0x" tx, status 0). Now: attempt at most once
        // per address per session; on failure DO NOT clear the ref (no auto-retry) — the manual Recover
        // button remains for the user to trigger deliberately. Also skip amounts too small to ever land.
        // dust floors per token type. native (18-dec): ~0.0015 units; stable: 2 units in its own
        // decimals (2 USDC on 6-dec, 2 USDT on 18-dec). Below this, deposit reverts and burns gas.
        const stableFloor = BigInt(2) * (BigInt(10) ** BigInt(hitMeta?.decimals || 6))
        const floor = isNativePool ? ethers.parseEther('0.0015') : stableFloor
        if (hit.raw < floor) {
          // dust: show it but never auto-broadcast (would revert + burn gas). Manual button still allowed.
          autoRecoverRef.current = hit.address
        } else if (!isTrading && autoRecoverRef.current !== hit.address) {
          autoRecoverRef.current = hit.address // set before attempt so concurrent ticks don't double-fire
          // On FAILURE clear the ref so the next 20s tick retries (e.g. a transient gas-topup or RPC
          // error, or a fix deployed mid-session). We only guard against double-firing WHILE trading,
          // not against ever retrying — the old "leave set on failure" logic permanently wedged a burner
          // whose first attempt failed before a fix, so it never recovered even once conditions were fixed.
          recoverBurner(hit.pool, hit.raw, hit.privateKey, hit.chain).catch(() => { autoRecoverRef.current = null })
        }
      } catch { /* ignore */ }
    }
    // Run immediately, then poll every 20s so a stranded burner recovers automatically WITHOUT the
    // user refreshing or "reporting" it. If an attempt failed, autoRecoverRef was cleared, so the next
    // tick retries; once funds land the scan finds nothing and quietly no-ops.
    scanOnce()
    const iv = setInterval(scanOnce, 20000)
    return () => { cancelled = true; clearInterval(iv) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, storedSig, privateBalanceChanged])

  const updatePrivateBalance = async (): Promise<number | null> => {
    if (!address) return null
    const signature = getStoredSignature(address)
    if (!signature) return null
    setIsUpdatingBalance(true)
    try {
      const res = await apiPost('/api/balance', { signature, address, pool: activePool, chain: activeChain })
      const bal = Number(res.balance)
      setPrivateBalance(bal)
      setPrivateBalanceRaw(typeof res.balance === 'string' ? res.balance : String(res.balance ?? '0'))
      setUtxoCount(Number(res.utxoCount || 0))
      setBalanceError(null)
      return bal
    } catch (err) {
      // A FAILED balance read is not a zero balance. Surface it, because silently keeping the
      // default 0 is what made a real BSC deposit look lost: the funds were on-chain the whole
      // time, the indexer just hadn't scanned them, and the UI still rendered "Private: 0 BNB".
      console.error('Error fetching private balance:', err)
      setBalanceError(err instanceof Error ? err.message : 'balance unavailable')
      return null
    } finally {
      setIsUpdatingBalance(false)
    }
  }

  const handleSign = () => {
    if (!address) return
    signMessage(
      { message: SIGN_MESSAGE },
      {
        onSuccess(sig) {
          saveSignature(address, sig)
          authSigRef.current = null
          setStoredSig(sig)
          setPrivateBalanceChanged(prev => prev + 1)
        },
      }
    )
  }

  const handleWithdraw = async () => {
    if (!address || !isConnected) return
    const signature = getStoredSignature(address)
    if (!signature) return

    // build the recipient list (max 2, "+" style)
    const list = [{ address: withdrawRecipient, amount: withdrawAmount }]
    if (recipient2 !== null) list.push({ address: recipient2, amount: withdrawAmount2 })

    for (const r of list) {
      if (!r.address || !r.address.match(/^0x[a-fA-F0-9]{40}$/)) {
        alert(`Enter a valid Base address`)
        return
      }
      if (!r.amount || isNaN(Number(r.amount)) || Number(r.amount) <= 0) {
        alert(list.length > 1 ? 'Enter a valid amount for each recipient.' : 'Enter an amount to send.')
        return
      }
      // Per-recipient, not on the total: each recipient is its own withdraw and pays its own fee,
      // so two 0.0006 sends are two underfunded withdraws, not one valid 0.0012 one.
      const minTx = meta.isNative ? MIN_TX_NATIVE : MIN_TX_STABLE
      if (Number(r.amount) < minTx) {
        alert(`Minimum send is ${minTx} ${poolSym}. Smaller amounts get eaten by the withdraw fee.`)
        return
      }
    }
    const totalOut = list.reduce((s, r) => s + Number(r.amount), 0)
    if (totalOut > privateBalance) {
      alert(`Insufficient private balance. Deposit more funds.`)
      return
    }

    const sendSteps: Step[] = [
      { id: 1, title: 'Generate proof', sub: `${list.length > 1 ? list.length + ' recipients' : 'private withdraw'}` },
      { id: 2, title: 'Broadcast via relayer', sub: 'no gas from you' },
      { id: 3, title: 'Delivered', sub: 'recipient receives privately' },
    ]
    setIsTrading(true)
    setStepper({ steps: sendSteps, active: 0, error: null })
    setStatus(`Sending privately${list.length > 1 ? ` to ${list.length} recipients` : ''}... building the proof on this device`)
    try {
      setStepper({ steps: sendSteps, active: 1, error: null })
      const res = await apiPost('/api/withdraw', {
        signature,
        pool: activePool,
        chain: activeChain,
        ...(list.length > 1 ? { recipients: list } : { amount: Number(withdrawAmount), recipient: withdrawRecipient }),
      })
      const tx = res.txHash || res.transfers?.[res.transfers.length - 1]?.txHash
      setWithdrawTx(tx)
      setWithdrawChain(CHAIN_POOLS[activeChain].label) // private send is same-chain (the active pool chain)
      setBridgeDestTx(null)
      if (res.transfers) {
        setStatus(`Sent to ${res.transfers.length} recipients (${poolSym})`)
      } else {
        setStatus(`Sent! Recipient receives ${res.recipientReceives} ${res.symbol || poolSym} (fee ${res.fee} ${res.symbol || poolSym})`)
      }
      setStepper({ steps: sendSteps, active: sendSteps.length, error: null })
      setPrivateBalanceChanged(prev => prev + 1)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setStepper(prev => prev ? { ...prev, error: errorMessage } : null)
      setStatus('')
    } finally {
      setIsTrading(false)
      setWithdrawAmount('')
      setWithdrawRecipient('')
      setRecipient2(null)
      setWithdrawAmount2('')
    }
  }

  const handleDeposit = async () => {
    if (!address || !isConnected) return
    const signature = getStoredSignature(address)
    if (!signature) {
      alert('Sign message first to enable deposits.')
      return
    }
    const amount = Number(depositAmount)
    if (isNaN(amount) || amount <= 0) {
      alert('Enter a valid deposit amount.')
      return
    }
    // Reject deposits the withdraw fee would eat. Without this a user can shield an amount
    // barely above the flat fee, then discover on withdraw that most of it is gone -- and a
    // deposit under 2x the fee cannot be withdrawn at all (the relayer's fee*2 < amount guard).
    if (amount < meta.minDeposit) {
      alert(`Minimum deposit is ${meta.minDeposit} ${poolSym}. Smaller amounts get eaten by the withdraw fee.`)
      return
    }
    const ethereum = await connector?.getProvider()
    if (!ethereum) {
      alert('No Ethereum provider found.')
      return
    }
    if (!(await ensureWalletChain())) return

    setIsTrading(true)
    setStatus('Preparing deposit... building the proof on this device')
    try {
      // apiPostRetry (not apiPost): proof-gen can spike past the timeout and abort once on mobile
      // ("Fetch is aborted"). Retrying transparently recovers instead of failing the whole deposit.
      const unsignedTx = await apiPostRetry('/api/deposit/prepare', {
        signature,
        address,
        amount,
        pool: activePool,
        chain: activeChain,
      }, 4, (n) => setStatus(`Preparing deposit... building the proof on this device (retry ${n})`))

      const sendTx = async (tx: { to: string, data: string, value: string }) => {
        if (walletClient) {
          return await walletClient.sendTransaction({
            chain: walletClient.chain,
            to: tx.to as `0x${string}`,
            data: tx.data as `0x${string}`,
            value: normalizeTxValue(tx.value),
          })
        }
        const bp = new ethers.BrowserProvider(ethereum as any)
        const signer = await bp.getSigner(address)
        const r = await signer.sendTransaction({ to: tx.to, data: tx.data, value: normalizeTxValue(tx.value) })
        return r.hash
      }

      // ERC pool: approve first when the allowance is insufficient (the backend returns approveTx)
      if (unsignedTx.approveTx) {
        setStatus(`Approving ${unsignedTx.symbol}... confirm in wallet`)
        const approveHash = await sendTx(unsignedTx.approveTx)
        await waitReceipt(approveHash)
      }

      setStatus('Sending deposit transaction... confirm in wallet')
      const txHash = await sendTx({ to: unsignedTx.to, data: unsignedTx.data, value: unsignedTx.value })

      setStatus('Waiting for confirmation...')
      await waitReceipt(txHash)

      setStatus('Deposit successful!')
      setDepositTx(txHash)
      setDepositAmount('')
      setPrivateBalanceChanged(prev => prev + 1)
      // Auto-close the deposit modal after showing the success confirmation briefly, so it doesn't
      // linger on screen (it had no auto-hide before). Clears the tx/status when it closes.
      setTimeout(() => { setShowDeposit(false); setDepositTx(null); setStatus('') }, 2200)
    } catch (err) {
      let errorMessage = err instanceof Error ? err.message : String(err)
      if (errorMessage.length > 100) {
        errorMessage = errorMessage.split('.')[0] + '.'
      }
      alert(`${errorMessage}`)
      setStatus('')
    } finally {
      setIsTrading(false)
    }
  }

  // origin 1Click asset from the active pool. Prefix per chain: base -> 'base', arbitrum -> 'arb',
  // bsc -> 'bsc' (all indexed by 1Click). Robinhood bridges via routers, not 1Click,
  // so it never hits this path. BSC has 3 pools (bnb/usdc/usdt); other chains have eth + stable.
  const oneClickPrefix = activeChain === 'arbitrum' ? 'arb' : activeChain === 'bsc' ? 'bsc' : activeChain === 'robinhood' ? 'hood' : 'base'
  const originAsset = `${oneClickPrefix}_${activePool}`

  // Same-chain swap preview quote — Uniswap V3 QuoterV2 (on-chain), mirrors the real swap path.
  // Was previously routed through 1Click's bridge quote, which is the wrong tool for same-chain.
  useEffect(() => {
    setSwapQuote(null)
    const amt = Number(swapAmount)
    if (!swapAmount || isNaN(amt) || amt <= 0) return
    const fromEth = meta.isNative
    const tokenIn = fromEth ? WETH_BASE : USDC_BASE
    const tokenOut = fromEth ? USDC_BASE : WETH_BASE
    const decIn = meta.decimals
    const decOut = swapDestMeta.decimals
    const outSym = swapDestMeta.symbol
    const t = setTimeout(async () => {
      try {
        const provider = readProvider()
        const quoter = new ethers.Contract(UNI_QUOTER, ['function quoteExactInputSingle((address,address,uint256,uint24,uint160)) returns (uint256,uint160,uint32,uint256)'], provider)
        const amountIn = ethers.parseUnits(swapAmount, decIn)
        // Light retry: same public-RPC "missing revert data" flake as the execution path (line ~1088).
        // Here it only affects the preview estimate, but retrying 3x keeps the number from flickering out.
        let qRes: [bigint, bigint, bigint, bigint] | null = null
        for (let i = 0; i < 3; i++) {
          try { qRes = await quoter.quoteExactInputSingle.staticCall([tokenIn, tokenOut, amountIn, UNI_FEE, 0]) as unknown as [bigint, bigint, bigint, bigint]; break }
          catch (e) { const m = (e instanceof Error ? e.message : String(e)).toLowerCase(); if (!/missing revert data|call_exception|timeout|429|503|econnreset|fetch/.test(m)) throw e; await new Promise(r => setTimeout(r, 800 * (i + 1))) }
        }
        if (!qRes) return
        const amountOut = ethers.formatUnits(qRes[0] as bigint, decOut)
        setSwapQuote({ amountOut, timeEstimate: 30, symbol: outSym })
      } catch (e) { console.error('swap quote:', e) }
    }, 600)
    return () => clearTimeout(t)
  }, [swapAmount, activePool, slippage])

  // debounced quote: bridge (origin pool token -> bridgeToAsset, cross-chain)
  useEffect(() => {
    setBridgeQuote(null)
    setBridgeUnavailable(false)
    setBridgeLimit(null)
    const amt = Number(bridgeAmount)
    if (!bridgeAmount || isNaN(amt) || amt <= 0) { setBridgeChecking(false); return }
    setBridgeChecking(true)
    const t = setTimeout(async () => {
      try {
        const q = await apiPost('/api/bridge/quote', { fromAsset: originAsset, toAsset: bridgeToAsset, amount: bridgeAmount, dry: true, slippage })
        setBridgeQuote({ amountOut: q.amountOut, timeEstimate: q.timeEstimate, symbol: ASSET_LABELS[bridgeToAsset]?.symbol || '' })
        setBridgeUnavailable(false)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        // route floors from the solver network ("needs at least $1,000", "too low ... Minimum is X"): show it, block the button
        if (/needs at least|too low for this route/i.test(msg)) setBridgeLimit(msg)
        // the solver network signals "no route" / "no liquidity" when nobody quotes the pair
        else setBridgeUnavailable(/not available|no route|no quote|no liquidity|unavailable/i.test(msg))
        console.error('bridge quote:', msg)
      } finally { setBridgeChecking(false) }
    }, 600)
    return () => clearTimeout(t)
  }, [bridgeAmount, bridgeToAsset, originAsset, slippage, activeChain, poolSym, address])

  // BRIDGE (cross-chain, NEAR Intents 1Click): private withdraw -> solver depositAddress -> solver
  // delivers to recipient on the destination chain. Same-chain SWAP is a separate flow
  // (runSwapPrivate, on-chain Uniswap V3) — do not route swap through here.
  const handleIntent = async () => {
    if (!address || !isConnected) return
    const signature = getStoredSignature(address)
    if (!signature) return
    const amount = bridgeAmount
    const recipient = bridgeRecipient
    const toAsset = bridgeToAsset
    const outSym = ASSET_LABELS[toAsset]?.symbol || ''
    if (!recipient || !recipientValid(toAsset, recipient)) {
      alert(`Enter a valid ${ASSET_LABELS[toAsset]?.chain || ''} recipient address`)
      return
    }
    const amtNum = Number(amount)
    if (!amount || isNaN(amtNum) || amtNum <= 0) {
      alert('Enter a valid amount.')
      return
    }
    // Same floor as the private withdraw -- this is the 1Click path but it still starts with a
    // relayer withdraw, so it pays the same fee and needs the same minimum.
    const minBridge = meta.isNative ? MIN_TX_NATIVE : MIN_TX_STABLE
    if (amtNum < minBridge) {
      alert(`Minimum bridge is ${minBridge} ${poolSym}. Smaller amounts get eaten by the withdraw fee + gas.`)
      return
    }
    if (amtNum > privateBalance) {
      alert(`Insufficient private balance. Deposit more funds.`)
      return
    }
    // ETA text — same rule everywhere: while under estimate, count down; if we go over, switch to
    // "taking longer than expected" so the user knows we're past the solver's own quote (not stuck).
    const etaText = (etaSec: number, elapsedSec: number) => {
      const remaining = etaSec - elapsedSec
      if (remaining > 0) return `arriving in ~${remaining}s (${elapsedSec}s elapsed / est ${etaSec}s)`
      return `taking longer than expected - ${elapsedSec}s elapsed, est was ${etaSec}s`
    }
    const initialEta = bridgeQuote?.timeEstimate || 60
    const bridgeSteps: Step[] = [
      { id: 1, title: 'Generate proof', sub: 'private withdraw + solver quote' },
      { id: 2, title: `Bridge to ${ASSET_LABELS[toAsset]?.chain || ''}`, sub: 'via NEAR Intents solver' },
      { id: 3, title: 'Delivering to recipient', sub: `est ~${initialEta}s to ${ASSET_LABELS[toAsset]?.chain || ''}` },
    ]
    setIsTrading(true)
    setStepper({ steps: bridgeSteps, active: 0, error: null })
    setStatus(`Bridging privately... building the proof on this device`)
    try {
      setStepper({ steps: bridgeSteps, active: 1, error: null })
      const res = await apiPost('/api/swap', {
        signature, fromAsset: originAsset, toAsset, amount: amtNum, recipient, slippage,
        refundTo: address, // only used when the recipient is not an EVM address (Solana/XRP): refunds land on the origin chain
      })
      const eta = Number(res.timeEstimate) || initialEta
      // update the "Delivering" step's ETA line with the FINAL number from the real quote
      bridgeSteps[2] = { ...bridgeSteps[2], sub: `est ~${eta}s to ${ASSET_LABELS[toAsset]?.chain || ''}` }
      setStepper({ steps: bridgeSteps, active: 2, error: null })
      setStatus(`Bridge in processing - recipient receives ~${res.amountOut} ${outSym} (est ${eta}s)`)
      setWithdrawTx(res.txHash)
      setWithdrawChain(CHAIN_POOLS[activeChain].label) // source withdraw happens on the active pool chain
      setBridgeDestTx(null)    // reset; will be filled when intent settles with dest hash
      setPrivateBalanceChanged(prev => prev + 1)
      setBridgeAmount(''); setBridgeRecipient('')

      // step 3 (Delivering) keeps spinning: poll the intent status until the solver settles (SUCCESS/REFUNDED/FAILED)
      // /api/swap returns once the withdraw to the solver succeeds, BUT the cross-chain bridge takes time. Per the 1Click docs:
      // cross-chain can take up to ~15 minutes. Terminal status = SUCCESS / REFUNDED / FAILED. If the budget passes
      // without a terminal status, do NOT leave the spinner hanging - set a neutral info state (funds are safe, closing is fine).
      if (res.depositAddress) {
        const start = Date.now()
        let settled = false
        while (Date.now() - start < 900_000) { // max 15 minutes (per the 1Click cross-chain SLA)
          await new Promise(r => setTimeout(r, 8000))
          try {
            const st = await apiGet(`/api/intent-status?depositAddress=${res.depositAddress}`)
            if (st.status === 'SUCCESS') {
              setStepper({ steps: bridgeSteps, active: bridgeSteps.length, error: null })
              setStatus('') // the Recent bridges card above shows the delivered amount
              // capture destination-chain tx hash if solver returned one (varies by intent provider)
              const destHash = st.destTxHash || st.destinationTx || st.dstTxHash || st.outboundTxHash
              const destChain = ASSET_LABELS[toAsset]?.chain
              if (destHash && destChain) setBridgeDestTx({ chain: destChain, hash: destHash })
              settled = true
              break
            }
            if (st.status === 'REFUNDED' || st.status === 'FAILED') {
              setStepper(prev => prev ? { ...prev, error: `Bridge ${st.status.toLowerCase()}: ${st.refundReason || 'solver could not complete'} — refund is sent to your wallet on ${CHAIN_POOLS[activeChain].label} (see /recover for the record)` } : null)
              settled = true
              break
            }
            // PROCESSING: show countdown/overshoot text so user knows we're on-track vs slow
            const elapsedSec = Math.round((Date.now() - start) / 1000)
            setStepper({ steps: bridgeSteps.map((s, i) => i === 2 ? { ...s, sub: etaText(eta, elapsedSec) } : s), active: 2, error: null })
          } catch { /* transient, retry */ }
        }
        // loop exited without a terminal status = the solver is still running past 15 minutes. Funds are not lost - the withdraw
        // from the pool already succeeded (res.txHash); only the solver settlement is pending. Resolve the stepper to a neutral info state
        // so the spinner stops and the user can close. It can be checked later on the NEAR Intents Explorer.
        if (!settled) {
          setStepper(prev => prev ? { ...prev, info: `Solver still settling (over ${Math.round((Date.now() - start) / 60000)} min). Your withdraw already left the pool - funds are safe and delivery finishes on-chain. Track via the withdraw tx or NEAR Intents Explorer.` } : null)
          setStatus(`Bridge submitted - solver settling. Funds are safe (withdraw tx confirmed).`)
        }
      } else {
        setTimeout(() => setStepper(prev => prev ? { steps: bridgeSteps, active: bridgeSteps.length, error: null } : null), 800)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      setStepper(prev => prev ? { ...prev, error: errorMessage } : null)
      setStatus('')
    } finally {
      setIsTrading(false)
    }
  }

  // ===== SWAP-TO-PRIVATE (burner wallet flow) =====
  // ETH-private -> USDC-private. The output lands in the user's USDC pool (not an external recipient).
  // 6 phases: withdraw->burner -> wait until funded -> 1Click swap ETH->USDC -> wait for USDC -> reshield USDC->pool.
  // read-only RPC for the given pool chain (defaults to the active chain). Burner scans, swap quotes,
  // and reshield reads all go through here so they hit the right chain.
  const readProvider = (chain: ChainKey = activeChain) => new ethers.JsonRpcProvider(
    chain === 'robinhood'
      ? (process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com')
      : chain === 'arbitrum'
      ? (process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc')
      : chain === 'bsc'
      ? (process.env.NEXT_PUBLIC_BSC_RPC_URL || 'https://bsc-dataseed.binance.org')
      // Arc branch REMOVED: its RPC answers 401, so every read routed here stalled (see CHAIN_POOLS).
      : (process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org')
  )

  // wait for a receipt through OUR read RPC, never the wallet's. BrowserProvider.waitForTransaction
  // proxies eth_getTransactionReceipt through the injected wallet provider; on a fast chain
  // (Robinhood mines ~0.1s blocks) the tx is already mined before that poller starts, so the promise
  // never settles and the modal hangs on "Waiting for confirmation..." even though the deposit landed
  // on chain. Poll the chain directly with a time budget so a stuck wallet RPC cannot freeze the UI.
  const waitReceipt = async (txHash: string, chain: ChainKey = activeChain, maxSec = 180) => {
    const provider = readProvider(chain)
    const start = Date.now()
    while (Date.now() - start < maxSec * 1000) {
      try {
        const rec = await provider.getTransactionReceipt(txHash)
        if (rec) {
          if (rec.status === 0) throw new Error('Transaction reverted on chain.')
          return rec
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('reverted on chain')) throw err
        // transient RPC read failure: the tx is unaffected, keep polling inside the budget
      }
      await new Promise(r => setTimeout(r, 1500))
    }
    throw new Error('Timed out waiting for confirmation. The transaction may still have been mined, check your balance before retrying.')
  }

  // does the burner already hold REAL origin-token funding (not just leftover gas dust from a prior
  // stuck swap)? Threshold must be > the gas reserve or a dust-only burner will look "funded", cause
  // the withdraw to be skipped, and then throw "burner balance too low after fees" on the next step.
  const hasBurnerFunds = async (provider: ethers.Provider, addr: string, isEth: boolean): Promise<boolean> => {
    if (isEth) return (await provider.getBalance(addr)) > ethers.parseEther('0.00006') // > gas reserve
    const usdc = new ethers.Contract(USDC_BASE, ['function balanceOf(address) view returns (uint256)'], provider)
    return (await usdc.balanceOf(addr)) >= BigInt(10000) // >= 0.01 USDC (dust threshold)
  }
  const pollBalance = async (provider: ethers.Provider, addr: string, minWei: bigint, label: string, maxSec = 180): Promise<bigint> => {
    const start = Date.now()
    while (Date.now() - start < maxSec * 1000) {
      // a single flaky RPC read must not kill the whole poll — funds are safe on the burner either
      // way, so swallow the error and keep retrying within the time budget instead of throwing.
      try {
        const bal = await provider.getBalance(addr)
        if (bal >= minWei) return bal
      } catch { /* transient RPC error, retry */ }
      await new Promise(r => setTimeout(r, 4000))
    }
    throw new Error(`timeout waiting ${label}`)
  }

  const pollErc20 = async (provider: ethers.Provider, token: string, addr: string, minWei: bigint, maxSec = 180): Promise<bigint> => {
    const erc = new ethers.Contract(token, ['function balanceOf(address) view returns(uint256)'], provider)
    const start = Date.now()
    while (Date.now() - start < maxSec * 1000) {
      // same as pollBalance: a flaky RPC read (e.g. "missing revert data" from a public node) must
      // not kill the poll and pause the swap — funds stay safe on the burner, just keep retrying.
      try {
        const bal: bigint = await erc.balanceOf(addr)
        if (bal >= minWei) return bal
      } catch { /* transient RPC error, retry */ }
      await new Promise(r => setTimeout(r, 5000))
    }
    throw new Error('timeout waiting USDC on burner')
  }

  // Same-chain swap constants resolve to the ACTIVE chain's Uniswap V3 deployment + stablecoin.
  // The burner swaps itself on-chain in a single tx (no off-chain solver for same-chain). Names kept
  // as *_BASE for minimal diff, but the values follow activeChain: base uses USDC + fee 100,
  // robinhood uses USDG + fee 500 (its deepest WETH/stable pool).
  const _uni = DEX[activeChain]
  const USDC_BASE = _uni.stable      // active chain's stablecoin (USDC on base, USDG on robinhood)
  const WETH_BASE = _uni.weth        // active chain's wrapped native
  const UNI_ROUTER = _uni.router     // SwapRouter02 on the active chain
  const UNI_QUOTER = _uni.quoter     // QuoterV2 on the active chain
  const UNI_FEE = _uni.fee           // best-liquidity fee tier for this chain's native/stable pair

  // Recover funds stranded on a burner from a swap whose reshield failed. Reshields the token the
  // burner actually holds into its matching pool, crediting the user's private balance. `nonce`
  // selects which derived burner (from a scan) — works from the signature alone.
  // Reshield funds stranded on a burner back into the user's private pool. The burner is now a RANDOM
  // ephemeral wallet, so the caller passes its private key directly (from the registry decrypt, or a
  // legacy nonce-derived key for pre-rewrite burners). recoverChain is where the funds actually sit.
  const recoverBurner = async (destPool: string, rawBal: bigint, burnerKey: string, recoverChain: ChainKey = activeChain) => {
    const signature = getStoredSignature(address!)
    if (!signature) { alert('Sign in first.'); return }
    if (!burnerKey) { alert('Burner key missing.'); return }
    const provider = readProvider(recoverChain)
    const bw = new ethers.Wallet(burnerKey, provider)
    const bState = { privateKey: burnerKey, address: bw.address, createdAt: Date.now(), userAddress: address! } as BurnerState
    // fall back to the chain's native pool key (eth on base/rh/arb, bnb on bsc) so this stays
    // safe if destPool ever comes in stale/wrong.
    const destMeta = POOL_META[`${recoverChain}:${destPool}`] || POOL_META[`${recoverChain}:${CHAIN_POOLS[recoverChain].pools[0]}`]
    const destSym = destMeta.symbol
    const destDecimals = destMeta.decimals
    const steps: Step[] = [
      { id: 1, title: 'Recover stuck funds', sub: `${ethers.formatUnits(rawBal, destDecimals)} ${destSym} on burner` },
      { id: 2, title: 'Reshield to private', sub: `deposit to ${destSym} pool` },
    ]
    setStepper({ steps, active: 1, error: null })
    setIsTrading(true)
    try {
      // Gas params, mirroring the proven CLI reshield (cmdSwap): cap maxFeePerGas at a chain-realistic
      // ceiling, NEVER ethers' 1.5 gwei default. Base baseFee ~0.01 gwei, Robinhood ~0.047 gwei; the
      // network "suggestion" on Robinhood is ~1.6 gwei (34x inflated) — using it made the deposit gas
      // reserve ~0.0025 ETH, far more than the burner held, so estimateGas reverted "missing revert
      // data" / the burner could never fund its own reshield. Compute this FIRST so the gas top-up
      // threshold below is sized from the real cost, not a stale flat guess.
      // ADAPTIVE cap = 2x block baseFee (see swap flow for rationale). Flat caps broke when baseFee
      // spiked above them ("max fee per gas less than block base fee" — the RH USDG sweep failure).
      const recBlk = await provider.getBlock('latest')
      // Legacy chains (BSC: baseFee=0, 0.05 gwei validator floor) reject EIP-1559 maxFee=2*baseFee(=0)
      // with "gas price below minimum". Use a single legacy gasPrice >= floor on those chains.
      const recIsLegacy = !recBlk?.baseFeePerGas || recBlk.baseFeePerGas === BigInt(0)
      let maxFeePerGas: bigint // used to size the gas reserve regardless of tx type
      let recGasOv: { maxFeePerGas: bigint, maxPriorityFeePerGas: bigint } | { gasPrice: bigint }
      if (recIsLegacy) {
        const fd = await provider.getFeeData()
        const bscFloor = ethers.parseUnits('0.06', 'gwei')
        let gp = fd.gasPrice || bscFloor
        if (gp < bscFloor) gp = bscFloor
        maxFeePerGas = gp
        recGasOv = { gasPrice: gp }
      } else {
        const recBaseFee = recBlk.baseFeePerGas
        const recFloor = ethers.parseUnits('0.02', 'gwei')
        maxFeePerGas = recBaseFee * BigInt(2)
        if (maxFeePerGas < recFloor) maxFeePerGas = recFloor
        const maxPriorityFeePerGas = ethers.parseUnits('0.005', 'gwei') < maxFeePerGas ? ethers.parseUnits('0.005', 'gwei') : maxFeePerGas / BigInt(2)
        recGasOv = { maxFeePerGas, maxPriorityFeePerGas }
      }
      const RESHIELD_GAS = BigInt(1600000) // ETH-pool deposit measured ~1.35M; 1.6M with headroom
      const APPROVE_GAS = BigInt(80000)

      // Stablecoin dest (USDC/USDG): the token IS the value, so gas comes from the burner's separate
      // ETH. It needs enough for approve + deposit. The old flat 0.00006 threshold was too low — a
      // burner sitting at 0.000067 ETH passed the check yet couldn't afford ~0.00017 ETH of gas, so
      // recovery kept failing. Size the threshold from the real cost and top up via the relayer if
      // short. ETH dest pays its own gas out of rawBal (reserved below), no top-up.
      // Headroom is 20%, matching the swap path -- these two thresholds must stay in step because
      // the backend funds above the HIGHEST of them (apiServer.js:1194) and pays for the difference
      // out of the withdraw fee. RESHIELD_GAS is already a ceiling over real usage (~1.35M) and
      // maxFeePerGas is already 2x baseFee, so 20% is the third and only discretionary margin.
      if (destPool !== 'eth') {
        const gasNeeded = (RESHIELD_GAS + APPROVE_GAS) * maxFeePerGas * BigInt(120) / BigInt(100)
        if ((await provider.getBalance(bState.address)) < gasNeeded) {
          setStatus('topping up gas for burner...')
          const g = await apiPostRetry('/api/burner-gas', { burnerAddress: bState.address, chain: recoverChain, txCount: 2 }, 5, (n) => setStatus(`topping up gas... (retry ${n})`))
          if (!g.success) throw new Error('gas top-up failed')
          await pollBalance(provider, bState.address, gasNeeded, 'burner gas', 120)
        }
      }

      // For ETH dest the deposit tx is payable (value = amount) AND pays its own gas from the same
      // balance. Reserve the gas cost with 20% HEADROOM, not exactly gasLimit*maxFee: reserving
      // exactly gasCost leaves value + gas == balance with ZERO margin, so any tiny balance
      // staleness (Base's load-balanced public RPC can report the burner a few gwei higher than the
      // node that broadcasts sees) tips it into "insufficient funds for gas * price + value" — the
      // ~9e9-wei overshoot from the live swap. The extra reserved dust (~1.8e-6 ETH) stays on the
      // burner and is swept by recovery, so over-reserving is safe; under-reserving strands the tx.
      const gasCost = RESHIELD_GAS * maxFeePerGas
      const gasReserve = gasCost * BigInt(120) / BigInt(100)
      // Native pool (eth/bnb) reshield is payable so we reserve gas out of the value; ERC20 reshield
      // pays gas separately from the burner balance, so reshield the full raw stable amount.
      const reshieldRaw = destMeta.isNative ? (rawBal - gasReserve) : rawBal
      if (reshieldRaw <= BigInt(0)) throw new Error('amount too low to reshield after gas')
      const destAmount = ethers.formatUnits(reshieldRaw, destDecimals)
      setStatus('generating ZK proof...')
      const prep = await apiPostRetry('/api/deposit/prepare', { signature, address, amount: destAmount, pool: destPool, chain: recoverChain }, 5, (n) => setStatus(`generating ZK proof... (retry ${n})`))
      setStatus(`reshielding to private ${destSym}...`)
      // recGasOv is either { maxFeePerGas, maxPriorityFeePerGas } (EIP-1559 chains) or { gasPrice }
      // (legacy chains like BSC). Ethers picks the tx type based on which shape is provided.
      const sendResilient = async (tx: { to: string, data: string, value?: bigint, gasLimit?: bigint }) => {
        try { const r = await bw.sendTransaction({ to: tx.to, data: tx.data, value: tx.value || BigInt(0), gasLimit: tx.gasLimit, ...recGasOv }); await r.wait() }
        catch (e) {
          const msg = (e instanceof Error ? e.message : String(e)).toLowerCase()
          if (/already known|nonce too low|replacement (transaction )?underpriced|transaction already/.test(msg)) {
            const n0 = await provider.getTransactionCount(bState.address, 'latest'); const t0 = Date.now()
            while (Date.now() - t0 < 120000) { await new Promise(r => setTimeout(r, 4000)); if (await provider.getTransactionCount(bState.address, 'latest') > n0) return }
            return
          }
          throw e
        }
      }
      if (prep.approveTx) await sendResilient({ to: prep.approveTx.to, data: prep.approveTx.data, value: BigInt(0), gasLimit: BigInt(80000) })
      await sendResilient({ to: prep.to, data: prep.data, value: BigInt(prep.value || '0'), gasLimit: RESHIELD_GAS })
      setStepper({ steps, active: steps.length, error: null })
      setStatus(`Recovered! +${destAmount} ${destSym} in your private balance`)
      setPrivateBalanceChanged(prev => prev + 1)
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      setStepper(prev => prev ? { ...prev, error: `${m} - funds still safe on burner, auto-recovery will retry` } : null)
      setStatus('')
      throw err // re-throw so the auto-resume caller clears autoRecoverRef and the next scan retries
    } finally { setIsTrading(false) }
  }

  // Same-chain swap-to-private. Line-by-line port of scripts/uniswap_swap_test.js (backend-verified,
  // end-to-end on-chain PASS). Flow (withdraw → burner → DEX quote →
  // DEX swap → reshield). Recovery of any prior stranded burner runs INDEPENDENTLY in the useEffect
  // scanner above — so the button here never has to wait on RPC scans and never gets stuck.
  const runSwapPrivate = async () => {
    if (!address || !isConnected) return
    const signature = getStoredSignature(address)
    if (!signature) { alert('Sign in first.'); return }
    const amtNum = Number(swapAmount)
    if (!swapAmount || isNaN(amtNum) || amtNum <= 0) { alert('Enter a valid amount.'); return }
    if (amtNum > privateBalance) { alert('Insufficient private balance.'); return }
    const fromEth = meta.isNative
    const MIN_SWAP = fromEth ? MIN_TX_NATIVE : MIN_TX_STABLE
    if (amtNum < MIN_SWAP) { alert(`Minimum swap is ${MIN_SWAP} ${poolSym}. Smaller amounts get eaten by the withdraw fee + gas.`); return }
    // origin pool key on the active chain; dest is the OTHER pool on same chain (native <-> stable).
    const stablePool = CHAIN_POOLS[activeChain].stable   // 'usdc' on base, 'usdg' on robinhood, 'usdt' on bsc
    const chainNativePool = CHAIN_POOLS[activeChain].pools[0] // 'eth' or 'bnb'
    const fromAsset = `${activeChain}_${activePool}` // legacy hint; backend now uses {chain,pool}
    const destPool: string = fromEth ? stablePool : chainNativePool
    const destMeta = POOL_META[`${activeChain}:${destPool}`]
    const destSym = destMeta.symbol
    const destDecimals = destMeta.decimals

    setIsTrading(true)
    const provider = readProvider()
    const swapSteps: Step[] = [
      { id: 1, title: 'Withdraw to burner', sub: 'submitting to relayer...' },
      { id: 2, title: 'Fund burner wallet', sub: fromEth ? `waiting for ${poolSym}...` : 'topping up gas...' },
      // DEX label per chain: BSC uses PancakeSwap V3, everyone else uses Uniswap V3.
      { id: 3, title: `Swap ${poolSym} → ${destSym}`, sub: `on-chain via ${activeChain === 'bsc' ? 'PancakeSwap' : 'Uniswap'}` },
      { id: 4, title: 'Reshield to private', sub: `deposit to ${destSym} pool` },
    ]
    const setStep = (n: number) => setStepper({ steps: swapSteps, active: n, error: null })
    setStep(0)
    // Track whether funds actually reached the burner. If a failure happens BEFORE this (e.g. the
    // relayer rejects the withdraw for insufficient private balance), NOTHING moved — so the error
    // must NOT claim "funds safe on burner, recovery will retry" (there's nothing on the burner).
    let fundedBurner = false
    try {
      // 0) fresh RANDOM ephemeral burner, registered (encrypted key) BEFORE funding so a stall at
      // any later step is always recoverable from any device. No slots, no nonce scan, never "stuck".
      const authSig = await getRegistryAuthSig()
      const bState = await createAndRegisterBurner({ signInSig: signature, authSig, chain: activeChain, token: USDC_BASE })
      const bw = burnerWallet(bState, provider)

      // 1) withdraw private → burner (relayer). Server owns retry semantics.
      setStatus('submitting to relayer...')
      const wd = await apiPost('/api/swap-private', { signature, fromAsset, amount: swapAmount, burnerAddress: bState.address, chain: activeChain, pool: activePool })
      if (!wd.success) throw new Error('withdraw to burner failed')

      // 2) wait for origin token on burner + top up ETH gas for USDC origin
      setStep(1)
      // Compute ADAPTIVE gas ONCE up front (2x block baseFee) and reuse for BOTH the swap tx and the
      // reshield. Previously the swap tx applied NO gas override, so ethers used the RPC's inflated
      // suggestion (~1.6 gwei on Robinhood, 34x baseFee) while the ETH-origin gas reserve was a flat
      // 0.00008 ETH sized for cheap chains. On Robinhood the swap then cost far more than reserved and
      // reverted "insufficient funds for gas * price + value" (have 0.004438 want 0.004473). Sizing the
      // reserve from the REAL maxFee + applying it to the swap tx fixes ETH->USDG on Robinhood.
      // Gas for the burner's swap tx. BSC is a LEGACY chain (baseFee=0, EIP-1559 not enforced) with a
      // 0.05 gwei validator floor — sending an EIP-1559 maxFee of 2*baseFee (=0) there is rejected with
      // "gas price below minimum". Detect legacy chains and use a single legacy gasPrice >= floor.
      const swBlk0 = await provider.getBlock('latest')
      const swIsLegacy = !swBlk0?.baseFeePerGas || swBlk0.baseFeePerGas === BigInt(0)
      let swMaxFee: bigint
      let swGasOv: { maxFeePerGas: bigint, maxPriorityFeePerGas: bigint } | { gasPrice: bigint }
      if (swIsLegacy) {
        // legacy: read gasPrice from RPC, floor at 0.06 gwei (BSC min 0.05 + headroom).
        const fd = await provider.getFeeData()
        const bscFloor = ethers.parseUnits('0.06', 'gwei')
        let gp = fd.gasPrice || bscFloor
        if (gp < bscFloor) gp = bscFloor
        swMaxFee = gp // used only to SIZE the gas reserve below
        swGasOv = { gasPrice: gp }
      } else {
        const swBaseFee0 = swBlk0.baseFeePerGas
        swMaxFee = swBaseFee0 * BigInt(2)
        const swFloor0 = ethers.parseUnits('0.02', 'gwei')
        if (swMaxFee < swFloor0) swMaxFee = swFloor0
        const swPrio = ethers.parseUnits('0.005', 'gwei') < swMaxFee ? ethers.parseUnits('0.005', 'gwei') : swMaxFee / BigInt(2)
        swGasOv = { maxFeePerGas: swMaxFee, maxPriorityFeePerGas: swPrio }
      }
      const SWAP_GAS_LIMIT = BigInt(320000) // exactInputSingle ~150-250k; 320k with headroom
      let swapAmountRaw: bigint
      if (fromEth) {
        setStatus('waiting funds on burner wallet..')
        await pollBalance(provider, bState.address, ethers.parseEther('0.0001'), 'burner funding')
        fundedBurner = true // ETH has landed on the burner — from here a failure IS recoverable
        const bal = await provider.getBalance(bState.address)
        // Reserve = swap-tx gas at the REAL adaptive maxFee (+50% headroom), NOT a flat guess. The swap
        // is payable (value = swapAmountRaw) AND pays its own gas from the same balance, so under-
        // reserving strands it. On Robinhood (baseFee ~0.16 gwei) this is ~0.00015 ETH vs the old 0.00008.
        const gasReserve = SWAP_GAS_LIMIT * swMaxFee * BigInt(150) / BigInt(100)
        if (bal <= gasReserve) throw new Error('burner balance too low after fees')
        swapAmountRaw = bal - gasReserve
      } else {
        setStatus(`waiting ${poolSym} on burner wallet..`)
        const usdcOnBurner = await pollErc20(provider, USDC_BASE, bState.address, BigInt(1), 200)
        fundedBurner = true // USDC has landed on the burner — from here a failure IS recoverable
        setStatus('topping up gas for burner..')
        const g = await apiPostRetry('/api/burner-gas', { burnerAddress: bState.address, chain: activeChain }, 4, (n) => setStatus(`topping up gas... (retry ${n})`))
        if (!g.success) throw new Error('gas top-up failed')
        await pollBalance(provider, bState.address, BigInt(1), 'burner gas')
        swapAmountRaw = usdcOnBurner
      }

      // 3) burner swaps itself on Uniswap V3 (single on-chain tx, dest token lands immediately)
      setStep(2)
      setStatus(`swapping ${poolSym} → ${destSym}...`)
      const tokenIn = fromEth ? WETH_BASE : USDC_BASE
      const tokenOut = fromEth ? USDC_BASE : WETH_BASE
      const quoter = new ethers.Contract(UNI_QUOTER, ['function quoteExactInputSingle((address,address,uint256,uint24,uint160)) returns (uint256,uint160,uint32,uint256)'], provider)
      // RETRY the quote: Base's load-balanced public RPC (mainnet.base.org) intermittently returns
      // "missing revert data" / CALL_EXCEPTION on heavy eth_calls like QuoterV2's swap simulation —
      // verified the exact same call succeeds on retry (5/5) while a single attempt flakes. A one-shot
      // call here killed the swap at step 3 (the failure in the wild). Retry up to 6x with backoff,
      // treating CALL_EXCEPTION / missing-revert-data as transient (same as pollBalance elsewhere).
      let quoted: bigint | null = null
      let lastQErr: unknown = null
      for (let i = 0; i < 6; i++) {
        try {
          const qRes = await quoter.quoteExactInputSingle.staticCall([tokenIn, tokenOut, swapAmountRaw, UNI_FEE, 0])
          quoted = qRes[0] as bigint
          break
        } catch (e) {
          lastQErr = e
          const m = (e instanceof Error ? e.message : String(e)).toLowerCase()
          // only retry the known-transient RPC flake; a real revert (e.g. no pool) should fail fast
          if (!/missing revert data|call_exception|could not coalesce|timeout|429|503|econnreset|fetch/.test(m)) throw e
          await new Promise(r => setTimeout(r, 1200 * (i + 1)))
        }
      }
      if (quoted === null) throw (lastQErr instanceof Error ? lastQErr : new Error('quote failed after retries'))
      const minOut = quoted - (quoted * BigInt(slippage) / BigInt(10000))
      if (!fromEth) {
        // Approve USDC to Uniswap, then POLL allowance on-chain before the swap tx — same
        // stale-read risk as the reshield step: swap can revert "transfer exceeds allowance" if
        // it lands on an RPC node that hasn't seen the approve yet. Matches the backend script.
        const usdcC = new ethers.Contract(USDC_BASE, ['function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)'], bw)
        const usdcRead = new ethers.Contract(USDC_BASE, ['function allowance(address,address) view returns (uint256)'], provider)
        if ((await usdcRead.allowance(bState.address, UNI_ROUTER)) < swapAmountRaw) {
          const at = await usdcC.approve(UNI_ROUTER, swapAmountRaw); await at.wait()
          for (let i = 0; i < 20; i++) {
            try { if ((await usdcRead.allowance(bState.address, UNI_ROUTER)) >= swapAmountRaw) break } catch { /* transient */ }
            await new Promise(r => setTimeout(r, 2500))
          }
        }
      }
      const router = new ethers.Contract(UNI_ROUTER, ['function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)'], bw)
      const params = { tokenIn, tokenOut, fee: UNI_FEE, recipient: bState.address, amountIn: swapAmountRaw, amountOutMinimum: minOut, sqrtPriceLimitX96: 0 }
      // Apply the SAME adaptive gas (swGasOv) + explicit gasLimit the reserve was sized from. Without
      // this the swap used the RPC's inflated ~1.6 gwei suggestion on Robinhood, blowing past the
      // reserve and reverting "insufficient funds for gas * price + value".
      const swapTx = fromEth
        ? await router.exactInputSingle(params, { value: swapAmountRaw, gasLimit: SWAP_GAS_LIMIT, ...swGasOv })
        : await router.exactInputSingle(params, { gasLimit: SWAP_GAS_LIMIT, ...swGasOv })
      await swapTx.wait()
      // stable→native: unwrap wrapped native (WETH/WBNB) so it can reshield to the native pool
      if (!fromEth) {
        setStatus(`unwrapping to ${destSym}...`)
        const wbal = await pollErc20(provider, WETH_BASE, bState.address, BigInt(1), 60)
        const weth = new ethers.Contract(WETH_BASE, ['function withdraw(uint256)'], bw)
        const uw = await weth.withdraw(wbal); await uw.wait()
      }

      // 4) reshield dest token → dest pool (credited to the user's private balance)
      setStep(3)
      setStatus('generating ZK proof...')
      const destRaw = fromEth
        ? await pollErc20(provider, USDC_BASE, bState.address, BigInt(1), 60)
        : await pollBalance(provider, bState.address, ethers.parseEther('0.00008'), 'ETH after swap', 60)
      // Reuse the adaptive gas (swMaxFee / swGasOv) computed up front at step 1 — same 2x-baseFee cap
      // applied to the swap tx, now also sizing the reshield gas so both stay consistent on Robinhood.
      // ETH dest pays its own gas out of the reshield value. Reserve gasCost * 1.2 (20% HEADROOM),
      // NOT exactly gasLimit*maxFee: reserving exactly leaves value + gas == balance with ZERO margin,
      // so Base's load-balanced public RPC reporting the burner a few gwei higher than the broadcasting
      // node tips it into "insufficient funds for gas * price + value" (the ~1.1e10-wei overshoot seen
      // live on USDC->ETH). Extra reserved dust (~1.8e-6 ETH) stays on the burner and is swept by recovery.
      const ethReshieldGas = BigInt(1600000) * swMaxFee * BigInt(120) / BigInt(100)
      const reshieldRaw = fromEth ? destRaw : (destRaw - ethReshieldGas)
      if (reshieldRaw <= BigInt(0)) throw new Error('swap output too low to reshield')
      const destAmount = ethers.formatUnits(reshieldRaw, destDecimals)
      // Stablecoin dest (USDC/USDG): the token IS the reshield value, so gas comes from the burner's
      // SEPARATE ETH — but the swap just spent almost all of it, leaving only the tiny reserve. That
      // stinginess is exactly what stranded ETH->USDG swaps (approve+deposit couldn't fund themselves).
      // Gas here is cheap (~0.0001-0.0005 ETH for the pair), so top up generously via the relayer
      // BEFORE reshielding. ETH dest reserves its gas out of reshieldRaw above, so no top-up needed.
      if (destPool !== 'eth') {
        // Threshold = worst-case spend (both txs burning their FULL gasLimit at maxFee) + 20%.
        // Was 1.5x, which stacked a third safety factor on top of two that are already there: the
        // 1.6M gasLimit is a ceiling over the ~1.35M the reshield really consumes, and maxFee is
        // itself 2x baseFee. The backend must fund ABOVE whatever this number is (apiServer.js:1194)
        // to survive baseFee drift between the two reads, so every point of slack here is paid for
        // in relayer margin -- at 1.5x the burner top-up alone exceeded the entire withdraw fee on
        // Robinhood/Arbitrum, making those flows loss-making. 1.2x still covers the worst case with
        // 1.5x headroom after the backend's own cushion. Do NOT raise without re-checking margin.
        const gasNeeded = (BigInt(1600000) + BigInt(80000)) * swMaxFee * BigInt(120) / BigInt(100)
        if ((await provider.getBalance(bState.address)) < gasNeeded) {
          setStatus('topping up gas for reshield...')
          const g = await apiPostRetry('/api/burner-gas', { burnerAddress: bState.address, chain: activeChain, txCount: 2 }, 5, (n) => setStatus(`topping up gas... (retry ${n})`))
          if (!g.success) throw new Error('gas top-up failed')
          await pollBalance(provider, bState.address, gasNeeded, 'burner gas', 120)
        }
      }
      const prep = await apiPostRetry('/api/deposit/prepare', { signature, address, amount: destAmount, pool: destPool, chain: activeChain }, 4, (n) => setStatus(`generating ZK proof... (retry ${n})`))
      setStatus(`reshielding to private ${destSym}...`)
      // Approve THEN poll on-chain allowance before the deposit tx — a load-balanced RPC node can
      // still return a stale zero right after mining, and the pool's transferFrom will revert with
      // "ERC20: transfer amount exceeds allowance" if we broadcast the deposit before allowance
      // has actually propagated. Mirrors the backend script that verified this flow end-to-end.
      if (prep.approveTx) {
        // resilient send: tolerates "already known" if this exact approve was already broadcast
        // (e.g. the background burner scanner raced this reshield). Then poll allowance to propagate.
        await sendBurnerResilient(bw, provider, bState.address, { to: prep.approveTx.to, data: prep.approveTx.data, gasLimit: BigInt(80000), ...swGasOv })
        const tokenC = new ethers.Contract(prep.approveTx.to, ['function allowance(address,address) view returns (uint256)'], provider)
        for (let i = 0; i < 20; i++) {
          try { if ((await tokenC.allowance(bState.address, prep.to)) >= destRaw) break } catch { /* transient */ }
          await new Promise(r => setTimeout(r, 2500))
        }
      }
      await sendBurnerResilient(bw, provider, bState.address, { to: prep.to, data: prep.data, value: BigInt(prep.value || '0'), gasLimit: BigInt(1600000), ...swGasOv })

      setStep(swapSteps.length)
      setStatus(`Swapped to private! +${destAmount} ${destSym} in your private balance`)
      setSwapAmount('')
      setPrivateBalanceChanged(prev => prev + 1)
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err)
      // Only claim "funds safe on burner" when funds ACTUALLY reached the burner. A failure before
      // funding (e.g. relayer rejects the withdraw for insufficient private balance) moved nothing —
      // the private balance is fully intact, so say that instead of a scary (and false) recovery notice.
      const tail = fundedBurner
        ? ' - funds safe on burner, auto-recovery will retry'
        : ' - nothing moved, your private balance is unchanged'
      setStepper(prev => prev ? { ...prev, error: `${m}${tail}` } : null)
      setStatus('')
      // Kick the stuck-burner scanner so recovery kicks in automatically — WITHOUT this, a failed swap
      // left the funds on the burner and the scanner never re-ran (its deps only change on success),
      // so the user had to manually refresh. Bumping the trigger re-runs the scan + auto-resume.
      setPrivateBalanceChanged(prev => prev + 1)
    } finally {
      setIsTrading(false)
    }
  }

  const handleDisconnect = async () => {
    setStoredSig(null)
    authSigRef.current = null
    await Promise.all(connections.map(c => disconnectAsync({ connector: c.connector })))
      .catch(err => console.error('Error disconnecting wallet:', err))
  }

  // ETH token selector (token switch)
  // Origin pool toggle: ETH pool / USDC pool (the token shielded in the private balance)
  const PoolToggle = () => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: '0.75em', color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '-0.02em' }}>Private asset:</span>
      <div style={{ display: 'inline-flex', gap: 3, background: 'var(--color-bg3)', borderRadius: 'var(--radius-pill)', padding: 3, border: '1px solid var(--color-border)' }}>
        {CHAIN_POOLS[activeChain].pools.map(p => (
          <div
            key={p}
            onClick={() => setActivePool(p)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '5px 12px', borderRadius: 'var(--radius-pill)',
              background: activePool === p ? 'var(--color-primary)' : 'transparent',
              color: activePool === p ? 'var(--color-on-primary)' : 'var(--color-muted)',
              fontFamily: 'var(--font-mono)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '-0.02em',
              transition: 'background 0.2s ease, color 0.2s ease',
            }}
          >
            <img src={poolMeta[p].logo} style={{ width: 16, height: 16, borderRadius: 8 }} alt={poolMeta[p].symbol} />
            <span>{poolMeta[p].symbol}</span>
          </div>
        ))}
      </div>
    </div>
  )

  // Destination asset dropdown (swap/bridge). options = 1Click keys. showChain = show the chain badge.
  // Amount input (input + MAX + token switch)
  // Shared deposit box (used by Send/Swap/Bridge). Header row + collapsible toggle.
  const DepositRow = () => (
    isConnected && storedSig ? (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4, position: 'relative', zIndex: 1 }}>
        <span className="withdraw_max" style={{ cursor: 'pointer', padding: '2px 6px' }} onClick={() => setShowDeposit(true)}>+ Top up {poolSym}</span>
      </div>
    ) : null
  )
  const DepositBox = () => (
    <DepositModal
      open={showDeposit && isConnected && !!storedSig}
      onClose={() => setShowDeposit(false)}
      poolSym={poolSym}
      amount={depositAmount}
      setAmount={setDepositAmount}
      onDeposit={handleDeposit}
      busy={isTrading}
      txHash={depositTx ?? undefined}
      walletBalance={depositWalletBalance}
      status={status ?? undefined}
      chainLabel={CHAIN_POOLS[activeChain].label}
    />
  )

  const ActionButton = ({ label, onClick }: { label: string, onClick?: () => void }) => {
    if (!isConnected) {
      return <EvmWalletSelector cb={() => { }} render={(open: () => void) => (
        <button className="btn btn-primary" onClick={open}>
          <WalletIcon /><span>Connect Wallet</span>
        </button>
      )} />
    }
    if (!storedSig) {
      return (
        <button className="btn btn-primary" onClick={handleSign}>
          <WalletIcon /><span>Sign In</span>
        </button>
      )
    }
    return (
      <button className={isTrading ? "btn btn-primary-submitting" : "btn btn-primary"} onClick={onClick} disabled={isTrading || isUpdatingBalance}>
        <span>{label}</span>
      </button>
    )
  }

  return (
    <div className="container" style={{ minHeight: '100vh', position: 'relative' }}>
      <LightRays />
      {/* ===== NAVBAR ===== */}
      <div className="navbar" style={{ position: 'fixed' }}>
        <a href="https://blackpool.cash/" style={{ fontWeight: 700, fontSize: 20, color: 'white', letterSpacing: '0.5px', textDecoration: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }} title="BLACKPOOL home">
          <img src="/mark.svg" alt="" style={{ width: 24, height: 24, flexShrink: 0 }} />
          <span className="brand_text">Blackpool</span>
        </a>
        <div className="top_right">
          <ChainSwitcher />
          {!isConnected ? (
            <EvmWalletSelector cb={() => { }} render={(open: () => void) => (
              <button className="btn btn-primary btn-sm" onClick={open}>
                <WalletIcon /><span>Connect Wallet</span>
              </button>
            )} />
          ) : (
            <UserPanel address={address as string} onDisconnect={handleDisconnect} chainLabel={CHAIN_POOLS[activeChain].label} />
          )}
        </div>
      </div>

      {/* ===== MAIN ===== */}
      <main className="app_main" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, paddingTop: 130, paddingBottom: 40, position: 'relative', zIndex: 1 }}>
        <div className="card" style={{ position: 'relative', minWidth: 'min(350px, 100%)' }}>
          {/* Tabs floating above card */}
          <div style={{ position: 'absolute', top: -41, left: 0 }}>
            <div role="tablist" aria-label="Action" className="app_tabs" style={{ display: 'flex', gap: 5, paddingLeft: 20, alignItems: 'flex-end' }}>
              <div role="tab" tabIndex={0} aria-selected={tab === 'send'} className={tab === 'send' ? 'withdraw_card_head_active' : 'withdraw_card_head_inactive'} style={{ cursor: 'pointer' }} onClick={() => setTab('send')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTab('send') } }}>Send Privately</div>
              {isSwapSupported(activeChain) && (
                <div role="tab" tabIndex={0} aria-selected={tab === 'swap'} className={tab === 'swap' ? 'withdraw_card_head_active' : 'withdraw_card_head_inactive'} style={{ cursor: 'pointer' }} onClick={() => setTab('swap')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTab('swap') } }}>Swap</div>
              )}
              <div role="tab" tabIndex={0} aria-selected={tab === 'bridge'} className={tab === 'bridge' ? 'withdraw_card_head_active' : 'withdraw_card_head_inactive'} style={{ cursor: 'pointer' }} onClick={() => setTab('bridge')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTab('bridge') } }}>Private bridge</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 5 }}>
            {/* ===== BRIDGES IN FLIGHT (they finish even if the tab was closed) ===== */}
            <BridgeWatch enabled={isConnected && !!storedSig} getAuthSig={getRegistryAuthSig} labelOf={assetLabel} refreshKey={privateBalanceChanged} hidden={!!stepper} />
            {/* ===== STUCK-FUNDS RECOVERY BANNER ===== */}
            {burnerSigMismatch && !stuckBurner && !stepper && (
              <div style={{ background: 'rgba(255,180,80,0.08)', border: '1px solid rgba(255,180,80,0.4)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, color: '#ffb450', fontWeight: 600 }}>Funds found - signature mismatch</div>
                <div style={{ fontSize: 12, color: '#c7cfdb', lineHeight: 1.4 }}>
                  A previous swap left funds on a burner in this browser (<span style={{ fontFamily: 'monospace', fontSize: 11 }}>{burnerSigMismatch.slice(0, 10)}…{burnerSigMismatch.slice(-6)}</span>), but your wallet returned a different sign-in signature this time, so this session can&apos;t unlock it. Re-sign to try again - some wallets need a couple of tries to produce the original signature.
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => { setStoredSig(null); handleSign() }} style={{ alignSelf: 'flex-start' }}>
                  <span>Re-sign to recover</span>
                </button>
              </div>
            )}
            {stuckBurner && !stepper && (
              <div style={{ background: 'rgba(145,255,163,0.08)', border: '1px solid rgba(145,255,163,0.35)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, color: '#91ffa3', fontWeight: 600 }}>Recovering stuck funds…</div>
                <div style={{ fontSize: 12, color: '#c7cfdb', lineHeight: 1.4 }}>
                  A previous swap left <b>{stuckBurner.display} {stuckBurner.sym}</b> on your one-time burner. Finishing it automatically - your {stuckBurner.sym} will land in your private balance. You can also tap below to retry.
                </div>
                <button className="btn btn-primary btn-sm" disabled={isTrading} onClick={() => { recoverBurner(stuckBurner.pool, stuckBurner.raw, stuckBurner.privateKey, stuckBurner.chain).catch(() => {}) }} style={{ alignSelf: 'flex-start' }}>
                  <span>{isTrading ? 'Recovering…' : `Recover ${stuckBurner.display} ${stuckBurner.sym}`}</span>
                </button>
              </div>
            )}
            {/* ===== SEND PRIVATELY ===== */}
            {tab === 'send' && (
              <div className="tab-col">
                {PoolToggle()}
                <div>
                  {wrongNetwork && (
                    <div className="net-banner">
                      <span>Your wallet is on an unsupported network. Blackpool pools live on Robinhood Chain, Base, Arbitrum and BNB Chain.</span>
                      <button type="button" onClick={() => switchTo(activeChainId)}>Switch to {CHAIN_POOLS[activeChain].label}</button>
                    </div>
                  )}
                  <div className="balance-row">
                    {isConnected && storedSig ? (
                      // When the balance read FAILED we must not render a number. Showing "0" for an
                      // unreadable balance is what made an on-chain BSC deposit look lost to its owner.
                      balanceError ? (
                        <span style={{ color: '#f59e0b' }} title={balanceError}>
                          Balance unavailable — your funds are safe on-chain, the indexer is catching up. Retry in a moment.
                        </span>
                      ) : (
                        <span>
                          Private: {privateBalance} {poolSym} ({utxoCount} UTXO{utxoCount === 1 ? '' : 's'}){isUpdatingBalance ? ' ...' : ''}
                        </span>
                      )
                    ) : (
                      <span style={{ color: 'var(--color-muted)' }}>Connect wallet to see your private balance</span>
                    )}
                  </div>
                  <div className="field-col">
                    <AmountInput
                      value={withdrawAmount}
                      onChange={setWithdrawAmount}
                      onMax={() => setWithdrawAmount(privateBalanceRaw)}
                      token={poolSym}
                      logo={poolMeta[activePool].logo}
                    />
                  </div>
                  {DepositRow()}
                </div>

                {DepositBox()}

                <div>
                  <div style={{ marginTop: 0, display: 'flex', gap: 5 }}>
                    <input spellCheck={false} className="input" placeholder="Recipient address" value={withdrawRecipient} onChange={(e) => setWithdrawRecipient(e.target.value)} />
                    {recipient2 === null && (
                      <button className="btn btn-sm" title="Add second recipient (max 2)" onClick={() => setRecipient2('')}>
                        <div className="icon">
                          <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M4 12H20M12 4V20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                        </div>
                      </button>
                    )}
                  </div>
                  {/* second recipient ("+" style, max 2 — the circuit has 2 outputs). Amount per recipient. */}
                  {recipient2 !== null && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                      <div style={{ fontSize: '0.8em', color: '#999' }}>Recipients (amount each):</div>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <input spellCheck={false} className="input" placeholder="0.00" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value.replace(',', '.'))} style={{ maxWidth: 110 }} />
                        <input spellCheck={false} className="input" placeholder="Recipient 1 address" value={withdrawRecipient} onChange={(e) => setWithdrawRecipient(e.target.value)} />
                      </div>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <input spellCheck={false} className="input" placeholder="0.00" value={withdrawAmount2} onChange={(e) => setWithdrawAmount2(e.target.value.replace(',', '.'))} style={{ maxWidth: 110 }} />
                        <input spellCheck={false} className="input" placeholder="Recipient 2 address" value={recipient2} onChange={(e) => setRecipient2(e.target.value)} />
                        <button className="btn btn-sm" title="Remove" onClick={() => { setRecipient2(null); setWithdrawAmount2('') }}>
                          <div className="icon"><svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M6 12H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"></path></svg></div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <ActionButton label="Send Privately" onClick={handleWithdraw} />
                {withdrawTx && (
                  <TxResult
                    entries={[
                      { label: `Source (${withdrawChain})`, chain: withdrawChain, hash: withdrawTx },
                      ...(bridgeDestTx ? [{ label: `Destination (${bridgeDestTx.chain})`, chain: bridgeDestTx.chain, hash: bridgeDestTx.hash }] : []),
                    ]}
                  />
                )}
                <div className="spacer-10"> </div>
              </div>
            )}

            {/* ===== SWAP (private: origin pool token -> dest token, same chain Base) ===== */}
            {tab === 'swap' && (
              <div className="tab-col">
                {PoolToggle()}
                <div>
                  <div className="balance-row">
                    <span>{isConnected && storedSig ? `Private: ${privateBalance} ${poolSym}` : ''}</span>
                    <SlippageControl value={slippage} onChange={setSlippage} />
                  </div>
                  <div className="field-col">
                    <AmountInput value={swapAmount} onChange={setSwapAmount} onMax={() => setSwapAmount(privateBalanceRaw)} token={poolSym} logo={poolMeta[activePool].logo} />
                  </div>
                  {DepositRow()}
                </div>
                {DepositBox()}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, margin: '8px 0', padding: '10px 12px', borderRadius: 10, border: '1px solid rgb(75,85,99)' }}>
                  <div style={{ color: 'rgb(153,153,153)' }}>
                    {swapQuote
                      ? `≈ ${swapQuote.amountOut} ${swapQuote.symbol}`
                      : `Swap to private ${swapDestMeta.symbol}`}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#ccc' }}>
                    <img src={swapDestMeta.logo} style={{ width: 20, height: 20 }} alt="" />
                    <span>{swapDestMeta.symbol}</span>
                  </div>
                </div>
                <div style={{ fontSize: '0.78em', color: '#8b93a1', padding: '0 2px 4px', lineHeight: 1.4 }}>
                  {`Result stays private - ${swapDestMeta.symbol} lands in your private balance via a one-time burner wallet. No recipient needed.`}
                </div>
                <ActionButton label={`Swap to private ${swapDestMeta.symbol}`} onClick={runSwapPrivate} />
                <div className="spacer-10"> </div>
              </div>
            )}

            {/* ===== BRIDGE (private: origin pool token -> dest chain+token via NEAR Intents) ===== */}
            {tab === 'bridge' && (
              <div className="tab-col">
                {PoolToggle()}
                <div>
                  <div className="balance-row">
                    <span>{isConnected && storedSig ? `Private: ${privateBalance} ${poolSym}` : ''}</span>
                    <SlippageControl value={slippage} onChange={setSlippage} />
                  </div>
                  <div className="field-col">
                    <AmountInput value={bridgeAmount} onChange={setBridgeAmount} onMax={() => setBridgeAmount(privateBalanceRaw)} token={poolSym} logo={poolMeta[activePool].logo} />
                  </div>
                  {DepositRow()}
                </div>
                {DepositBox()}
                <div style={{ marginBottom: 0, borderRadius: 8, border: `1px solid ${bridgeUnavailable ? 'rgb(180,90,60)' : 'rgb(75,85,99)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 15 }}>
                  <div style={{ color: bridgeUnavailable ? '#ff9b6b' : 'rgb(153,153,153)' }}>
                    {bridgeUnavailable
                      ? `${ASSET_LABELS[bridgeToAsset]?.chain} route temporarily unavailable`
                      : bridgeChecking
                        ? 'Checking route…'
                        : bridgeQuote
                          ? `≈ ${bridgeQuote.amountOut} ${bridgeQuote.symbol} on ${ASSET_LABELS[bridgeToAsset]?.chain} (est ${bridgeQuote.timeEstimate}s)`
                          : `Privately bridge to ${ASSET_LABELS[bridgeToAsset]?.chain}`}
                  </div>
                  <AssetDropdown value={bridgeToAsset} onChange={setBridgeToAsset} options={activeChain === 'robinhood' ? BRIDGE_DESTINATIONS_FROM_RH : activeChain === 'arbitrum' ? BRIDGE_DESTINATIONS_FROM_ARB : activeChain === 'bsc' ? BRIDGE_DESTINATIONS_FROM_BSC : BRIDGE_DESTINATIONS_FROM_BASE} showChain />
                </div>
                {bridgeUnavailable && (
                  <div style={{ fontSize: '0.76em', color: '#c98', padding: '2px 2px 0', lineHeight: 1.4 }}>
                    No route for this pair right now. Try a different token/chain, or check back shortly.
                  </div>
                )}
                {bridgeLimit && !bridgeUnavailable && (
                  <div role="status" style={{ fontSize: '0.76em', color: '#ffb450', padding: '2px 2px 0', lineHeight: 1.4 }}>
                    {bridgeLimit}
                  </div>
                )}
                <div style={{ marginBottom: 0 }}>
                  <input className="input" placeholder={`Recipient ${ASSET_LABELS[bridgeToAsset]?.chain} address`} value={bridgeRecipient} onChange={(e) => setBridgeRecipient(e.target.value)} />
                </div>
                {NON_EVM_DESTS.includes(bridgeToAsset) && (
                  <div style={{ fontSize: '0.76em', color: 'var(--color-muted)', padding: '2px 2px 0', lineHeight: 1.4 }}>
                    If the solver cannot complete the swap, the refund goes to your connected wallet on {CHAIN_POOLS[activeChain].label}.
                  </div>
                )}
                {bridgeUnavailable || bridgeLimit ? (
                  <button className="btn btn-primary" disabled style={{ width: '100%', opacity: 0.5, cursor: 'not-allowed' }}>
                    <span>{bridgeUnavailable ? 'Route unavailable' : 'Below the route minimum'}</span>
                  </button>
                ) : (
                  <ActionButton label="Private bridge" onClick={() => handleIntent()} />
                )}
                <div className="spacer-10"> </div>
              </div>
            )}

            {/* status line */}
            {status && (
              <div style={{ fontSize: '0.8em', textAlign: 'center', padding: '7px 0', color: '#91ffa3' }}>
                <center>{status}</center>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Stepper progress modal (send/swap/bridge) */}
      {stepper && (
        <StepperModal steps={stepper.steps} activeStep={stepper.active} error={stepper.error} info={stepper.info} onClose={() => setStepper(null)} onDismiss={() => setStepper(null)} />
      )}

      {/* ===== FOOTER ===== */}
      <div className="footer" style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/docs" aria-label="Blackpool documentation">
            <div className="icon_btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }} aria-hidden="true">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
              <span>Docs</span>
            </div>
          </a>
          <a href={explorerHomeUrl(CHAIN_POOLS[activeChain].label)} target="_blank" rel="noopener noreferrer" aria-label={`View on ${explorerName(CHAIN_POOLS[activeChain].label)}`}>
            <div className="icon_btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }} aria-hidden="true">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.3-4.3"/>
              </svg>
              <span>Explorer</span>
            </div>
          </a>
          <a href="https://github.com/blackpooldev/blackpool" target="_blank" rel="noopener noreferrer" aria-label="Blackpool on GitHub">
            <div className="icon_btn">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ marginRight: 4 }} aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              <span>GitHub</span>
            </div>
          </a>
          <a href="/recover" aria-label="Recover stuck funds">
            <div className="icon_btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }} aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><polyline points="3 3 3 9 9 9" /></svg>
              <span>Recover</span>
            </div>
          </a>
          <a href="/agents" aria-label="Blackpool for AI agents">
            <div className="icon_btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }} aria-hidden="true"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
              <span>Agents</span>
            </div>
          </a>
          <a href="/status" aria-label="Service status">
            <div className="icon_btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }} aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              <span>Status</span>
            </div>
          </a>
          <a href="/analytics" aria-label="Blackpool on-chain analytics">
            <div className="icon_btn">
              {/* chart line icon (matches 📈 shape) - currentColor picks up navbar theme like other footer icons */}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }} aria-hidden="true">
                <polyline points="3 17 9 11 13 15 21 7"/>
                <polyline points="14 7 21 7 21 14"/>
              </svg>
              <span>Analytics</span>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}

// The sign-in signature derives EVERY key (account + all burners), so it MUST NOT be persisted to
// disk. Persisting it in browser storage would let anyone with access to the browser profile drain
// funds. We keep it in an in-memory module store only: it survives re-renders and navigation within
// the session, but is gone on refresh/tab-close. Signing is deterministic for EOAs, so re-signing
// after a refresh yields the IDENTICAL signature — same account, same burners, fully device-portable,
// with zero secret material ever written to disk.
const _sigStore = new Map<string, string>()
function getStoredSignature(address: string): string | null {
  return _sigStore.get(address.toLowerCase()) ?? null
}
function saveSignature(address: string, signature: string): void {
  _sigStore.set(address.toLowerCase(), signature)
  zkWarm() // fetch the proving key in the background so the first proof does not wait for it
}

// ===== Top-level stable components (do NOT define inside Home — remounting on every render closes the keyboard on mobile) =====
function TokenSwitch({ symbol, logo }: { symbol: string, logo: string }) {
  // Static token badge (ETH/USDC) - not a dropdown, so no chevron. Pill button style.
  return (
    <div style={{ position: 'relative' }}>
      <div className="token_switch">
        <div className="token_switch_option_selected">
          <img src={logo} alt={symbol} /><span>{symbol}</span>
        </div>
      </div>
    </div>
  )
}

function AmountInput({ value, onChange, onMax, token = 'ETH', logo = '/token_logos/eth.png' }: {
  value: string, onChange: (v: string) => void, onMax?: () => void, token?: string, logo?: string
}) {
  // `value` is ALWAYS the canonical token amount (what the tx uses). When the user toggles to USD
  // (fiat) mode, we display/accept a USD figure and convert back to token on every keystroke so the
  // parent state never leaves token units. Toggling never mutates the stored amount — only the view.
  const { usdPrice } = useUsdPrice(token)
  const [fiatMode, setFiatMode] = useState(false)
  // In fiat mode the input carries its OWN string (what the user typed in USD); the parent still
  // stores the derived token amount. Keeping a local string avoids re-deriving (and cursor-jumping)
  // the USD text from the rounded token value on every keystroke.
  const [fiatText, setFiatText] = useState('')

  const num = parseFloat(value)
  const hasVal = value !== '' && !isNaN(num)
  // Secondary line under the input shows the OTHER unit than the one being typed.
  const secondary = !fiatMode
    ? (hasVal && usdPrice != null ? fmtUsd(num * usdPrice) : (usdPrice == null ? '—' : '$0'))
    : (hasVal ? `${(+num.toPrecision(8))} ${token}` : `0 ${token}`)

  const onInput = (raw: string) => {
    const v = raw.replace(',', '.')
    if (!fiatMode) { onChange(v); return }
    // fiat mode: keep the raw USD text locally, store the token-equivalent in the parent
    setFiatText(v)
    if (v === '' || !usdPrice) { onChange(''); return }
    const usd = parseFloat(v)
    if (isNaN(usd)) return
    onChange((usd / usdPrice).toString())
  }

  const toggle = () => {
    if (!usdPrice) return
    setFiatMode(m => {
      const next = !m
      // when switching INTO fiat, seed the fiat text from the current token value
      if (next) setFiatText(hasVal ? (num * usdPrice).toFixed(2) : '')
      return next
    })
  }

  // Prefix shown before the big number when typing in USD mode.
  const bigPrefix = fiatMode ? '$' : ''

  return (
    <div className="amount_box">
      {/* token/max selector — top-right inside the box */}
      <div className="amount_box_opt">
        <div className="withdraw_max" onClick={onMax}> MAX </div>
        <TokenSwitch symbol={token} logo={logo} />
      </div>
      {/* big amount line */}
      <div className="amount_box_main">
        {bigPrefix && <span className="amount_box_prefix">{bigPrefix}</span>}
        <input
          className="amount_box_input"
          placeholder="0.00"
          inputMode="decimal"
          value={fiatMode ? fiatText : value}
          onChange={(e) => onInput(e.target.value)}
        />
      </div>
      {/* conversion line + ⇅ toggle — inside the box, under the number (matches reference UI) */}
      <div className="amount_box_conv">
        <span className="amount_box_conv_txt">{secondary}</span>
        <button
          onClick={toggle}
          disabled={!usdPrice}
          className="amount_box_swap"
          title={usdPrice ? `Switch to ${fiatMode ? token : 'USD'} input` : 'Price unavailable'}
          style={{ cursor: usdPrice ? 'pointer' : 'default', opacity: usdPrice ? 1 : 0.4 }}
        >
          <SwapVertIcon />
        </button>
      </div>
    </div>
  )
}

// Vertical swap arrows (⇅) — the fiat/token toggle affordance.
function SwapVertIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-fg2)' }}>
      <path d="M7 4v16M7 4l-3 3M7 4l3 3" />
      <path d="M17 20V4M17 20l-3-3M17 20l3-3" />
    </svg>
  )
}

// Destination asset dropdown (bridge). Hoisted to top level (uses useState -> MUST be a JSX component, not a function call).
function AssetDropdown({ value, onChange, options, showChain = false }: {
  value: string, onChange: (v: string) => void, options: string[], showChain?: boolean
}) {
  const [open, setOpen] = useState(false)
  const cur = ASSET_LABELS[value]
  // Close on Escape + lock body scroll while the panel is open (matches native picker behavior on mobile).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open])
  return (
    <div className="asset_dropdown">
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 14px', borderRadius: 'var(--radius-pill)', background: 'var(--color-bg3)', border: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '-0.02em', transition: 'background 0.2s ease, border-color 0.2s ease' }}>
        <div style={{ position: 'relative', width: 22, height: 22 }}>
          <img src={cur?.logo} style={{ width: 22, height: 22, borderRadius: 11 }} alt={cur?.symbol} />
          {showChain && <img src={cur?.chainLogo} style={{ position: 'absolute', width: 12, height: 12, borderRadius: 6, bottom: -4, right: -4, border: '1.5px solid var(--color-bg3)' }} alt={cur?.chain} />}
        </div>
        <span style={{ fontWeight: 500, color: 'var(--color-fg1)' }}>{cur?.symbol}</span>
        <ChevronIcon />
      </div>
      {open && (
        <>
          {/* backdrop — mobile only via CSS; on desktop the dropdown is anchored inline */}
          <div className="asset_dropdown_backdrop" onClick={() => setOpen(false)} />
          <div className="asset_dropdown_panel">
            <div className="asset_dropdown_head">
              <span>Select asset</span>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ all: 'unset', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 20, lineHeight: 1, padding: '2px 6px' }}>×</button>
            </div>
            <div className="asset_dropdown_list">
              {options.map(k => {
                const a = ASSET_LABELS[k]
                const active = k === value
                return (
                  <div
                    key={k}
                    onClick={() => { onChange(k); setOpen(false) }}
                    className="wallet-item"
                    style={{ padding: '10px 12px', ...(active ? { background: 'var(--color-bg3)' } : {}) }}
                  >
                    <div style={{ position: 'relative', width: 24, height: 24 }}>
                      <img src={a.logo} style={{ width: 24, height: 24, borderRadius: 12 }} alt={a.symbol} />
                      {showChain && <img src={a.chainLogo} style={{ position: 'absolute', width: 12, height: 12, borderRadius: 6, bottom: -3, right: -3, border: '1.5px solid var(--color-bg1)' }} alt={a.chain} />}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{a.symbol}</span>
                    {showChain && <span style={{ fontSize: 12, color: 'var(--color-fg3)', marginLeft: 'auto' }}>{a.chain}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const normalizeTxValue = (value: unknown): bigint => {
  if (value == null) return BigInt(0)
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') return BigInt(value)
  if (typeof value === 'string') return BigInt(value)
  return BigInt(String(value))
}
