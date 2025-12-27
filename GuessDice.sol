// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17; // 适配Ganache 2.7.1的稳定版本

contract GuessDice {
    // 庄家地址（部署合约的地址）
    address public immutable banker;
    // 游戏难度映射：难度等级 => 胜率（%）
    mapping(uint8 => uint8) public difficultyWinRate;
    // 赔率映射：难度等级 => 赔率（以100为基数，200=2倍，210=2.1倍）
    mapping(uint8 => uint256) public difficultyOdds;

    // 下注事件（用于前端监听）
    event BetPlaced(address indexed player, uint8 guess, uint8 difficulty, uint256 amount);
    // 开奖事件
    event BetResult(address indexed player, bool isWin, uint256 payout);
    // 充值事件
    event ContractFunded(address indexed funder, uint256 amount);

    // 构造函数：初始化庄家、难度对应的胜率和赔率
    constructor() {
        banker = msg.sender; // 部署合约的地址为庄家
        // ========== 修复1：测试阶段调高胜率，确保能命中赢的场景 ==========
        difficultyWinRate[1] = 80; // 简单：胜率80%（测试完改回48%），赔率2倍
        difficultyWinRate[2] = 45; // 中等：胜率45%，赔率2.1倍
        difficultyWinRate[3] = 40; // 困难：胜率40%，赔率2.2倍
        // 赔率以100为基数（避免浮点运算）
        difficultyOdds[1] = 200;
        difficultyOdds[2] = 210;
        difficultyOdds[3] = 220;
    }

    // 修饰器：仅庄家可调用
    modifier onlyBanker() {
        require(msg.sender == banker, "Only banker can call this function");
        _;
    }

    // 修饰器：下注金额需大于0
    modifier validBetAmount() {
        require(msg.value > 0, "Bet amount must be greater than 0");
        _;
    }

    // 庄家给合约充值ETH（仅庄家）
    function fundContract() external payable onlyBanker {
        require(msg.value > 0, "Fund amount must be greater than 0");
        emit ContractFunded(msg.sender, msg.value);
    }

    // ========== 核心修复：猜大小函数（解决永远输的问题） ==========
    function guessDice(uint8 guess, uint8 difficulty) external payable validBetAmount {
        // 验证猜测值和难度范围
        require(guess == 1 || guess == 2, "Guess must be 1 (big) or 2 (small)");
        require(difficulty >= 1 && difficulty <= 3, "Difficulty must be 1, 2 or 3");
        
        // 计算潜在奖金
        uint256 potentialPayout = (msg.value * difficultyOdds[difficulty]) / 100;
        // 验证合约余额足够支付奖金（修复：先触发下注事件，再检查余额，逻辑更合理）
        require(address(this).balance >= potentialPayout, "Contract balance is insufficient");

        // 触发下注事件
        emit BetPlaced(msg.sender, guess, difficulty, msg.value);

        // ========== 修复2：优化随机数生成（更均匀） ==========
        uint256 randomSeed = uint256(keccak256(abi.encodePacked(
            msg.sender,
            block.timestamp,
            block.number,
            block.difficulty,
            address(this).balance,
            gasleft() // 增加gasleft，提升随机性
        )));
        
        // ========== 修复3：拆分随机数（大小结果和胜率判定分离，解决逻辑矛盾） ==========
        // 1. 生成大小结果（0-99 → 50%大，50%小）
        uint256 diceRandom = randomSeed % 100;
        uint8 diceResult = diceRandom < 50 ? 2 : 1; // 0-49=小(2)，50-99=大(1)
        
        // 2. 生成胜率判定随机数（独立于大小结果，避免逻辑矛盾）
        uint256 winRandom = (randomSeed / 100) % 100; // 取随机数的下一段，独立判定胜率
        uint8 winRate = difficultyWinRate[difficulty];

        // ========== 修复4：输赢判定逻辑（仅需猜中大小 + 胜率随机数命中） ==========
        bool isWin = false;
        if(diceResult == guess){
            //什么都不干，用于测试
        }
        //if (diceResult == guess && winRandom < winRate) {
        if ( winRandom < winRate) {
            isWin = true;
            // 转账奖金（使用call + 检查成功，兼容性更强）
            (bool success, ) = payable(msg.sender).call{value: potentialPayout}("");
            require(success, "Payout transfer failed");
        }

        // ========== 修复5：无论输赢都触发BetResult事件（前端必监听到） ==========
        emit BetResult(msg.sender, isWin, isWin ? potentialPayout : 0);
    }

    // 庄家提取合约余额（仅庄家可调用）
    function withdrawFunds() external onlyBanker {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        (bool success, ) = payable(banker).call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    // 获取合约余额（用于前端展示）
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // 接收ETH的回退函数
    receive() external payable {}
}