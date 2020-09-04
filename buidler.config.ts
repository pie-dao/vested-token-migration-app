require("dotenv").config();

import { usePlugin, task, types } from  "@nomiclabs/buidler/config";
import { writeFileSync } from "fs";
import { MerkleTree } from "./scripts/merkleTree";


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
    appServePort: 8081,
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
  .addParam("vesting0Duration", "duraction of vesting window 0", null, types.int)
  .addParam("vesting1Duration", "duraction of vesting window 1", null, types.int)
  .addParam("vesting2Duration", "duraction of vesting window 2", null, types.int)
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
      let vestedTimestamp: number;
      const timestamp = item.timestamp as string;
      // Summoners
      if(item.timetamp < vesting0Till) {
        vestedTimestamp = parseInt(timestamp) + parseInt(vesting0Duration);
      } else if (timestamp < vesting1Till) { // pre seed
        vestedTimestamp = parseInt(timestamp) + parseInt(vesting1Duration);
      } else { // seed
        vestedTimestamp = parseInt(timestamp) + parseInt(vesting2Duration);
      }

      return {
        ...item,
        vestedTimestamp: vestedTimestamp.toString()
      }
    });

    writeFileSync(taskArgs.output, JSON.stringify(output, null, 4));
});

task("generate-proof")
  .addParam("input", "input json file", "./windows.json")
  .addParam("index", "index of window", "0")
  .addParam("output", "output json file", "./proof.json")
  .setAction(async(taskArgs, {ethers}) => {
    const windows = require(taskArgs.input);
    console.log(windows);

    const windowsWithLeafs = windows.map((item) => {
      return {
        ...item,
        leaf: ethers.utils.solidityKeccak256(
          ["address", "uint256", "uint256", "uint256"],
          [
            item.address,
            item.amount,
            item.timestamp,
            item.vestedTimestamp
          ]
        )
      }
    });

    const merkleTree = new MerkleTree(windowsWithLeafs.map(item => item.leaf));
    console.log(`Root: ${merkleTree.getRoot()}`);
    const proof = merkleTree.getProof(windowsWithLeafs[taskArgs.index].leaf);

    writeFileSync(taskArgs.output, JSON.stringify(proof, null, 4));
  });

export default config;
