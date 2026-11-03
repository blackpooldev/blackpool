// Hardhat 3: compile, test and deploy the pool contracts. The API and indexer do not use Hardhat at runtime.
import { configVariable, defineConfig } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatEthersChaiMatchers from "@nomicfoundation/hardhat-ethers-chai-matchers";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import hardhatNetworkHelpers from "@nomicfoundation/hardhat-network-helpers";
import hardhatVerify from "@nomicfoundation/hardhat-verify";

// The deployer key for live networks is read from the DEPLOYER_KEY environment variable at use time, never stored here.
const live = (url: string, chainId: number) => ({
  type: "http" as const,
  chainType: "generic" as const,
  chainId,
  url,
  accounts: [configVariable("DEPLOYER_KEY")],
});

export default defineConfig({
  plugins: [hardhatEthers, hardhatEthersChaiMatchers, hardhatMocha, hardhatNetworkHelpers, hardhatVerify],
  solidity: {
    // Same compiler and settings the live pools were built with.
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris", outputSelection: { "*": { "*": ["storageLayout"] } } },
  },
  networks: {
    default: {
      type: "edr-simulated",
      chainType: "l1",
      chainId: 1,
      hardfork: "cancun",
      initialBaseFeePerGas: 5,
      blockGasLimit: 100_000_000n,
      allowUnlimitedContractSize: false,
    },
    localhost: { type: "http", chainType: "l1", url: "http://127.0.0.1:8545" },
    base: live("https://mainnet.base.org", 8453),
    robinhood: live("https://rpc.mainnet.chain.robinhood.com", 4663),
    arbitrum: live("https://arb1.arbitrum.io/rpc", 42161),
    bsc: live("https://bsc-dataseed.bnbchain.org", 56),
  },
  test: { mocha: { timeout: 600_000 } },
});
