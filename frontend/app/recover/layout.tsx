import type { ReactNode } from "react";
import { pageMeta } from "../components/seo";

export const metadata = pageMeta(
  "/recover",
  "Recover stuck funds — Blackpool",
  "Find and sweep back anything left on Blackpool one-time addresses, using only a signature from the wallet you used. Also lists your private bridges and their status.",
);

export default function RecoverLayout({ children }: { children: ReactNode }) {
  return children;
}
