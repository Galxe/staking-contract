import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { GalxeStaking, Token, TokenUpgrader } from "../../typechain-types";
import { BigNumberish } from "ethers";

describe("GalxeStaking", function () {
    let contract: GalxeStaking;
    let owner: SignerWithAddress;
    let user: SignerWithAddress;
    let user2: SignerWithAddress;
    let user3: SignerWithAddress;
    let token: Token;
    let upgradeToken: Token;
    let upgrader: TokenUpgrader;

    beforeEach(async () => {
        ({ contract, owner, user, user2, user3, token, upgradeToken, upgrader } = await loadFixture(deployGalxeStakingFixture));
    });

    async function deployGalxeStakingFixture() {
        // Contracts are deployed using the first signer/account by default
        const [owner, user, user2, user3] = await ethers.getSigners();
        const factory = await ethers.getContractFactory("GalxeStaking");
        const contract = await factory.deploy(owner);

        const tokenFactory = await ethers.getContractFactory("Token");
        const token = await tokenFactory.deploy(owner);
        const upgradeToken = await tokenFactory.deploy(owner);
        const upgraderContract = await ethers.getContractFactory("TokenUpgrader")
        const upgrader = await upgraderContract.deploy(upgradeToken);

        await contract.initialize(token);
        await contract.connect(owner).setLockDuration(10);
        return { contract, owner, user, user2, user3, token, upgradeToken, upgrader};
    }

    describe("Initialize", function () {
        it("Should set the right owner", async function () {
            expect(await contract.owner()).to.equal(owner.address);
        });
    });

    async function stakeToken() {
        await token.transfer(user.address, 100);
        await token.connect(user).approve(await contract.getAddress(), ethers.parseEther("1"));
        await expect(contract.connect(user).stakeToken(10)).to.emit(contract, "TokenStaked")
            .withArgs(user.address, 10);
        expect(await contract.getStakeAmount(user)).to.equal(10);
    }

    describe("stakeToken", function () {
        it("user stake token, return right stakeAmount with event", async function () {
            await token.transfer(user.address, 100);
            await token.connect(user).approve(await contract.getAddress(), ethers.parseEther("1"));
            await contract.connect(user).stakeToken(10);
            expect(await contract.getStakeAmount(user)).to.equal(10);
        });

        it("user stake but not enough balance", async function () {
            await token.connect(user2).approve(await contract.getAddress(), ethers.parseEther("1"));
            // await contract.connect(user2).StakeToken(token, 10);

            await expect(contract.connect(user2).stakeToken(10)).to.be.revertedWith(
                "Insufficient token balance, please edit amount and try again.",
            );
        });

        it("user stake with wrong amount", async function () {
            await token.transfer(user2.address, 100);
            await token.connect(user2).approve(await contract.getAddress(), 1);

            await expect(contract.connect(user2).stakeToken(100)).to.be.revertedWith(
                "Approve tokens first!",
            );
        });

        it("multi user stake token, return right stakeAmount", async function () {
            const users = [user, user2, user3];
            for (let i = 0; i < users.length; i++) {
                await token.mint(users[i].address, ethers.parseEther("1"));
                await token.connect(users[i]).approve(await contract.getAddress(), ethers.parseEther("1"));
                for (let j = 1; j <= 10; j++) { // 1-10
                    await contract.connect(users[i]).stakeToken(j);
                }
                expect(await contract.getStakeAmount(users[i])).to.equal(55);
            }
        });
    });

    describe("unStake", function () {
        it("user unStake token, but not enough balance", async function () {
            await stakeToken();

            await expect(contract.connect(user).unStake(100)).to.be.revertedWith("Insufficient token balance, please edit amount and try again.");
        });

        it("user unStake token, return right stakeAmount with event ", async function () {
            await stakeToken();

            await contract.connect(user).unStake(10);
            const unStakeInfoArray = await contract.getUnStakeInfo(user.address);
            // console.log("contract unStakeInfoArray:", unStakeInfoArray);

            expect(unStakeInfoArray.length).to.equal(1);
            expect(unStakeInfoArray[0].amount).to.equal(10);

            expect(await contract.getStakeAmount(user)).to.equal(0);
        });

        it("user unStake token multi time, return right stakeAmount with event ", async function () {
            await stakeToken();

            await contract.connect(user).unStake(1);
            await contract.connect(user).unStake(2);
            await contract.connect(user).unStake(3);
            const unStakeInfoArray = await contract.getUnStakeInfo(user.address);

            expect(unStakeInfoArray.length).to.equal(3);
            expect(unStakeInfoArray[0].amount).to.equal(1);
            expect(unStakeInfoArray[1].amount).to.equal(2);
            expect(unStakeInfoArray[2].amount).to.equal(3);

            expect(await contract.getStakeAmount(user)).to.equal(4);
        });
    });

    describe("revokeUnStake", function () {
        it("user revokeUnStake token with wrong index", async function () {
            await stakeToken();

            await expect(contract.connect(user).revokeUnStake(1)).to.be.revertedWith("index is invalid, please refresh the page and try again.");
        });

        it("user revokeUnStake token, return right stakeAmount with event ", async function () {
            await stakeToken();

            await contract.connect(user).unStake(8);
            const unStakeInfoArray = await contract.getUnStakeInfo(user.address);
            expect(unStakeInfoArray.length).to.equal(1);
            expect(unStakeInfoArray[0].amount).to.equal(8);

            await expect(contract.connect(user).revokeUnStake(0)).to.emit(contract, "TokenRevokeUnStaked")
                .withArgs(user.address, unStakeInfoArray[0]);

            const reUnStakeInfoArray = await contract.getUnStakeInfo(user.address);
            expect(reUnStakeInfoArray.length).to.equal(0);

            await expect(await contract.getStakeAmount(user)).to.equal(10);
        });

        it("user revokeUnStake token multi times, return right stakeAmount with event ", async function () {
            await stakeToken();

            await contract.connect(user).unStake(1);
            await contract.connect(user).unStake(2);
            await contract.connect(user).unStake(4);
            const unStakeInfoArray = await contract.getUnStakeInfo(user.address);
            expect(unStakeInfoArray.length).to.equal(3);
            expect(unStakeInfoArray[0].amount).to.equal(1);
            expect(unStakeInfoArray[1].amount).to.equal(2);
            expect(unStakeInfoArray[2].amount).to.equal(4);

            await expect(contract.connect(user).revokeUnStake(0)).to.emit(contract, "TokenRevokeUnStaked")
                .withArgs(user.address, unStakeInfoArray[0]);

            const reUnStakeInfoArray = await contract.getUnStakeInfo(user.address);
            expect(reUnStakeInfoArray.length).to.equal(2);
            expect(reUnStakeInfoArray[0].amount).to.equal(2);
            expect(reUnStakeInfoArray[1].amount).to.equal(4);

            expect(await contract.getStakeAmount(user)).to.equal(4);
        });
    });

    describe("withdrawUnLockedToken", function () {
        it("user withdrawUnLockedToken token with wrong index", async function () {
            await stakeToken();
            await contract.connect(user).unStake(10);

            await expect(contract.connect(user).withdrawUnLockedToken(1)).to.be.revertedWith("index is invalid, please refresh the page and try again.");
        });

        it("user withdrawUnLockedToken with lock time", async function () {
            await stakeToken();
            await contract.connect(user).unStake(10);

            expect(await contract.connect(user).getStakeAmount(user)).to.equal(0);
            // const unStakeInfoArray = await contract.getUnStakeInfo(user.address);
            // console.log(`unStakeInfoArray: ${unStakeInfoArray}`);

            await expect(contract.connect(user).withdrawUnLockedToken(0)).to.be.revertedWith("Tokens are only available after correct time period has elapsed");

            expect(await token.balanceOf(user)).to.equal(90);
        });

        it("user withdrawUnLockedToken with right case", async function () {
            await stakeToken();
            await contract.connect(user).unStake(1);
            await contract.connect(user).unStake(2);
            expect(await contract.getStakeAmount(user)).to.equal(7);
            await ethers.provider.send('evm_increaseTime', [11]);

            const unStakeInfoArray = await contract.getUnStakeInfo(user.address);
            // console.log(`unStakeInfoArray: ${unStakeInfoArray}`);
            await expect(contract.connect(user).withdrawUnLockedToken(0)).to.emit(contract, "TokenWithdraw")
                .withArgs(user.address, unStakeInfoArray[0]);
            expect(await token.balanceOf(user)).to.equal(91);

            await expect(contract.connect(user).withdrawUnLockedToken(0)).to.emit(contract, "TokenWithdraw")
                .withArgs(user.address, unStakeInfoArray[1]);
            expect(await token.balanceOf(user)).to.equal(93);
        });
    });

    describe("withdrawAllUnLockedToken", function () {
        it("user withdrawAllUnLockedToken token with wrong amount", async function () {
            await stakeToken();

            await expect(contract.connect(user).withdrawAllUnLockedToken()).to.be.revertedWith("unStaking token is 0.");
        });

        it("user withdrawAllUnLockedToken, return right with event", async function () {
            await stakeToken();
            await contract.connect(user).unStake(2);
            await contract.connect(user).unStake(3);
            expect(await contract.getStakeAmount(user)).to.equal(5);
            await ethers.provider.send('evm_increaseTime', [11]);
            await contract.connect(user).unStake(4);

            const unStakeInfoArray1 = await contract.getUnStakeInfo(user.address);
            await expect(contract.connect(user).withdrawAllUnLockedToken()).to
                .emit(contract, "TokenWithdraw").withArgs(user.address, unStakeInfoArray1[0])
                .and.to.emit(contract, "TokenWithdraw").withArgs(user.address, unStakeInfoArray1[1]);

            // await contract.connect(user).withdrawAllUnLockedToken();
            expect(await token.balanceOf(user)).to.equal(95);

            const unStakeInfoArray = await contract.getUnStakeInfo(user.address);
            expect(unStakeInfoArray.length).to.equal(1);
            expect(unStakeInfoArray[0].amount).to.equal(4);

            await expect(await contract.getStakeAmount(user)).to.equal(1);

            await expect(contract.connect(user).withdrawAllUnLockedToken()).to.be.revertedWith("Tokens are only available after correct time period has elapsed");

            const reUnStakeInfoArray = await contract.getUnStakeInfo(user.address);
            expect(reUnStakeInfoArray.length).to.equal(1);
            expect(reUnStakeInfoArray[0].amount).to.equal(4);

            await ethers.provider.send('evm_increaseTime', [11]);
            await expect(contract.connect(user).withdrawAllUnLockedToken()).to
                .emit(contract, "TokenWithdraw").withArgs(user.address, reUnStakeInfoArray[0]);

            const reUnStakeInfoArray2 = await contract.getUnStakeInfo(user.address);
            expect(reUnStakeInfoArray2.length).to.equal(0);

            await expect(await contract.getStakeAmount(user)).to.equal(1);
            expect(await token.balanceOf(user)).to.equal(99);

        });

        it("user withdrawAllUnLockedToken multi, return right with event", async function () {
            await token.transfer(user.address, 100);
            await token.connect(user).approve(await contract.getAddress(), ethers.parseEther("1"));
            await contract.connect(user).stakeToken(20);
            expect(await contract.getStakeAmount(user)).to.equal(20);

            await contract.connect(user).unStake(1);
            await contract.connect(user).unStake(1);
            await contract.connect(user).unStake(1);
            await contract.connect(user).unStake(1);
            await contract.connect(user).unStake(1);
            await contract.connect(user).unStake(1);
            await contract.connect(user).unStake(1);
            await contract.connect(user).unStake(1);
            await contract.connect(user).unStake(1);
            await contract.connect(user).unStake(1);

            await expect(contract.connect(user).unStake(1)).to.be.revertedWith("The unStake queue has reached the upper limit of 10 and needs to be revoke or withdraw before proceeding.");
            expect(await contract.getStakeAmount(user)).to.equal(10);
            await ethers.provider.send('evm_increaseTime', [11]);


            await contract.connect(user).withdrawAllUnLockedToken();

            const unStakeInfoArray = await contract.getUnStakeInfo(user.address);
            expect(unStakeInfoArray.length).to.equal(0);
        });
    });

    describe("upgradeToken", function () {
        async function upgrade() {
            await contract.pause();
            await contract.upgradeToken(upgradeToken, upgrader, 1);
            await contract.unpause();
        }

        it("failed with invalid multiplier", async function () {
            await expect(contract.upgradeToken(upgradeToken, upgrader, 0)).to.be.revertedWith("Multiplier must be greater than 0");
        });

        it("balance different with getStakeAmount before upgrade", async function () {
            await stakeToken();
            const multiplier = await contract.multiplier();
            const staked = await contract.getStakeAmount(user);
            expect(multiplier).gt(0);
            expect(staked).gt(0);
            expect(await contract.balances(user)).to.equal(staked * multiplier);
        });

        it("upgrade token with right new token balance", async function () {
            await stakeToken();
            const multiplier = await contract.multiplier();
            const beforeTokenBalance = await token.balanceOf(contract);

            expect(await contract.upgradeToken(upgradeToken, upgrader, 1))
            .to.emit(contract, "TokenUpgraded")
            .withArgs(upgradeToken, upgrader, beforeTokenBalance*multiplier, 1);

            expect(await upgradeToken.balanceOf(contract)).to.equal(beforeTokenBalance * multiplier);
            expect(await contract.multiplier()).to.equal(1);
            expect(await contract.balances(user)).to.equal(await contract.getStakeAmount(user));
            expect(await contract.allowedToken()).to.equal(upgradeToken);
        });


        describe("upgrade before unstake", () => {
            it("unstake with correct unstake info", async function () {
                await stakeToken();

                await upgrade();

                await contract.connect(user).unStake(10);
                const unStakeInfoArray = await contract.getUnStakeInfo(user.address);

                expect(unStakeInfoArray.length).to.equal(1);
                expect(unStakeInfoArray[0].amount).to.equal(10);

                expect(await contract.getStakeAmount(user)).to.equal(590); // 600-10
            });

            it("unstake multi times with correct unstake info", async function () {
                await stakeToken();

                await upgrade();

                await contract.connect(user).unStake(300);
                await contract.connect(user).unStake(200);
                await contract.connect(user).unStake(100);

                const unStakeInfoArray = await contract.getUnStakeInfo(user.address);

                expect(unStakeInfoArray.length).to.equal(3);
                expect(unStakeInfoArray[0].amount).to.equal(300);
                expect(unStakeInfoArray[1].amount).to.equal(200);
                expect(unStakeInfoArray[2].amount).to.equal(100);

                expect(await contract.getStakeAmount(user)).to.equal(0);
            });

            it("withdraw with correctly amount", async function () {
                await stakeToken();

                await upgrade();

                await contract.connect(user).unStake(300);
                await contract.connect(user).unStake(200);
                await contract.connect(user).unStake(50);


                const unStakeInfoArray = await contract.getUnStakeInfo(user.address);

                await ethers.provider.send('evm_increaseTime', [11]);

                expect(await contract.connect(user).withdrawUnLockedToken(0))
                .to.emit(contract, "TokenWithdraw")
                .withArgs(user.address, unStakeInfoArray[0])
                .emit(upgradeToken, "Transfer")
                .withArgs(contract, user.address, 300);

                expect(await contract.getStakeAmount(user)).to.equal(50);

                expect(await contract.connect(user).withdrawUnLockedToken(0))
                .to.emit(contract, "TokenWithdraw")
                .withArgs(user.address, unStakeInfoArray[1])
                .emit(upgradeToken, "Transfer")
                .withArgs(contract, user.address, 200);
                expect(await contract.getStakeAmount(user)).to.equal(50);

                expect(await contract.connect(user).withdrawUnLockedToken(0))
                .to.emit(contract, "TokenWithdraw")
                .withArgs(user.address, unStakeInfoArray[2])
                .emit(upgradeToken, "Transfer")
                .withArgs(contract, user.address, 50);

                expect(await contract.getStakeAmount(user)).to.equal(50);
            });

            it("multi user upgrade token", async function () {
                // user 10
                await stakeToken();
                // user2 20
                await token.mint(user2.address, 100);
                await token.connect(user2).approve(await contract.getAddress(), ethers.parseEther("1"));
                await contract.connect(user2).stakeToken(20);

                // user3 30
                await token.mint(user3.address, 100);
                await token.connect(user3).approve(await contract.getAddress(), ethers.parseEther("1"));
                await contract.connect(user3).stakeToken(30);

                await upgrade();
                
                // user1
                await contract.connect(user).unStake(300);
                await contract.connect(user).unStake(200);
                await contract.connect(user).unStake(100);
                // user2
                await contract.connect(user2).unStake(600);
                await contract.connect(user2).unStake(300);
                // user3
                await contract.connect(user3).unStake(200);
                await contract.connect(user3).unStake(100);

                // user 1
                const unStakeInfoArray = await contract.getUnStakeInfo(user.address);

                expect(unStakeInfoArray.length).to.equal(3);
                expect(unStakeInfoArray[0].amount).to.equal(300);
                expect(unStakeInfoArray[1].amount).to.equal(200);
                expect(unStakeInfoArray[2].amount).to.equal(100);

                expect(await contract.getStakeAmount(user)).to.equal(0);

                await ethers.provider.send('evm_increaseTime', [11]);

                await expect(contract.connect(user).withdrawAllUnLockedToken()).to
                    .emit(contract, "TokenWithdraw").withArgs(user.address, unStakeInfoArray[0])
                    .and.to.emit(contract, "TokenWithdraw").withArgs(user.address, unStakeInfoArray[1])
                    .and.to.emit(contract, "TokenWithdraw").withArgs(user.address, unStakeInfoArray[2]);

                expect(await upgradeToken.balanceOf(user)).to.equal(600);

                // user2
                const unStakeInfoArray2 = await contract.getUnStakeInfo(user2.address);
                expect(unStakeInfoArray2.length).to.equal(2);
                expect(unStakeInfoArray2[0].amount).to.equal(600);
                expect(unStakeInfoArray2[1].amount).to.equal(300);

                expect(await contract.getStakeAmount(user2)).to.equal(300);

                await expect(contract.connect(user2).withdrawAllUnLockedToken()).to
                    .emit(contract, "TokenWithdraw").withArgs(user2.address, unStakeInfoArray2[0])
                    .and.to.emit(contract, "TokenWithdraw").withArgs(user2.address, unStakeInfoArray2[1]);

                expect(await upgradeToken.balanceOf(user2)).to.equal(900);

                // user3
                const unStakeInfoArray3 = await contract.getUnStakeInfo(user3.address);
                expect(unStakeInfoArray3.length).to.equal(2);
                expect(unStakeInfoArray3[0].amount).to.equal(200);
                expect(unStakeInfoArray3[1].amount).to.equal(100);

                expect(await contract.getStakeAmount(user3)).to.equal(1500);

                await expect(contract.connect(user3).withdrawAllUnLockedToken()).to
                    .emit(contract, "TokenWithdraw").withArgs(user3.address, unStakeInfoArray3[0])
                    .and.to.emit(contract, "TokenWithdraw").withArgs(user3.address, unStakeInfoArray3[1]);

                expect(await upgradeToken.balanceOf(user3)).to.equal(300);
            });
        })

        describe("upgrade after unstake before withdraw", () => {
            it("unstake with correct unstake info", async function () {
                await stakeToken();
                await contract.connect(user).unStake(10);

                await contract.upgradeToken(upgradeToken, upgrader, 1);

                const unStakeInfoArray = await contract.getUnStakeInfo(user.address);

                expect(unStakeInfoArray.length).to.equal(1);
                expect(unStakeInfoArray[0].amount).to.equal(600);

                expect(await contract.getStakeAmount(user)).to.equal(0);
            });

            it("unstake multi times with correct unstake info", async function () {
                await stakeToken();
                await contract.connect(user).unStake(3);
                await contract.connect(user).unStake(2);
                await contract.connect(user).unStake(1);

                await contract.upgradeToken(upgradeToken, upgrader, 1);

                const unStakeInfoArray = await contract.getUnStakeInfo(user.address);

                expect(unStakeInfoArray.length).to.equal(3);
                expect(unStakeInfoArray[0].amount).to.equal(180);
                expect(unStakeInfoArray[1].amount).to.equal(120);
                expect(unStakeInfoArray[2].amount).to.equal(60);

                expect(await contract.getStakeAmount(user)).to.equal(240);
            });

            it("withdraw with correctly amount", async function () {
                await stakeToken();
                await contract.connect(user).unStake(3);
                await contract.connect(user).unStake(2);
                await contract.connect(user).unStake(1);

                await contract.pause();
                await contract.upgradeToken(upgradeToken, upgrader, 1);
                await contract.unpause();

                const unStakeInfoArray = await contract.getUnStakeInfo(user.address);

                await ethers.provider.send('evm_increaseTime', [11]);

                expect(await contract.connect(user).withdrawUnLockedToken(0))
                .to.emit(contract, "TokenWithdraw")
                .withArgs(user.address, unStakeInfoArray[0])
                .emit(upgradeToken, "Transfer")
                .withArgs(contract, user.address, 180);
                expect(await contract.getStakeAmount(user)).to.equal(240);

                expect(await contract.connect(user).withdrawUnLockedToken(0))
                .to.emit(contract, "TokenWithdraw")
                .withArgs(user.address, unStakeInfoArray[1])
                .emit(upgradeToken, "Transfer")
                .withArgs(contract, user.address, 120);
                expect(await contract.getStakeAmount(user)).to.equal(240);

                expect(await contract.connect(user).withdrawUnLockedToken(0))
                .to.emit(contract, "TokenWithdraw")
                .withArgs(user.address, unStakeInfoArray[2])
                .emit(upgradeToken, "Transfer")
                .withArgs(contract, user.address, 60);

                expect(await contract.getStakeAmount(user)).to.equal(240);
            });

            it("multi user upgrade token", async function () {
                // user 10
                await stakeToken();
                await contract.connect(user).unStake(3);
                await contract.connect(user).unStake(2);
                await contract.connect(user).unStake(1);

                // user2 20
                await token.mint(user2.address, 100);
                await token.connect(user2).approve(await contract.getAddress(), ethers.parseEther("1"));
                await contract.connect(user2).stakeToken(20);
                await contract.connect(user2).unStake(10);
                await contract.connect(user2).unStake(5);

                // user3 30
                await token.mint(user3.address, 100);
                await token.connect(user3).approve(await contract.getAddress(), ethers.parseEther("1"));
                await contract.connect(user3).stakeToken(30);
                await contract.connect(user3).unStake(20);
                await contract.connect(user3).unStake(10);


                await contract.upgradeToken(upgradeToken, upgrader, 1);

                // user 1
                const unStakeInfoArray = await contract.getUnStakeInfo(user.address);

                expect(unStakeInfoArray.length).to.equal(3);
                expect(unStakeInfoArray[0].amount).to.equal(180);
                expect(unStakeInfoArray[1].amount).to.equal(120);
                expect(unStakeInfoArray[2].amount).to.equal(60);

                expect(await contract.getStakeAmount(user)).to.equal(240);

                await ethers.provider.send('evm_increaseTime', [11]);

                await expect(contract.connect(user).withdrawAllUnLockedToken()).to
                    .emit(contract, "TokenWithdraw").withArgs(user.address, unStakeInfoArray[0])
                    .and.to.emit(contract, "TokenWithdraw").withArgs(user.address, unStakeInfoArray[1])
                    .and.to.emit(contract, "TokenWithdraw").withArgs(user.address, unStakeInfoArray[2]);

                expect(await upgradeToken.balanceOf(user)).to.equal(360);

                // user2
                const unStakeInfoArray2 = await contract.getUnStakeInfo(user2.address);
                expect(unStakeInfoArray2.length).to.equal(2);
                expect(unStakeInfoArray2[0].amount).to.equal(600);
                expect(unStakeInfoArray2[1].amount).to.equal(300);

                expect(await contract.getStakeAmount(user2)).to.equal(300);

                await expect(contract.connect(user2).withdrawAllUnLockedToken()).to
                    .emit(contract, "TokenWithdraw").withArgs(user2.address, unStakeInfoArray2[0])
                    .and.to.emit(contract, "TokenWithdraw").withArgs(user2.address, unStakeInfoArray2[1]);

                expect(await upgradeToken.balanceOf(user2)).to.equal(900);

                // user3
                const unStakeInfoArray3 = await contract.getUnStakeInfo(user3.address);
                expect(unStakeInfoArray3.length).to.equal(2);
                expect(unStakeInfoArray3[0].amount).to.equal(1200);
                expect(unStakeInfoArray3[1].amount).to.equal(600);

                expect(await contract.getStakeAmount(user3)).to.equal(0);

                await expect(contract.connect(user3).withdrawAllUnLockedToken()).to
                    .emit(contract, "TokenWithdraw").withArgs(user3.address, unStakeInfoArray3[0])
                    .and.to.emit(contract, "TokenWithdraw").withArgs(user3.address, unStakeInfoArray3[1]);

                expect(await upgradeToken.balanceOf(user3)).to.equal(1800);
            });
        })
    });

    // describe("changeToken", function () {
    //     it("change token", async function () {
    //         await stakeToken();
    //
    //         await contract.connect(owner).changeToken(token2);
    //         await contract.connect(owner).recoverERC20(token, user.address, await token.balanceOf(contract));
    //
    //         expect(await token.balanceOf(user)).to.equal(100);
    //     });
    // });

    describe("pause", function () {
        it("pause", async function () {
            await contract.connect(owner).pause();

            await expect(contract.connect(user).stakeToken(1)).to.be.revertedWith("Pausable: paused");
            await expect(contract.connect(user).unStake(1)).to.be.revertedWith("Pausable: paused");
            await expect(contract.connect(user).revokeUnStake(1)).to.be.revertedWith("Pausable: paused");
            await expect(contract.connect(user).withdrawUnLockedToken(1)).to.be.revertedWith("Pausable: paused");
            await expect(contract.connect(user).withdrawAllUnLockedToken()).to.be.revertedWith("Pausable: paused");

            await contract.connect(owner).unpause();
            await stakeToken();
        });
    });

});
