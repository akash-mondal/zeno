import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import 'hashscan-verify';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'cancun',
    },
  },
  networks: {
    hedera_testnet: {
      url: process.env.HEDERA_JSON_RPC_URL || '',
      accounts: process.env.HEDERA_PRIVATE_KEY_HEX
        ? [process.env.HEDERA_PRIVATE_KEY_HEX]
        : [],
      chainId: 296,
      timeout: 120_000,
    },
  },
  mocha: {
    timeout: 3_600_000, // Hedera needs longer finality
  },
};

export default config;
