/*
 * These hooks are called by the Aragon Buidler plugin during the start task's lifecycle. Use them to perform custom tasks at certain entry points of the development build process, like deploying a token before a proxy is initialized, etc.
 *
 * Link them to the main buidler config file (buidler.config.js) in the `aragon.hooks` property.
 *
 * All hooks receive two parameters:
 * 1) A params object that may contain other objects that pertain to the particular hook.
 * 2) A "bre" or BuidlerRuntimeEnvironment object that contains enviroment objects like web3, Truffle artifacts, etc.
 *
 * Please see AragonConfigHooks, in the plugin's types for further details on these interfaces.
 * https://github.com/aragon/buidler-aragon/blob/develop/src/types.ts#L22
 */

import { MiniMeToken } from "../typechain/MiniMeToken";
import { MiniMeTokenFactory } from "../typechain/MiniMeTokenFactory";
import { constants, Contract, utils } from "ethers";
import { BuidlerRuntimeEnvironment } from "@nomiclabs/buidler/types";
import { AppInstaller, AppInstalled } from "@aragon/buidler-aragon/src/types";
import { parseEther } from "ethers/lib/utils";
import { Kernel } from "../typechain/Kernel";
import { Acl } from "../typechain/Acl";
import { AclFactory } from "../typechain";
import ACLABI from "../artifacts/ACL.json";

const ANY_ADDRESS = '0xffffffffffffffffffffffffffffffffffffffff'

let inputToken: MiniMeToken;
let outputToken: MiniMeToken;
let inputTokenManager: AppInstalled;
let outputTokenManager: AppInstalled;
let dao: Kernel;

module.exports = {
    // Called before a dao is deployed.
    preDao: async (params, bre: BuidlerRuntimeEnvironment) => {
     
    },
  
    // Called after a dao is deployed.
    postDao: async (params, bre: BuidlerRuntimeEnvironment) => {
      dao = params.dao;
      const installer: AppInstaller = params._experimentalAppInstaller;
      const { ethers } = bre;
      const signers = await ethers.getSigners();
      const account = await signers[0].getAddress();

      inputToken = await deployMinimeToken(bre, "INPUT", false);
      outputToken = await deployMinimeToken(bre, "OUTPUT", false);

      await inputToken.generateTokens(account, parseEther("10000000"));

      inputTokenManager = await installer("token-manager", {
        skipInitialize: true
      });

      outputTokenManager = await installer("token-manager", {
        skipInitialize: true
      });

      await inputToken.changeController(inputTokenManager.address);
      await outputToken.changeController(outputTokenManager.address);

      await inputTokenManager.initialize([inputToken.address, false, 0]);
      await outputTokenManager.initialize([outputToken.address, true, 0]);

      const voting = await installer("voting", {
        initializeArgs: [
          inputToken.address,
          "600000000000000000",
          "100000000000000000",
          604800
        ]
      })

      await inputTokenManager.createPermission("MINT_ROLE", ANY_ADDRESS);
      await outputTokenManager.createPermission("MINT_ROLE", ANY_ADDRESS);
      await voting.createPermission("CREATE_VOTES_ROLE", ANY_ADDRESS);
    },
  
    // Called after the app's proxy is created, but before it's initialized.
    preInit: async ({ proxy }, { web3, artifacts }) => {},
  
    // Called after the app's proxy is initialized.
    postInit: async (params, { ethers, web3, artifacts }) => {
      // const proxy: AppInstalled = params.proxy;
      // const dao: Kernel = params.dao;
      // console.log(params);
      // const signers = await ethers.getSigners();
      // const account = await signers[0].getAddress();
      // const aclAddress = await dao.acl();
      // const acl: Acl = new Contract(aclAddress, ACLABI.abi, signers[0]) as Acl;

      // await acl["createPermission(address,address,bytes32,address)"](ANY_ADDRESS, proxy.address, utils.keccak256(utils.toUtf8Bytes("INCREASE_NON_VESTED_ROLE")), account);
      // await acl["createPermission(address,address,bytes32,address)"](ANY_ADDRESS, proxy.address, utils.keccak256(utils.toUtf8Bytes("SET_VESTING_WINDOW_MERKLE_ROOT_ROLE")), account);

      // console.log(proxy);
      // await proxy.createPermission("INCREASE_NON_VESTED_ROLE", ANY_ADDRESS);
      // await proxy.createPermission("SET_VESTING_WINDOW_MERKLE_ROOT_ROLE", ANY_ADDRESS);
    },
    // Called after the app's proxy is updated with a new implementation.
    postUpdate: async ({ proxy }, { web3, artifacts }) => {},
  
    getInitParams: async ({}, { web3, artifacts }) => {
      return [inputTokenManager.address, outputTokenManager.address]
    },
  };

  const deployMinimeToken = async (bre: BuidlerRuntimeEnvironment, tokenName: string, transferable: boolean) => {
    const { ethers } = bre;
    const signers = await ethers.getSigners();


    return await (new MiniMeTokenFactory(signers[0]).deploy(
      constants.AddressZero,
      constants.AddressZero,
      0,
      tokenName,
      18,
      tokenName,
      transferable
    ));
  }
  