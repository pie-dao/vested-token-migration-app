import {ethers} from "ethers";
import fs, { writeFile } from "fs";
import {MerkleTree} from "./merkleTree.js";


const provider = new ethers.providers.JsonRpcProvider( "https://mainnet.infura.io/v3/ffa6c1dc83e44e6c9971d4706311d5ab" )
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

const vestingWindows = [
    // Sumoners
    {
        till: 1583178715,
        // 3 years
        duration: 60 * 60 * 24 * 365 * 3
    },
    // Pre seed
    {
        till: 1587290630,
        // 1.5 years
        duration: 60 * 60 * 24 * 365 * 1.5
    },
    // Seed
    {   
        // All mints after pre seed are seed
        till: 9999999999,
        // 1 year
        duration: 60 * 60 * 24 * 365 * 1
    }
]

const tokenContract = new ethers.Contract("0x5f5e9ed11344dadc3a08688e5f17e23f6a99bf81", tokenAbi, provider);

const blockTimestamps = {};

const getBlockTimeStamp = async (blocknumber) => {
    // If block number was already fetched
    if(blockTimestamps[blocknumber]) {
        return blockTimestamps[blocknumber];
    }
    // else fetch it
    blockTimestamps[blocknumber] = (await provider.getBlock(blocknumber)).timestamp;
    return blockTimestamps[blocknumber];
}

const run = async() => {
    const mintEvents = await tokenContract.queryFilter(
        tokenContract.filters.Transfer(ethers.constants.AddressZero, null)
    );
    const burnEvents = await tokenContract.queryFilter(
        tokenContract.filters.Transfer(null, ethers.constants.AddressZero)
    );

    

    const normalizedMintEvents = [];
    
    for (const event of mintEvents) {
        
        let timestamp = await getBlockTimeStamp(event.blockNumber)

        let windowVested 
        // Summoners
        if(timestamp < vestingWindows[0].till) {
            windowVested = timestamp + vestingWindows[0].duration;
        } else if (timestamp < vestingWindows[1].till) { // pre seed
            windowVested = timestamp + vestingWindows[1].duration;
        } else { // seed
            windowVested = timestamp + vestingWindows[2].duration;
        }
        
         
        normalizedMintEvents.push({
            address: event.args[1],
            amount: event.args[2].toString(),
            windowStart: timestamp,
            windowVested: windowVested,
            leaf: ethers.utils.solidityKeccak256(["address", "uint256", "uint256", "uint256"], [event.args[1], event.args[2].toString(), timestamp, windowVested])
        })


        
        
    }

    // Generate Merkle tree
    const elements = normalizedMintEvents.map((item) => item.leaf);

    const merkleTree = new MerkleTree(elements);

    console.log(merkleTree.getProof(normalizedMintEvents[100].leaf));
    
    // TODO filter out ragequits
    writeFile("mints.json", JSON.stringify(normalizedMintEvents, null, 4), console.log);
    writeFile("tree.json", JSON.stringify(merkleTree, null, 4), console.log);

}

run();