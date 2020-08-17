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
        await contracts.migrationApp.increaseNonVested(account, parseEther("200")); 

        const migrationAmount = parseEther("100");

        const nonVestedAmountBefore = await contracts.migrationApp.nonVestedAmounts(account);
        const inputTokenBalanceBefore = await contracts.inputToken.balanceOf(account);
        const outputTokenBalanceBefore = await contracts.outputToken.balanceOf(account);
        await contracts.migrationApp.migrateNonVested(migrationAmount);
        const nonVestedAmountAfter = await contracts.migrationApp.nonVestedAmounts(account);
        const inputTokenBalanceAfter = await contracts.inputToken.balanceOf(account);
        const outputTokenBalanceAfter = await contracts.outputToken.balanceOf(account);

        
        expect(nonVestedAmountAfter).to.eq(nonVestedAmountBefore.sub(migrationAmount));
        expect(inputTokenBalanceAfter).to.eq(inputTokenBalanceBefore.sub(migrationAmount));
        expect(outputTokenBalanceAfter).to.eq(outputTokenBalanceBefore.add(migrationAmount));
    });
})