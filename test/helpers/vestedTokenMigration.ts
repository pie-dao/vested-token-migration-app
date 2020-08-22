import chai, {expect} from "chai";
import { deployDAO, DAOContracts } from "../helpers";
import { solidity} from "ethereum-waffle";
import { ethers } from "@nomiclabs/buidler";
import { Signer, BigNumber } from "ethers";
import { parseEther, parseTransaction } from "ethers/lib/utils";
// TODO consider moving merkleTree.js and converting it to typescript
import { MerkleTree } from "../../scripts/merkleTree.js";


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

        let accAmount: BigNumber;

        beforeEach(async() => {
            timestamp = (await ethers.provider.getBlock("latest")).timestamp;
            // amount of vesting tokens + amount of user input tokens
            accAmount = parseEther("100");

            testMigrationWindows = [
                {
                    address: account,
                    amount: accAmount.toString(),
                    windowStart: timestamp,
                    windowVested: timestamp + 60*60*24*365*2, // expiring in 2 years
                },
                {
                    address: account,
                    amount: accAmount.toString(),
                    windowStart: timestamp - 60*60*24*365*2, // started 2 years ago
                    windowVested: timestamp - 60*60*24*365*1, // expired 1 year ago
                },
                {
                    address: account,
                    amount: accAmount.toString(),
                    windowStart: timestamp + 60*60*24*365*1, // starting 1 year
                    windowVested: timestamp + 60*60*24*365*2, // expiring in 2 years
                },
                {
                    // with vested before start
                    address: account,
                    amount: accAmount.toString(),
                    windowStart: timestamp, // starting now
                    windowVested: timestamp - 60*60*24*90, //expired 90 day ago
                }
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

        it("Migrating vested tokens, request more than possible", async() => {
            const vestingWindow = testMigrationWindows[0];

            await contracts.inputTokenManager.mint(account, accAmount);
            await contracts.migrationApp.setVestingWindowMerkleRoot(vestingMerkleTree.getRoot());

            const goalTime = timestamp + 60*60*24*90; // 90 days later
            await ethers.provider.send("evm_setNextBlockTimestamp", [goalTime]);
            let migrateVestedBlock;
            await contracts.migrationApp.migrateVested(
                account,
                parseEther("50"),
                vestingWindow.amount,
                vestingWindow.windowStart,
                vestingWindow.windowVested,
                vestingMerkleTree.getProof(vestingWindow.leaf)
            ).then( (val) => migrateVestedBlock = val.blockNumber );
            const migrateVestedTimestamp = (await ethers.provider.getBlock(migrateVestedBlock)).timestamp;
            expect(migrateVestedTimestamp).to.eq(goalTime);
            const amountExpected = parseEther("12.328767123287671232");

            const inputTokenAmountAfter = await contracts.inputToken.balanceOf(account);
            const expInputTokenAmountAfter = accAmount.sub(amountExpected);
            expect(inputTokenAmountAfter).to.eq(expInputTokenAmountAfter);

            const outputTokenAmountAfter = await contracts.outputToken.balanceOf(account);
            expect(outputTokenAmountAfter).to.eq(amountExpected);

            const amountMigratedFromWindowAfter = await contracts.migrationApp.amountMigratedFromWindow(vestingWindow.leaf);
            expect(amountMigratedFromWindowAfter).to.eq(amountExpected);
        });
        it("Migrating vested tokens, request less than possible", async() => {
            const vestingWindow = testMigrationWindows[0];

            await contracts.inputTokenManager.mint(account, accAmount);
            await contracts.migrationApp.setVestingWindowMerkleRoot(vestingMerkleTree.getRoot());

            const goalTime = timestamp + 60*60*24*90; // 90 days later
            await ethers.provider.send("evm_setNextBlockTimestamp", [goalTime]);
            let migrateVestedBlock;
            const requestAmount = parseEther("10.0");
            await contracts.migrationApp.migrateVested(
                account,
                requestAmount,
                vestingWindow.amount,
                vestingWindow.windowStart,
                vestingWindow.windowVested,
                vestingMerkleTree.getProof(vestingWindow.leaf)
            ).then( (val) => migrateVestedBlock = val.blockNumber );
            let migrateVestedTimestamp = (await ethers.provider.getBlock(migrateVestedBlock)).timestamp;
            expect(migrateVestedTimestamp).to.eq(goalTime);

            let inputTokenAmountAfter = await contracts.inputToken.balanceOf(account);
            let expInputTokenAmountAfter = accAmount.sub(requestAmount);
            expect(inputTokenAmountAfter).to.eq(expInputTokenAmountAfter);

            let outputTokenAmountAfter = await contracts.outputToken.balanceOf(account);
            expect(outputTokenAmountAfter).to.eq(requestAmount);

            let amountMigratedFromWindowAfter = await contracts.migrationApp.amountMigratedFromWindow(vestingWindow.leaf);
            expect(amountMigratedFromWindowAfter).to.eq(requestAmount);

            // request 1 more eth, timestamp + 60 seconds
            await ethers.provider.send("evm_setNextBlockTimestamp", [goalTime + 60]);
            const requestAmount2 = parseEther("1.0");
            await contracts.migrationApp.migrateVested(
                account,
                requestAmount2,
                vestingWindow.amount,
                vestingWindow.windowStart,
                vestingWindow.windowVested,
                vestingMerkleTree.getProof(vestingWindow.leaf)
            ).then( (val) => migrateVestedBlock = val.blockNumber );
            migrateVestedTimestamp = (await ethers.provider.getBlock(migrateVestedBlock)).timestamp;
            expect(migrateVestedTimestamp).to.eq(goalTime + 60);
            const totalRequestAmount = requestAmount.add(requestAmount2)

            inputTokenAmountAfter = await contracts.inputToken.balanceOf(account);
            const expectedInputTokenAmountAfter = accAmount.sub(totalRequestAmount);
            expect(inputTokenAmountAfter).to.eq(expectedInputTokenAmountAfter);

            outputTokenAmountAfter = await contracts.outputToken.balanceOf(account);
            expect(outputTokenAmountAfter).to.eq(totalRequestAmount);

            amountMigratedFromWindowAfter = await contracts.migrationApp.amountMigratedFromWindow(vestingWindow.leaf);
            expect(amountMigratedFromWindowAfter).to.eq(totalRequestAmount);

        });
        it("Migrating vested token, vesting already expired", async() => {
            const vestingWindow = testMigrationWindows[1];
            // this user gets twice as many input tokens that the total vesting allows
            await contracts.inputTokenManager.mint(account, accAmount.mul(2));
            await contracts.migrationApp.setVestingWindowMerkleRoot(vestingMerkleTree.getRoot());

            // request all the tokens
            contracts.migrationApp.callStatic
            await contracts.migrationApp.migrateVested(
                account,
                accAmount.mul(2),
                vestingWindow.amount,
                vestingWindow.windowStart,
                vestingWindow.windowVested,
                vestingMerkleTree.getProof(vestingWindow.leaf),
            );

            // user keeps half of the requested tokens in the input token
            let inputTokenAmountAfter = await contracts.inputToken.balanceOf(account);
            expect(inputTokenAmountAfter).to.eq(accAmount);

            // And the user gets half of the requested token in the output token
            let outputTokenAmountAfter = await contracts.outputToken.balanceOf(account);
            expect(outputTokenAmountAfter).to.eq(accAmount);

            let amountMigratedFromWindowAfter = await contracts.migrationApp.amountMigratedFromWindow(vestingWindow.leaf);
            expect(amountMigratedFromWindowAfter).to.eq(accAmount);
        })
        it("Migrating vested token, vesting is upcoming", async() => {
            const vestingWindow = testMigrationWindows[2];

            await contracts.inputTokenManager.mint(account, accAmount);
            await contracts.migrationApp.setVestingWindowMerkleRoot(vestingMerkleTree.getRoot());

            try {
                await contracts.migrationApp.migrateVested(
                    account,
                    accAmount,
                    vestingWindow.amount,
                    vestingWindow.windowStart,
                    vestingWindow.windowVested,
                    vestingMerkleTree.getProof(vestingWindow.leaf),
                );
            } catch (error){
                if (error.message.search('MATH_SUB_UNDERFLOW') >= 0)
                    return;
            }
            throw Error("expected error");
        })
        it("wrong vesting period", async() => {
            const vestingWindow = testMigrationWindows[3];

            await contracts.inputTokenManager.mint(account, accAmount);
            await contracts.migrationApp.setVestingWindowMerkleRoot(vestingMerkleTree.getRoot());

            try {
                await contracts.migrationApp.migrateVested(
                    account,
                    accAmount,
                    vestingWindow.amount,
                    vestingWindow.windowStart,
                    vestingWindow.windowVested,
                    vestingMerkleTree.getProof(vestingWindow.leaf),
                );
            } catch (error){
                if (error.message.search('MATH_SUB_UNDERFLOW') >= 0)
                    return;
            }
            throw Error("expected error");
        })
        it("failing merkle proof", async() => {
            const vestingWindow = testMigrationWindows[0];

            await contracts.inputTokenManager.mint(account, accAmount);
            await contracts.migrationApp.setVestingWindowMerkleRoot(vestingMerkleTree.getRoot());

            try {
                await contracts.migrationApp.migrateVested(
                    account,
                    accAmount,
                    accAmount.add(BigNumber.from(5)),
                    vestingWindow.windowStart,
                    vestingWindow.windowVested,
                    vestingMerkleTree.getProof(vestingWindow.leaf),
                );
            } catch (error){
                if (error.message.search('MERKLE_PROOF_FAILED') >= 0)
                    return;
            }
            throw Error("expected error");
        })
    });
})
