import type { ReactNode } from "react";
import { pageMeta } from "../components/seo";

export const metadata = pageMeta(
  "/app",
  "App: shield, send, swap and bridge privately — Blackpool",
  "Open the Blackpool app: connect a wallet, sign once and move crypto privately on Robinhood Chain, Base, Arbitrum and BNB Chain. Non-custodial, and the relayer pays the gas.",
);

export default function AppLayout({ children }: { children: ReactNode }) {
  return children;
}
