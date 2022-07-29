const { assert, expect } = require("chai");
const { ethers, getNamedAccounts, deployments, network } = require("hardhat");
const {developmentChains, networkConfig} = require("../../helper-hardhat.config");

developmentChains.includes(network.name) ? 
    describe.skip :
    describe("Lottery Unit Test", () => {
        let lottery, entranceFee, deployer

        beforeEach(async () => {
            deployer = (await getNamedAccounts()).deployer
            lottery = await ethers.getContract("Lottery", deployer)
            entranceFee = await lottery.getEntranceFee();
        })

        describe("fulfillRandomWords", async () => {
            it("works with live Chainlink Keepers & VRF, we get a random winner", async () => {
                const startingTimestamp = await lottery.getLatestTimestamp()
                const accounts = await ethers.getSigners

                // set up listener first
                await new Promise(async (resolve, reject) => {
                    lottery.once("WinnerPicked", async () => {
                        console.log("Winner Picked Event Triggered")
                        resolve()
                        try {
                            // add asssertions here
                            const recentWinner = await lottery.getRecentWinner()
                            const lotteryState = await lottery.getLotteryState()
                            const winnerEndingBalance = await accounts[0].getBalance()
                            const endingTimestamp = await lottery.getLatestTimestamp()
                            assert.equal(numPlayers.toString(), "0") 
                            assert.equal(recentWinner.toString(), accounts[0].address)
                            assert.equal(lotteryState, 0)
                            assert(endingTimestamp > startingTimestamp)
                            assert.equal(winnerEndingBalance.toString(), winnerStartingBalance.add(entranceFee).toString())
                            resolve()
                        } catch (e) {
                            reject(e)
                        }
                    })
                    await lottery.enterLottery({value: entranceFee})
                    const winnerStartingBalance = await accounts[0].getBalance()
                })
            })
        })
})
