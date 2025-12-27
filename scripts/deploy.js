// scripts/deploy.js
const hre = require("hardhat");

async function main() {
  // 获取合约工厂
  const GuessDice = await hre.ethers.getContractFactory("GuessDice");
  
  console.log("正在部署 GuessDice 合约到 Sepolia 测试网...");

  // 部署合约（构造函数无参数，直接调用 deploy()）
  const guessDice = await GuessDice.deploy();

  // 等待合约部署交易确认
  //await guessDice.deployed();

  console.log(`🎉 GuessDice 合约部署成功！地址：${guessDice.target}`);
}

// 执行部署并处理错误
main().catch((error) => {
  console.error("部署失败：", error);
  process.exitCode = 1;
});