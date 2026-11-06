// Blackpool products, shown in the landing nav's Product menu (desktop dropdown and mobile drawer).
export const PRODUCT_GROUPS = [
  {
    title: "Private payments",
    items: [
      { k: "shield", c: "#34C77B", t: "Shield", d: "Move ETH, USDC, USDG or BNB into your private balance.", h: "/app" },
      { k: "send", c: "#5B8DEF", t: "Private send", d: "Pay any address. The relayer pays the gas.", h: "/app?tab=send" },
      { k: "swap", c: "#E9A23B", t: "Private swap", d: "Swap between the native coin and the stablecoin inside the pool.", h: "/app?tab=swap" },
      { k: "intents", c: "#8F7BF2", t: "Private bridge", d: "Move value across four EVM chains and Solana.", h: "/app?tab=bridge" },
    ],
  },
  {
    title: "Tools",
    items: [
      { k: "cli", c: "#EBECEC", t: "Agents & CLI", d: "Pay from scripts and AI agents. MCP server included.", h: "/agents" },
      { k: "recover", c: "#EF5B5B", t: "Recovery", d: "Bring funds on a one-time burner back to your balance.", h: "/recover" },
      { k: "chart", c: "#3FB8C9", t: "Analytics", d: "Public pool volume and activity by day.", h: "/analytics" },
      { k: "pulse", c: "#6E7074", t: "Status", d: "Live health of the API, the indexer and every chain.", h: "/status" },
    ],
  },
  {
    title: "Learn",
    items: [
      { k: "route", c: "#27A563", t: "Private payments by chain", d: "Pools, fees and minimums on every chain.", h: "/private-payments" },
      { k: "docs", c: "#5B8DEF", t: "Send crypto privately", d: "Pay without exposing your wallet.", h: "/guides/send-crypto-privately" },
      { k: "cli", c: "#E9A23B", t: "Payments for AI agents", d: "Give an agent a private wallet over MCP.", h: "/guides/private-payments-for-ai-agents" },
    ],
  },
];
