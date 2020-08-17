import chai, {expect} from "chai";
import { deployDAO, DAOContracts } from "../helpers";
import {deployContract, solidity} from "ethereum-waffle";
import {ethers, ethereum} from "@nomiclabs/buidler";
import { Signer } from "ethers";
import { Kernel } from "../../typechain/Kernel";
import { parseEther } from "ethers/lib/utils";


chai.use(solidity);

let account: string;
let signers: Signer[];
let contracts: DAOContracts;

describe("VestedTokenMigration", function () {
    this.timeout(300000);

    before(async() => {
        signers = await ethers.getSigners();
        account = await signers[0].getAddress();
    });

    beforeEach(async() => {
        contracts = await deployDAO(account);
    });

    it("Migrating tokens not subject to vesting should work", async() => {
        console.log(contracts.inputTokenManager.address);
        console.log(contracts.outputTokenManager.address);

        await contracts.migrationApp.increaseNonVested(account, parseEther("100")); 
        await contracts.migrationApp.migrateNonVested(parseEther("100"));

    });
})