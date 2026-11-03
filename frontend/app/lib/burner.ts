'use client'
import { Wallet, keccak256, toUtf8Bytes, getBytes, concat, type Provider } from 'ethers'

// Ephemeral swap burner (fresh random wallet per action) + non-custodial recovery registry.
//
// DESIGN (2026-07-10 rewrite — replaces the derived-nonce/scan-20 design that caused slot exhaustion
// and stranded funds at high nonces outside the recovery scan range):
//
//   • Each swap uses a FRESH RANDOM wallet (unlimited — no "slots", never "stuck").
//   • The burner privkey is encrypted CLIENT-SIDE (WebCrypto AES-256-GCM under keccak256(sign-in sig))
//     and pushed to the backend registry as ciphertext. The backend never sees plaintext.
//   • Recovery from ANY device: re-sign the two fixed messages, fetch the registry rows, decrypt
//     locally, sweep. No browser storage, fully device-portable, non-custodial.

const API = process.env.NEXT_PUBLIC_API_URL || 'https://blackpool-api.fly.dev'

// MUST be byte-identical to src/burnerRegistry.js REGISTRY_AUTH_MESSAGE on the backend — the backend
// ecrecovers a signature over this exact string to authenticate the owner. Distinct from the sign-in
// message on purpose (signing this does NOT reveal the encryption key).
export const REGISTRY_AUTH_MESSAGE =
  'Blackpool Registry\n\nAuthorize access to your encrypted recovery data.\nThis does not move funds and does not expose your account keys.'

// Single wallet prompt: the registry-auth signature is NOT requested from the wallet. It is produced by a key
// derived from the sign-in signature — keccak256(signInSig || "blackpool/registry-auth/v1") — so the user signs
// once and the backend still only ever learns address(registryKey), from which neither the sign-in signature nor
// the AES key keccak256(signInSig) can be recovered. Byte-identical to src/registryAuth.js on the backend.
export const REGISTRY_AUTH_DOMAIN = 'blackpool/registry-auth/v1'
export function registryKeyFromSignIn(signInSig: string): string {
  return keccak256(concat([getBytes(signInSig), toUtf8Bytes(REGISTRY_AUTH_DOMAIN)]))
}
export async function registryAuthSigFromSignIn(signInSig: string): Promise<string> {
  return new Wallet(registryKeyFromSignIn(signInSig)).signMessage(REGISTRY_AUTH_MESSAGE)
}

export interface BurnerState {
  privateKey: string
  address: string
  createdAt: number
  userAddress: string
}

// ---- WebCrypto AES-256-GCM (browser). Format: [iv(12)] + [ciphertext||authTag]. Self-consistent:
// the same code encrypts (on swap) and decrypts (on recovery). Backend stores/returns ciphertext only.
async function aesKeyFromSignIn(signInSig: string): Promise<CryptoKey> {
  const keyBytes = getBytes(keccak256(getBytes(signInSig))) // 32 bytes = AES-256 key
  return crypto.subtle.importKey('raw', keyBytes as unknown as ArrayBuffer, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
function toHex(u8: Uint8Array): string { return '0x' + Array.from(u8).map(b => b.toString(16).padStart(2, '0')).join('') }
function fromHex(hex: string): Uint8Array {
  const h = hex.replace(/^0x/, '')
  const out = new Uint8Array(h.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16)
  return out
}

export async function encryptBurnerKey(privKeyHex: string, signInSig: string): Promise<string> {
  const key = await aesKeyFromSignIn(signInSig)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const pt = new TextEncoder().encode(privKeyHex)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt))
  const out = new Uint8Array(12 + ct.length)
  out.set(iv, 0); out.set(ct, 12)
  return toHex(out)
}

export async function decryptBurnerKey(encHex: string, signInSig: string): Promise<string> {
  const key = await aesKeyFromSignIn(signInSig)
  const buf = fromHex(encHex)
  const iv = buf.slice(0, 12)
  const ct = buf.slice(12)
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct as unknown as ArrayBuffer))
  return new TextDecoder().decode(pt)
}

// ---- Registry API (auth = signature over the SEPARATE registry message; never the sign-in sig) ----
export async function getRegistryAuthMessage(): Promise<string> {
  const r = await fetch(`${API}/api/burner/auth-message`)
  const j = await r.json()
  return j.message
}

// Create a fresh random ephemeral burner, encrypt its key, and register it BEFORE funding so recovery
// is possible even if the very next step (withdraw to burner) is where things stall. Returns the burner.
export async function createAndRegisterBurner(opts: {
  signInSig: string      // in-memory sign-in signature (derives the encryption key, never sent)
  authSig: string        // signature over the registry auth message (sent, used only to ecrecover owner)
  chain: 'base' | 'robinhood' | 'arbitrum' | 'bsc' | 'arc'
  token?: string         // stablecoin the burner will hold (optional hint for recovery UI)
}): Promise<BurnerState> {
  const w = Wallet.createRandom()
  const encKey = await encryptBurnerKey(w.privateKey, opts.signInSig)
  // best-effort register; a failure here should NOT block the swap (recovery also scans on-chain),
  // but log it so we know. The burner address is deterministic from its own key, so re-register is safe.
  try {
    const r = await fetch(`${API}/api/burner/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authSig: opts.authSig, burnerAddress: w.address, chain: opts.chain, token: opts.token, encKey }),
    })
    if (!r.ok) console.warn('[burner] register failed:', (await r.json().catch(() => ({}))).error)
  } catch (e) { console.warn('[burner] register error:', e) }
  return { privateKey: w.privateKey, address: w.address, createdAt: Date.now(), userAddress: '' }
}

// Fetch the user's registered burners (ciphertext), decrypt each key locally. Cross-device, no LS.
export async function listRecoverableBurners(signInSig: string, authSig: string): Promise<Array<{
  address: string; chain: 'base' | 'robinhood' | 'arbitrum' | 'bsc' | 'arc'; token?: string; privateKey: string; sweptAt?: number
}>> {
  // Follow the cursor until the registry says there is no next page (no cap on burners per wallet).
  const rows: any[] = []
  let before: number | null = null
  for (let i = 0; i < 100; i++) {
    const r: Response = await fetch(`${API}/api/burner/list`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(before ? { authSig, before } : { authSig }),
    })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'registry list failed')
    const j: { burners?: any[]; next?: number | null } = await r.json()
    rows.push(...(j.burners || []))
    if (!j.next) break
    before = j.next
  }
  const out: Array<{ address: string; chain: 'base' | 'robinhood' | 'arbitrum' | 'bsc' | 'arc'; token?: string; privateKey: string; sweptAt?: number }> = []
  for (const row of rows) {
    try {
      const pk = await decryptBurnerKey(row.encKey, signInSig)
      out.push({ address: row.burnerAddress, chain: row.chain, token: row.token, privateKey: pk, sweptAt: row.sweptAt })
    } catch { /* skip rows that don't decrypt (e.g. from a different account) */ }
  }
  return out
}

export async function markBurnerSwept(authSig: string, burnerAddress: string, chain: string): Promise<void> {
  try {
    await fetch(`${API}/api/burner/mark-swept`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authSig, burnerAddress, chain }),
    })
  } catch { /* bookkeeping only */ }
}


export function burnerWallet(state: BurnerState, provider: Provider): Wallet {
  return new Wallet(state.privateKey, provider)
}
