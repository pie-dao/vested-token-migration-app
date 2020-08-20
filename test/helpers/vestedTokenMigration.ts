import chai, {expect} from "chai";
import { deployDAO, DAOContracts } from "../helpers";
import {deployContract, solidity} from "ethereum-waffle";
import {ethers, ethereum} from "@nomiclabs/buidler";
import { Signer } from "ethers";
import { Kernel } from "../../typechain/Kernel";
import { parseEther } from "ethers/lib/utils";
// TODO consider moving merkleTree.js and converting it to typescript
import { MerkleTree } from "../../scripts/merkleTree.js";
import { captureRejectionSymbol } from "events";


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

    describe("migrateNonVested", async() => {
        it("Partially migrating tokens not subject to vesting should work", async() => {
            await contracts.inputTokenManager.mint(account, parseEther("400"));
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
    
        it("Migrating the full amount should work", async() => {
            await contracts.inputTokenManager.mint(account, parseEther("100"));
            await contracts.migrationApp.increaseNonVested(account, parseEther("200")); 
    
            const migrationAmount = parseEther("100");
    
            const nonVestedAmountBefore = await contracts.migrationApp.nonVestedAmounts(account);
            const outputTokenBalanceBefore = await contracts.outputToken.balanceOf(account);
            await contracts.migrationApp.migrateNonVested(migrationAmount);
            const nonVestedAmountAfter = await contracts.migrationApp.nonVestedAmounts(account);
            const inputTokenBalanceAfter = await contracts.inputToken.balanceOf(account);
            const outputTokenBalanceAfter = await contracts.outputToken.balanceOf(account);
            
            expect(nonVestedAmountAfter).to.eq(nonVestedAmountBefore.sub(migrationAmount));
            expect(inputTokenBalanceAfter).to.eq(0);
            expect(outputTokenBalanceAfter).to.eq(outputTokenBalanceBefore.add(migrationAmount));
        });
    
        it("Migrating more than the input token balance should fail", async() => {
            await contracts.inputTokenManager.mint(account, parseEther("100"));
            await contracts.migrationApp.increaseNonVested(account, parseEther("101")); 

            const migrationAmount = parseEther("101");
            
            // No error mesage
            await expect(contracts.migrationApp.migrateNonVested(migrationAmount)).to.be.reverted;
        });

        it("Trying to migrate more than the amount not subject to vesting should fail", async() => {
            await contracts.inputTokenManager.mint(account, parseEther("100"));
            await contracts.migrationApp.increaseNonVested(account, parseEther("50"));

            await expect(contracts.migrationApp.migrateNonVested(parseEther("1000"))).to.be.revertedWith("CLAIM_AMOUNT_TOO_LARGE");
        });
    });

    describe("migrateVested", async() => {

        let testMigrationWindows;
        let vestingMerkleTree: MerkleTree;
        let timestamp: number;

        beforeEach(async() => {
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            testMigrationWindows = [
                {
                    address: account,
                    amount: parseEther("100").toString(),
                    // already vested for 180 days
                    windowStart: timestamp - (60 * 60 * 24 * 180),
                    // Will be completely vested in 2 years
                    windowVested: timestamp + (60 * 60 * 24 * 365 * 2),
                }
                // TODO add more dummy elements
            ];

            // Generate leafs
            testMigrationWindows = testMigrationWindows.map((item) => ({
                ...item,
                leaf: ethers.utils.solidityKeccak256(
                    ["address", "uint256", "uint256", "uint256"],
                    [item.address, item.amount, item.windowStart, item.windowVested]
                )
            }));

            vestingMerkleTree = new MerkleTree(testMigrationWindows.map(item => (item.leaf)));
        });

        it("Migrating vested tokens should work", async() => {
            const vestingWindow = testMigrationWindows[0];
            const migrationAmount = parseEther("1");

            await contracts.inputTokenManager.mint(account, parseEther("100"));
            await contracts.migrationApp.setVestingWindowMerkleRoot(vestingMerkleTree.getRoot());
        
            const amountMigratedFromWindowBefore = await contracts.migrationApp.amountMigratedFromWindow(vestingWindow.leaf);
            const inputTokenAmountBefore = await contracts.inputToken.balanceOf(account);
            const outputTokenAmountBefore = await contracts.outputToken.balanceOf(account);

            await contracts.migrationApp.migrateVested(
                account,
                migrationAmount,
                vestingWindow.amount,
                vestingWindow.windowStart,
                vestingWindow.windowVested,
                vestingMerkleTree.getProof(vestingWindow.leaf)
            );

            const amountMigratedFromWindowAfter = await contracts.migrationApp.amountMigratedFromWindow(vestingWindow.leaf);
            const inputTokenAmountAfter = await contracts.inputToken.balanceOf(account);
            const outputTokenAmountAfter = await contracts.outputToken.balanceOf(account);

            expect(amountMigratedFromWindowAfter).to.eq(amountMigratedFromWindowBefore.add(migrationAmount));
            expect(inputTokenAmountAfter).to.eq(inputTokenAmountBefore.sub(migrationAmount));
            expect(outputTokenAmountAfter).to.eq(outputTokenAmountBefore.add(migrationAmount));
        });

    });    
})
