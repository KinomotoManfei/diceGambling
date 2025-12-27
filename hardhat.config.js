require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config(); // 加载 .env 文件中的环境变量

const { PRIVATE_KEY, ALCHEMY_API_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.17", // 确保与你的合约版本一致
  networks: {
    // 新增 Sepolia 测试网配置
    sepolia: {
      // 使用 Alchemy 的 RPC URL
      url: `https://sepolia.infura.io/v3/${ALCHEMY_API_KEY}`,
      // 使用你的私钥来部署合约
      accounts: [PRIVATE_KEY],
    },
  },
};
