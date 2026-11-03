// One source for the FAQ: the landing shows the entries marked `home`, the docs show all of them.
export type Faq = { q: string; a: string; home?: boolean };

export const FAQ: Faq[] = [
  {
    q: "Where is my proof built?",
    a: "On your device. The web app builds every zero-knowledge proof in a background worker and the CLI builds it in Node. The relayer only receives the finished proof, never your signature or keys. The first proof downloads a 20 MB proving key once; after that a proof takes a few seconds.",
    home: true,
  },
  {
    q: "Can the relayer steal or redirect my payment?",
    a: "No. The recipient, the amount and the fee are fixed inside the proof, so changing any of them makes it invalid. The relayer can only submit the transaction or decline to. It pays the gas and is paid by a fee taken from the amount you move.",
    home: true,
  },
  {
    q: "Do I need gas to send privately?",
    a: "No. The relayer pays gas and the fee is taken from the amount inside the proof. Shielding is the one step paid from your own wallet, because the funds have to come from a public address.",
    home: true,
  },
  {
    q: "Does Blackpool store anything in my browser?",
    a: "No. Nothing goes to cookies, local storage or IndexedDB. Your signature and keys stay in memory and are gone when you close the tab; signing again, on any device, restores the same account.",
    home: true,
  },
  {
    q: "What if I lose my device?",
    a: "Connect the same wallet anywhere and sign once. Your account, notes, burners and bridge history are all derived or re-indexed from that signature.",
  },
  {
    q: "Can the team see my balance?",
    a: "No. Your device downloads the pool's public, encrypted notes and decrypts its own locally. The server never receives your signature or keys, so it cannot tell which notes are yours.",
  },
  {
    q: "Which wallets and chains are supported?",
    a: "Any browser wallet, including MetaMask, Rabby, Coinbase Wallet and the in-app browsers of mobile wallets. Pools: ETH and USDG on Robinhood Chain, ETH and USDC on Base and Arbitrum, BNB, USDC and USDT on BNB Chain. Private bridges reach more destinations, Solana included.",
    home: true,
  },
  {
    q: "What if a swap or bridge gets stuck?",
    a: "Swaps and bridges run through a one-time burner wallet whose key is encrypted in your browser and registered for recovery before any funds move. Open Recover with the same wallet, sign once, and stranded funds are swept back. A bridge the solver cannot deliver is refunded on the origin chain.",
  },
  {
    q: "Why is there a minimum amount?",
    a: "Fees are deducted from each spend; the minimum keeps every spend meaningfully above its own fee.",
  },
  {
    q: "Who controls the contracts?",
    a: "Each pool is an upgradeable contract. Its admin can pause or upgrade it but cannot move notes. Admin control is moving to a multisig, and the contracts have not had an external audit yet, so size your balances accordingly.",
    home: true,
  },
  {
    q: "Is there a Blackpool token?",
    a: "Token details are TBA. Any token will be announced on blackpool.cash and in the official repository first; treat anything else as unofficial.",
  },
  {
    q: "Can AI agents use Blackpool?",
    a: "Yes. The CLI answers in JSON with stable exit codes, runs as an MCP server, and AGENTS.md documents every command, limit and safety rule.",
  },
];
