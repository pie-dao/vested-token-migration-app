require("dotenv").config();

import { usePlugin, task } from  "@nomiclabs/buidler/config";
import { writeFileSync } from "fs";


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
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
      accounts: [PRIVATE_KEY],
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

const tokenAbi = [
  // Some simple details about the token
  "function name() view returns (string)",
  "function symbol() view returns (string)",

  // Get the account balance
  "function balanceOf(address) view returns (uint)",

  // Send some of your tokens to someone else
  "function transfer(address to, uint amount)",

  // An event triggered whenever anyone transfers to someone else
  "event Transfer(address indexed from, address indexed to, uint amount)"
];


const blockTimestamps = {} as any;

const getBlockTimeStamp = async (blocknumber, provider) => {
  // If block number was already fetched
  if(blockTimestamps[blocknumber]) {
      return blockTimestamps[blocknumber];
  }
  // else fetch it
  blockTimestamps[blocknumber] = (await provider.getBlock(blocknumber)).timestamp;
  return blockTimestamps[blocknumber];
}


task("generate-mints-json")
  .addParam("token", "token address")
  .addParam("target", "file to write to", "./mints.json")
  .setAction(async (taskArgs, {ethers}) => {
    const tokenContract = new ethers.Contract(taskArgs.token, tokenAbi, ethers.provider);

    const mintEvents = await tokenContract.queryFilter(
      tokenContract.filters.Transfer(ethers.constants.AddressZero, null)
    );

    const normalizedMintEvents = [];

    for (const event of mintEvents) {
        
      let timestamp = await getBlockTimeStamp(event.blockNumber, ethers.provider)    
       
      normalizedMintEvents.push({
          address: event.args[1],
          amount: event.args[2].toString(),
          timestamp: timestamp.toString(),
      });
    }

    writeFileSync(taskArgs.target, JSON.stringify(normalizedMintEvents, null, 4));
});

task("generate-windows-json")
  .addParam("input", "json file containing the minting events", "./mints.json")
  .addParam("vesting0Till", "timestamp of end of window 0 vesting")
  .addParam("vesting1Till", "timestamp of end of window 1 vesting")
  .addParam("vesting2Till", "timestamp of end of window 2 vesting")
  .addParam("vesting0Duration", "duraction of vesting window 0")
  .addParam("vesting1Duration", "duraction of vesting window 1")
  .addParam("vesting2Duration", "duraction of vesting window 2")
  .addParam("output", "json file to export to", "windows.json")
  .setAction(async (taskArgs, { ethers }) => {
    
    const input = require(taskArgs.input);

    const {
      vesting0Till,
      vesting1Till,
      vesting2Till,
      vesting0Duration,
      vesting1Duration,
      vesting2Duration
    } = taskArgs;

    const output = input.map((item) => {
      let vestedTimestamp;
      const timestamp = item.timestamp;
      // Summoners
      if(item.timetamp < vesting0Till) {
        vestedTimestamp = timestamp + vesting0Duration;
      } else if (timestamp < vesting1Till) { // pre seed
        vestedTimestamp = timestamp + vesting1Duration;
      } else { // seed
        vestedTimestamp = timestamp + vesting2Duration;
      }

      return {
        ...item,
        vestedTimestamp
      }
    });

    writeFileSync(taskArgs.output, JSON.stringify(output, null, 4));
});

export default config;
