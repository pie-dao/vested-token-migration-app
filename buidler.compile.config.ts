import { usePlugin } from  "@nomiclabs/buidler/config";

usePlugin("@aragon/buidler-aragon");
usePlugin("@nomiclabs/buidler-ethers");

const config = {
  solc: {
    version: '0.4.24',
    optimizer: {
      enabled: false,
      runs: 200
    }
  },
}

export default config;
