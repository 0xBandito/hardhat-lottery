const { assert, expect } = require("chai");
const { ethers, getNamedAccounts, deployments, network } = require("hardhat");
const {developmentChains, networkConfig} = require("../../helper-hardhat.config");

!developmentChains.includes(network.name) ? 
    describe.skip : 
    describe("Lottery Unit Test", () => {
        let lottery, vrfCoordinatorV2Mock, chainId, entranceFee, deployer, interval

        beforeEach(async () => {

            deployer = (await getNamedAccounts()).deployer
            await deployments.fixture(["all"])
            lottery = await ethers.getContract("Lottery", deployer)
            vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
            chainId = network.config.chainId;
            entranceFee = ethers.utils.parseEther(".02");
            interval = await lottery.getInterval()
        })

        describe("constructor", () => {
            it("initializes the raffle correctly", async () => {
                const lotteryState = await lottery.getLotteryState();
                const interval = await lottery.getInterval();
                assert.equal(lotteryState.toString(), "0")
                assert.equal(interval.toString(), networkConfig[chainId].interval)
            })
        })

        describe("enterLottery", () => {
            it("reverts if not enough eth is entered", async () => {
                await expect(lottery.enterLottery()).to.be.revertedWith("Lottery__NotEnoughEthEntered")
            })
            it("reverts if lottery state is not OPEN", async () => {
                await lottery.enterLottery({value: entranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                await lottery.performUpkeep([])
                await expect(lottery.enterLottery({value: entranceFee})).to.be.revertedWith("Lottery__NotOpen")
            })
            it("adds player to raffle", async () => {
                await lottery.enterLottery({value: entranceFee})
                const numOfPlayers = await lottery.getNumOfPlayers()
                const player = await lottery.getPlayer(0);
                assert.equal(numOfPlayers.toString(), "1")
                assert.equal(player, deployer)
            }) 
            it("emits event when lottery is entered", async () => {
                await expect(lottery.enterLottery({value: entranceFee})).to.emit(lottery, "LotteryEntered")
            })
        })

        describe("checkUpkeep", () => {
            it("returns false if no eth sent", async () => {
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                assert(!upkeepNeeded)
            })
            it("returns false if raffle is not OPEN", async () => {
                await lottery.enterLottery({value: entranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                await lottery.performUpkeep([])
                const lotteryState = await lottery.getLotteryState();
                const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                assert.equal(lotteryState, "1")
                assert.equal(upkeepNeeded, false)
            })
            it("returns false if enough time has NOT passed", async () => {
                await lottery.enterLottery({value: entranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() - 1])
                await network.provider.send("evm_mine", [])
                const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                assert(!upkeepNeeded)
            })
            it("returns true if enough time has passed, has players, has eth, and is open", async () => {
                await lottery.enterLottery({value: entranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                assert(upkeepNeeded)
            })
        })

        describe("performUpkeep", () => {
            it("only runs when checkupKeep is true", async () => {
                await lottery.enterLottery({value: entranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const tx = await lottery.performUpkeep([])
                assert(tx);
            })
            it("reverts when checkUpkeep is false", async () => {
                await expect(lottery.performUpkeep([])).to.be.revertedWith("Lottery__UpkeepNotNeeded")
            })
            it("updates lottery state, emits event, and calls vrfCoordinator", async () => {
                await lottery.enterLottery({value: entranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const txResponse = await lottery.performUpkeep([])
                const txReceipt = await txResponse.wait(1)
                const requestId = txReceipt.events[1].args.requestId
                const lotteryState = await lottery.getLotteryState()
                assert(requestId.toNumber() > 0)
                assert(lotteryState.toString() == "1")
            })
        })
        describe("fulfillRandomWords", () => {

            beforeEach(async () => {
                await lottery.enterLottery({value: entranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
            })
            it("can only be called after performUpkeep", async () => {
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)).to.be.revertedWith("nonexistent request")
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address)).to.be.revertedWith("nonexistent request")
            })
            it("picks a winner, resets the lottery, and sends ETH", async () => {
                const additionalEntrants = 3
                const startingAccountIndex = 1
                const accounts = await ethers.getSigners()
                for (let i = startingAccountIndex; i < startingAccountIndex + additionalEntrants; i++) {
                    const accountConnectedLottery = lottery.connect(accounts[i])
                    await accountConnectedLottery.enterLottery({value: entranceFee})
                }
                const startingTimestamp = await lottery.getLatestTimestamp()
                await new Promise(async (resolve, reject) => {
                    lottery.once("WinnerPicked",async () => {
                        console.log("Event Found")
                        try {
                            const recentWinner = await lottery.getRecentWinner()
                            console.log(recentWinner)
                            console.log(accounts[0].address)
                            console.log(accounts[1].address)
                            console.log(accounts[2].address)
                            console.log(accounts[3].address)
                            const lotteryState = await lottery.getLotteryState()
                            const endingTimestamp = await lottery.getLatestTimestamp()
                            const numPlayers = await lottery.getNumOfPlayers()
                            const winnerEndingBal = await accounts[1].getBalance()
                            assert.equal(numPlayers.toString(), "0") 
                            assert.equal(lotteryState.toString(), "0")
                            assert(endingTimestamp > startingTimestamp)
                            assert.equal(winnerEndingBal.toString(), winnerStartingBal.add(entranceFee.mul(additionalEntrants).add(entranceFee)))
                        } catch(e) {
                            reject(e)
                        }
                        resolve()

                    })

                    const tx = await lottery.performUpkeep([])
                    const txReceipt = await tx.wait(1)
                    const winnerStartingBal = await accounts[1].getBalance()
                    await vrfCoordinatorV2Mock.fulfillRandomWords(txReceipt.events[1].args.requestId, lottery.address)
                })
            })
        })
    })