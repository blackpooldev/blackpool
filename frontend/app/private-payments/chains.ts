// Per-chain landing pages (/private-payments/<slug>). Facts mirror AGENTS.md §5–§6; keep them in step.
export type ChainPage = {
  slug: string;
  name: string;
  short: string; // how the chain is named in running text
  cliChain: string; // --chain value
  about: string; // one sentence about the chain itself
  pools: Array<{ asset: string; minDeposit: string; minSpend: string; flatFee: string }>;
  dex: string;
  bridgeFrom: string[]; // --from origins on this chain
  example: string; // example CLI send
  notes: string[]; // chain-specific facts worth knowing
  title: string; // <title> and H1
  description: string; // meta description
};

export const CHAIN_PAGES: ChainPage[] = [
  {
    slug: "robinhood-chain",
    name: "Robinhood Chain",
    short: "Robinhood Chain",
    cliChain: "robinhood",
    about: "Robinhood Chain is Robinhood's Ethereum layer 2, built on Arbitrum technology, with ETH for gas and USDG as its dollar stablecoin.",
    pools: [
      { asset: "ETH", minDeposit: "0.001 ETH", minSpend: "0.001 ETH", flatFee: "0.00015 ETH" },
      { asset: "USDG", minDeposit: "3 USDG", minSpend: "2 USDG", flatFee: "0.5 USDG" },
    ],
    dex: "Uniswap V3",
    bridgeFrom: ["hood_eth", "hood_usdg"],
    example: "blackpool send 0xRECIPIENT 25 --pool usdg --chain robinhood",
    notes: [
      "USDG is the main stablecoin on Robinhood Chain, so the USDG pool is the natural choice for private dollar payments there.",
      "Private bridges from Robinhood Chain reach Base, Arbitrum, Ethereum, BNB Chain and Solana through NEAR Intents.",
    ],
    title: "Private payments on Robinhood Chain",
    description: "Send ETH and USDG privately on Robinhood Chain. Shield once, then pay any address, swap or bridge with zero-knowledge proofs: no custody, and the relayer pays gas.",
  },
  {
    slug: "base",
    name: "Base",
    short: "Base",
    cliChain: "base",
    about: "Base is Coinbase's Ethereum layer 2, with ETH for gas and USDC as its main stablecoin.",
    pools: [
      { asset: "ETH", minDeposit: "0.001 ETH", minSpend: "0.001 ETH", flatFee: "0.00015 ETH" },
      { asset: "USDC", minDeposit: "3 USDC", minSpend: "2 USDC", flatFee: "1 USDC" },
    ],
    dex: "Uniswap V3",
    bridgeFrom: ["base_eth", "base_usdc"],
    example: "blackpool send 0xRECIPIENT 10 --pool usdc --chain base",
    notes: [
      "Base is the CLI's default chain, so commands without --chain run on Base.",
      "Private bridges from Base reach Robinhood Chain, Arbitrum, Ethereum, BNB Chain and Solana through NEAR Intents.",
    ],
    title: "Private payments on Base",
    description: "Send ETH and USDC privately on Base. Shield once, then pay any address, swap or bridge with zero-knowledge proofs: no custody, and the relayer pays gas.",
  },
  {
    slug: "arbitrum",
    name: "Arbitrum",
    short: "Arbitrum",
    cliChain: "arbitrum",
    about: "Arbitrum One is an Ethereum layer 2 rollup, with ETH for gas and USDC as its main stablecoin.",
    pools: [
      { asset: "ETH", minDeposit: "0.001 ETH", minSpend: "0.001 ETH", flatFee: "0.00015 ETH" },
      { asset: "USDC", minDeposit: "3 USDC", minSpend: "2 USDC", flatFee: "0.5 USDC" },
    ],
    dex: "Uniswap V3",
    bridgeFrom: ["arb_eth", "arb_usdc"],
    example: "blackpool send 0xRECIPIENT 10 --pool usdc --chain arbitrum",
    notes: [
      "Private bridges from Arbitrum reach Robinhood Chain, Base, Ethereum, BNB Chain and Solana through NEAR Intents.",
    ],
    title: "Private payments on Arbitrum",
    description: "Send ETH and USDC privately on Arbitrum. Shield once, then pay any address, swap or bridge with zero-knowledge proofs: no custody, and the relayer pays gas.",
  },
  {
    slug: "bnb-chain",
    name: "BNB Chain",
    short: "BNB Chain",
    cliChain: "bsc",
    about: "BNB Chain (BSC) is an EVM chain with BNB for gas and USDT and USDC as its main stablecoins.",
    pools: [
      { asset: "BNB", minDeposit: "0.01 BNB", minSpend: "0.001 BNB", flatFee: "0.001 BNB" },
      { asset: "USDC", minDeposit: "3 USDC", minSpend: "2 USDC", flatFee: "0.5 USDC" },
      { asset: "USDT", minDeposit: "3 USDT", minSpend: "2 USDT", flatFee: "0.5 USDT" },
    ],
    dex: "PancakeSwap V3",
    bridgeFrom: ["bsc_bnb", "bsc_usdc", "bsc_usdt"],
    example: "blackpool send 0xRECIPIENT 10 --pool usdt --chain bsc",
    notes: [
      "BNB Chain has three pools: BNB, USDC and USDT. Private swaps between BNB and USDT run on PancakeSwap V3; USDC can be shielded, sent and bridged.",
      "Private bridges that start or end on BNB Chain currently need at least about $1,000 per transfer. That minimum is set by the solver network on those routes and is shown before you start.",
    ],
    title: "Private payments on BNB Chain",
    description: "Send BNB, USDT and USDC privately on BNB Chain. Shield once, then pay any address, swap or bridge with zero-knowledge proofs: no custody, and the relayer pays gas.",
  },
];

export const chainBySlug = (slug: string) => CHAIN_PAGES.find((c) => c.slug === slug);
