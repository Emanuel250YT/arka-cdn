import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import * as dotenv from 'dotenv';

dotenv.config();

const normalizePrivateKey = (key?: string) => {
  if (!key) {
    return undefined;
  }
  return key.startsWith('0x') ? key : `0x${key}`;
};

const paseoPrivateKey = normalizePrivateKey(process.env.PASEO_PRIVATE_KEY);

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
    },
    localhost: {
      url: 'http://127.0.0.1:8545',
    },
    sepolia: {
      url: process.env.RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo',
      accounts:
        process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.length === 66
          ? [process.env.PRIVATE_KEY]
          : [],
    },
    paseo: {
      chainId: 420420422,
      url:
        process.env.PASEO_RPC_URL ||
        'https://testnet-passet-hub-eth-rpc.polkadot.io',
      accounts: paseoPrivateKey ? [paseoPrivateKey] : [],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  paths: {
    sources: './contracts',
    tests: './test/contracts',
    cache: './cache',
    artifacts: './artifacts',
  },
};

export default config;
