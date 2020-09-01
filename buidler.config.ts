require("dotenv").config();

import { usePlugin } from  "@nomiclabs/buidler/config";

usePlugin("@aragon/buidler-aragon");
usePlugin("@nomiclabs/buidler-ethers");
usePlugin("solidity-coverage");

const INFURA_PROJECT_ID = process.env.INFURA_PROJECT_ID || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

const config = {
  defaultNetwork: 'buidlerevm',
  networks: {
    coverage: {
      url: 'http://localhost:8555'
    },
    buidlerevm: {
      gasPrice: 0,
      blockGasLimit: 100000000,
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${INFURA_PROJECT_ID}`,
      accounts: [PRIVATE_KEY]
    },
    localhost: {
      url: 'http://localhost:8545'
    },
    frame: {
      url: "ws://localhost:1248"
    }
  },
  solc: {
    version: '0.4.24',
    optimizer: {
      enabled: false,
      runs: 200
    }
  },
  aragon: {
    appServePort: 8001,
    clientServePort: 3000,
    appSrcPath: 'app/',
    appBuildOutputPath: 'dist/',
    hooks: require('./scripts/buidler-hooks')
  }
}

export default config;
