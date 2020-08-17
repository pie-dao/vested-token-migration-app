import {ethers, ethereum} from "@nomiclabs/buidler";
import { Contract, ContractFactory, ContractReceipt, constants, utils } from "ethers";
import ACLArtifact from "../../artifacts/ACL.json";
import KernelArtifact from "../../artifacts/Kernel.json";
import EVMScriptRegistryFactoryArtifact from "../../artifacts/EVMScriptRegistryFactory.json";
import DAOFactoryArtifact from "../../artifacts/DAOFactory.json";
import { Acl } from "../../typechain/Acl";
import { Kernel } from "../../typechain/Kernel";
import { TokenManagerFactory } from "../../typechain/TokenManagerFactory";
import { MiniMeTokenFactory } from "../../typechain/MiniMeTokenFactory";
import { VestedTokenMigrationFactory } from "../../typechain/VestedTokenMigrationFactory";
import { TokenManager } from "../../typechain/TokenManager";
import { MiniMeToken } from "../../typechain/MiniMeToken";
import { VestedTokenMigration } from "../../typechain/VestedTokenMigration";

export interface DAOContracts {
    dao: Kernel;
    acl: Acl;
    inputTokenManager: TokenManager;
    outputTokenManager: TokenManager;
    inputToken: MiniMeToken;
    outputToken: MiniMeToken;
    migrationApp: VestedTokenMigration;
}

export const deployDAO = async (owner: string) => {
    const signers = await ethers.getSigners();

    const kernelBase = await (new ContractFactory(KernelArtifact.abi, KernelArtifact.bytecode, signers[0])).deploy(true) as Kernel;
    // await (new KernelFactory(signers[0])).deploy(true);
    const aclBase: Acl = await (new ContractFactory(ACLArtifact.abi, ACLArtifact.bytecode, signers[0]).deploy()) as Acl;

    const regFact = (await (new ContractFactory(EVMScriptRegistryFactoryArtifact.abi, EVMScriptRegistryFactoryArtifact.bytecode, signers[0])).deploy());
    const daoFact = (await (new ContractFactory(DAOFactoryArtifact.abi, DAOFactoryArtifact.bytecode, signers[0])).deploy(kernelBase.address, aclBase.address, regFact.address));

    const kernelReceipt = await (await daoFact.newDAO(owner)).wait(1);

    const str: string = kernelReceipt.events[kernelReceipt.events.length - 1].data;
    const daoAddress = `0x${str.substring(str.length - 40)}`;
    const dao = (new Contract(daoAddress, KernelArtifact.abi, signers[0])) as Kernel;
    const acl = (new Contract(await dao.acl(), ACLArtifact.abi, signers[0])) as Acl;

    const APP_MANAGER_ROLE = await kernelBase.APP_MANAGER_ROLE();
    await acl.createPermission(owner, dao.address, APP_MANAGER_ROLE, owner);

    const tokenManagerBase = await (new TokenManagerFactory(signers[0])).deploy();

    const inputTokenManagerReceipt = await (await dao["newAppInstance(bytes32,address,bytes,bool)"]("0x1234000000000000000000000000000000000000000000000000000000000000", tokenManagerBase.address, "0x", false)).wait(1);
    const inputTokenManager = TokenManagerFactory.connect(getProxy(inputTokenManagerReceipt), signers[0]);

    const outputTokenManagerReceipt = await (await dao["newAppInstance(bytes32,address,bytes,bool)"]("0x1235000000000000000000000000000000000000000000000000000000000000", tokenManagerBase.address, "0x", false)).wait(1);
    const outputTokenManager = TokenManagerFactory.connect(getProxy(outputTokenManagerReceipt), signers[0]);
    
    const inputToken = await (new MiniMeTokenFactory(signers[0])).deploy(
        constants.AddressZero,
        constants.AddressZero,
        0,
        "Input",
        18,
        "Input",
        false
    );

    const outputToken = await (new MiniMeTokenFactory(signers[0])).deploy(
        constants.AddressZero,
        constants.AddressZero,
        0,
        "Output",
        18,
        "Output",
        true
    );

    await inputToken.generateTokens(owner, utils.parseEther("2000000"));

    await inputToken.changeController(inputTokenManager.address);
    await outputToken.changeController(outputTokenManager.address);
    
    const MINT_ROLE = await outputTokenManager.MINT_ROLE();
    const BURN_ROLE = await outputTokenManager.BURN_ROLE();

    console.log(MINT_ROLE);
    console.log(BURN_ROLE);

    const ANY_ENTITY = await aclBase.ANY_ENTITY()

    const migrationAppBase = await (new VestedTokenMigrationFactory(signers[0])).deploy();
    const migrationAppReceipt = await (await dao["newAppInstance(bytes32,address,bytes,bool)"]("0x1337000000000000000000000000000000000000000000000000000000000000", migrationAppBase.address, "0x", false)).wait(1);
    const migrationApp = VestedTokenMigrationFactory.connect(getProxy(migrationAppReceipt), signers[0]);

    migrationApp.initialize(inputTokenManager.address, outputTokenManager.address);

    const SET_VESTING_WINDOW_MERKLE_ROOT_ROLE = await migrationApp.SET_VESTING_WINDOW_MERKLE_ROOT_ROLE();
    const INCREASE_NON_VESTED_ROLE = await migrationApp.INCREASE_NON_VESTED_ROLE();
    
    // TODO fix the token burning and minting permissions

    await acl.createPermission(ANY_ENTITY, migrationApp.address, SET_VESTING_WINDOW_MERKLE_ROOT_ROLE, owner);
    await acl.createPermission(ANY_ENTITY, migrationApp.address, INCREASE_NON_VESTED_ROLE, owner);
    await acl.createPermission(ANY_ENTITY, inputTokenManager.address, MINT_ROLE, owner);
    await acl.createPermission(ANY_ENTITY, inputTokenManager.address, BURN_ROLE, owner);
    await acl.createPermission(ANY_ENTITY, outputTokenManager.address, BURN_ROLE, owner);
    await acl.createPermission(ANY_ENTITY, outputTokenManager.address, MINT_ROLE, owner);

    const contracts: DAOContracts = {
        dao,
        acl,
        inputTokenManager,
        outputTokenManager,
        inputToken,
        outputToken,
        migrationApp
    };
    return(contracts);
}

const getProxy = (receipt: ContractReceipt) => {
    // ugly af oneliner
    return receipt.events[receipt.events.length - 1].decode(receipt.events[receipt.events.length - 1].data, receipt.events[receipt.events.length - 1].topics).proxy;
}