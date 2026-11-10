// The Blackpool token. Every page reads it from here. It stays hidden until launch (the live flag below);
// ops/token-launch.sh fills in the on-chain details, flips live and moves app/_token to app/token.
export const TOKEN = {
  live: true,
  spotlight: true, // while live, the landing pill shows the token instead of the changelog highlights
  ticker: "BP",
  name: "BLACKPOOL",
  chain: "Robinhood Chain",
  chainId: 4663,
  address: "0xB6F2e3D5f9F1BFb0363f3aECEC26B5B9bdbeEdC1",
  decimals: 18,
  launchpad: "Orbio",
  buyUrl: "https://www.orbio.so/launchpad",
  launchDate: "Nov 10, 2026", // "Nov 20, 2026"
  launchIso: "2026-11-10", // "2026-11-20"
};

export const tokenExplorerUrl = (a: string) => `https://robin.etherscan.io/token/${a}`;
export const tokenChartUrl = (a: string) => `https://dexscreener.com/robinhood/${a}`;
