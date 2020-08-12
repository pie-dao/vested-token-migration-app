import { usePlugin } from  "@nomiclabs/buidler/config";

usePlugin('@aragon/buidler-aragon')

const config = {
  defaultNetwork: 'localhost',
  networks: {
    localhost: {
      url: 'http://localhost:8545'
    },
  },
  solc: {
    version: '0.4.24',
    optimizer: {
      enabled: true,
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
