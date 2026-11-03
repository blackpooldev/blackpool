/* eslint-disable indent, no-undef */
const { extendEnvironment } = require('hardhat/config')
require('@typechain/hardhat')
require('@nomiclabs/hardhat-ethers')
require('@nomiclabs/hardhat-waffle')
require('@nomicfoundation/hardhat-verify')
require('@openzeppelin/hardhat-upgrades')
require('dotenv').config()

function normalizeRpcResult(method, result) {
  if (result == null) {
    return result
  }

  if (method === 'eth_getTransactionByHash' && result.to === '') {
    result.to = null
  }

  if (
    (method === 'eth_getBlockByNumber' || method === 'eth_getBlockByHash') &&
    Array.isArray(result.transactions)
  ) {
    for (const transaction of result.transactions) {
      if (transaction && transaction.to === '') {
        transaction.to = null
      }
    }
  }

  return result
}

extendEnvironment((hre) => {
  const provider = hre.network.provider
  if (provider.__ethersRpcNormalizePatched) {
    return
  }

  const send = provider.send.bind(provider)
  provider.send = async (method, params) =>
    normalizeRpcResult(method, await send(method, params))
  provider.__ethersRpcNormalizePatched = true
})

task('hasher', 'Compile Poseidon hasher', () => {
  require('./scripts/compileHasher')
})

const config = {
  solidity: {
    compilers: [
      {
        version: '0.8.24',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      chainId: 1,
      hardfork: 'cancun',
      initialBaseFeePerGas: 5,
      loggingEnabled: false,
      allowUnlimitedContractSize: false,
      blockGasLimit: 100000000,
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : {
            mnemonic: 'test test test test test test test test test test test junk',
          },
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL || 'https://eth.llamarpc.com',
      chainId: 1,
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : {
            mnemonic: 'test test test test test test test test test test test junk',
          },
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
      chainId: 84532,
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : {
            mnemonic: 'test test test test test test test test test test test junk',
          },
    },
    base: {
      // Public RPC only. Alchemy is not used — has rate-limited us in the past.
      url: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
      chainId: 8453,
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : {
            mnemonic: 'test test test test test test test test test test test junk',
          },
    },
    robinhood: {
      // Robinhood Chain (Arbitrum Orbit L2, ETH gas). Public RPC by default; override with
      // ROBINHOOD_RPC_URL for a provider endpoint. Chain ID 4663 (verified via eth_chainId).
      url: process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com',
      chainId: 4663,
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : {
            mnemonic: 'test test test test test test test test test test test junk',
          },
    },
    arbitrum: {
      // Arbitrum One (chainId 42161, verified via eth_chainId 0xa4b1). Public RPC by default;
      // override with ARBITRUM_RPC_URL for a provider endpoint. ETH gas, EIP-1559.
      url: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
      chainId: 42161,
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : {
            mnemonic: 'test test test test test test test test test test test junk',
          },
    },
    bsc: {
      // BNB Smart Chain (chainId 56). Public RPC by default; override with BSC_RPC_URL.
      // BNB gas, legacy gas pricing. Native token = BNB (18 decimals, like ETH).
      url: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
      chainId: 56,
      accounts: process.env.PRIVATE_KEY
        ? [process.env.PRIVATE_KEY]
        : {
            mnemonic: 'test test test test test test test test test test test junk',
          },
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_KEY,
    enabled: true,
    customChains: [
      { network: 'robinhood', chainId: 4663, urls: { apiURL: 'https://api.etherscan.io/v2/api?chainid=4663', browserURL: 'https://robin.etherscan.io' } },
    ],
  },
  sourcify: {
    // Sourcify supports Robinhood Chain (4663) for free; Blockscout imports Sourcify matches automatically.
    enabled: true,
  },
  mocha: {
    timeout: 120000,
  },
  typechain: {
    outDir: 'src/types',
  },
}

module.exports = config
