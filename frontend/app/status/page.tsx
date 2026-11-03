import SubPage from "../components/SubPage";
import StatusView from "./StatusView";

export const metadata = {
  title: "Status — Blackpool",
  description: "Live status of the Blackpool relayer API, indexer, relayer gas and chain RPCs.",
};

export default function Status() {
  return (
    <SubPage
      sub="Status"
      title="Status"
      lead="Checked live from your browser each time this page loads: the relayer API, the indexer behind balances and analytics, relayer gas on every chain, and the public RPC of each chain."
    >
      <StatusView />
    </SubPage>
  );
}
