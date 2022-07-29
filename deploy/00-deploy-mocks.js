const { getNamedAccounts, deployments, network } = require("hardhat");
const { networkConfig, developmentChains } = require("../helper-hardhat.config");

const BASE_FEE = ethers.utils.parseEther("0.25")
const GAS_PRICE_LINK = 1e9;
module.exports = async () => {
    
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();

    const args = [BASE_FEE, GAS_PRICE_LINK]

    if(developmentChains.includes(network.name)) {
        log("Local Network Detected....")
        log("Deploying Mocks....")
        const vrfCoordinatorMock = await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            args: args,
            log: true,
            waitConfirmations: network.config.blockConfirmations || 1
        })
        log("Mocks Deployed")
        log("--------------------------------------")
    }
}

module.exports.tags = ["all", "mocks"]