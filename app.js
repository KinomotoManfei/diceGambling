// 全局变量
let web3;
let guessDiceContract;
let accounts = [];

// 合约配置（部署时请替换为实际网络的合约地址）
// ！！！重要：请确保这里是你部署在 Sepolia 测试网上的合约地址 ！！！
let CONTRACT_ADDRESS = "0x262981f996557b30323d467a1eF51Ab2eBEcffcd";

// 支持的网络配置
const NETWORKS = {
    ganache: {
        chainId: 1337,
        rpcUrl: "http://127.0.0.1:8545",
        name: "Ganache"
    },
    // ========== 修改点 1: 保留Goerli，但将其rpcUrl改为公共节点 ==========
    goerli: {
        chainId: 5,
        // 使用公共节点，无需Infura Key
        rpcUrl: "https://rpc.goerli.eth.gateway.fm",
        name: "Goerli Testnet"
    },
    // ========== 修改点 2: 新增 Sepolia 测试网配置 ==========
    sepolia: {
        chainId: 11155111, // Sepolia 的链 ID
        // 使用公共节点，无需Infura Key
        rpcUrl: "https://rpc.sepolia.org",
        name: "Sepolia Testnet"
    },
    mainnet: {
        chainId: 1,
        rpcUrl: "https://mainnet.infura.io/v3/9aa3d95b3bc40fa88ea12eaa4456161",
        name: "Ethereum Mainnet"
    }
};

// ========== 修改点 3: 将默认网络从 goerli 改为 sepolia ==========
let CURRENT_NETWORK = NETWORKS.sepolia;

const CONTRACT_ABI = [
    // ... (你的 ABI 保持不变) ...
    { "inputs": [], "stateMutability": "nonpayable", "type": "constructor" },
    { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "player", "type": "address" }, { "indexed": false, "internalType": "uint8", "name": "guess", "type": "uint8" }, { "indexed": false, "internalType": "uint8", "name": "difficulty", "type": "uint8" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "BetPlaced", "type": "event" },
    { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "player", "type": "address" }, { "indexed": false, "internalType": "bool", "name": "isWin", "type": "bool" }, { "indexed": false, "internalType": "uint256", "name": "payout", "type": "uint256" }, { "indexed": false, "internalType": "uint8", "name": "diceNumber", "type": "uint8" }, { "indexed": false, "internalType": "uint8", "name": "diceResult", "type": "uint8" }], "name": "BetResult", "type": "event" },
    { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "funder", "type": "address" }, { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "ContractFunded", "type": "event" },
    { "inputs": [], "name": "banker", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "name": "difficultyOdds", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "name": "difficultyWinRate", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "fundContract", "outputs": [], "stateMutability": "payable", "type": "function" },
    { "inputs": [], "name": "getContractBalance", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
    { "inputs": [{ "internalType": "uint8", "name": "guess", "type": "uint8" }, { "internalType": "uint8", "name": "difficulty", "type": "uint8" }], "name": "guessDice", "outputs": [], "stateMutability": "payable", "type": "function" },
    { "inputs": [], "name": "withdrawFunds", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
    { "stateMutability": "payable", "type": "receive" }
];

// ... (你的其他所有 JavaScript 代码保持不变) ...

// 个性化结果文本配置
const RESULT_TEXT = {
    win: [
        "🎉 恭喜！你押中了，奖金已到账～",
        "🥳 运气真好！猜中结果，赢得{amount} ETH！",
        "✨ 太棒了！猜中结果，收获{amount} ETH奖励！"
    ],
    lose: [
        "😥 有点可惜，这次没押中，下次加油！",
        "💔 运气差了点，下注失败，本金已扣除～",
        "🫤 这次没猜中，没关系，再来一次！"
    ],
    timeout: "⚠️ 交易处理超时，手动刷新查看结果",
    betProcessing: "⏳ 正在处理下注，请稍候..."
};

// 全局状态变量
let preBetBalance = 0;
let isBetProcessing = false;

// ========== 工具函数：高精度wei转ETH（保留三位小数） ==========
function weiToEthSafe(weiAmount) {
    if (!web3) return "0.000";
    const ethAmount = web3.utils.fromWei(weiAmount.toString(), 'ether');
    return parseFloat(ethAmount).toFixed(3);
}

// ========== 验证合约地址有效性 ==========
function isValidContractAddress(address) {
    return /^0x[0-9a-fA-F]{40}$/.test(address);
}

// ========== 设置合约地址并初始化 ==========
async function setContractAddress(address) {
    if (!isValidContractAddress(address)) {
        showResult("❌ 请输入正确的合约地址", "#ff4444");
        return false;
    }

    CONTRACT_ADDRESS = address;
    
    try {
        guessDiceContract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
        await guessDiceContract.methods.banker().call();
        showResult("✅ 合约地址设置成功！", "#4CAF50");
        
        if (accounts.length > 0) {
            await updatePageData();
        }
        return true;
    } catch (error) {
        showResult("❌ 合约初始化失败：" + error.message, "#ff4444");
        console.error(error);
        return false;
    }
}

// ========== 显示结果信息 ==========
function showResult(text, color = "#ffd700") {
    const resultText = document.getElementById("resultText");
    resultText.textContent = text;
    resultText.style.color = color;
}

// ========== 更新骰子显示 ==========
function updateDiceDisplay(number, resultType) {
    const diceElement = document.getElementById("dice");
    const diceResultText = document.getElementById("diceResultText");
    
    diceElement.classList.add("rolling");
    
    setTimeout(() => {
        diceElement.classList.remove("rolling");
        diceElement.textContent = number;
        
        if (resultType === 1) { 
            diceElement.style.background = "#ff4444";
            diceElement.style.color = "#fff";
            diceResultText.textContent = `开出：${number} 点（大）`;
        } else { 
            diceElement.style.background = "#4CAF50";
            diceElement.style.color = "#fff";
            diceResultText.textContent = `开出：${number} 点（小）`;
        }
    }, 1000);
}

// ========== 重置骰子显示 ==========
function resetDiceDisplay() {
    const diceElement = document.getElementById("dice");
    const diceResultText = document.getElementById("diceResultText");
    
    diceElement.textContent = "0";
    diceElement.style.background = "#fff";
    diceElement.style.color = "#000";
    diceResultText.textContent = "等待开奖...";
}

// ========== 更新页面数据（余额） ==========
async function updatePageData() {
    if (!web3 || !guessDiceContract || accounts.length === 0) return;

    try {
        const userBalWei = await web3.eth.getBalance(accounts[0]);
        const userBalEth = weiToEthSafe(userBalWei);
        document.getElementById("userBalance").textContent = userBalEth;

        const contractBalWei = await guessDiceContract.methods.getContractBalance().call();
        const contractBalEth = weiToEthSafe(contractBalWei);
        document.getElementById("contractBalance").textContent = contractBalEth;

        return parseFloat(userBalEth);
    } catch (error) {
        console.error("更新余额失败：", error);
        showResult("❌ 更新余额失败：" + error.message, "#ff4444");
        return 0;
    }
}

// ========== 监听BetResult事件 ==========
function listenBetResultEvent() {
    if (!guessDiceContract || !accounts || accounts.length === 0) {
        console.error("❌ 监听器启动失败：guessDiceContract 或 accounts 未定义");
        return;
    }

    console.log("🔍 正在启动事件监听器，监听来自账户:", accounts[0], "的 BetResult 事件...");

    guessDiceContract.events.BetResult({
        fromBlock: 'latest',
        filter: { player: accounts[0] }
    })
    .on('data', (event) => {
        console.log("🎉 成功捕获到 BetResult 事件！", event);

        const { isWin, payout, diceNumber, diceResult } = event.returnValues;
        const diceNum = parseInt(diceNumber);
        const diceRes = parseInt(diceResult);
        const payoutEth = weiToEthSafe(payout);

        updateDiceDisplay(diceNum, diceRes);

        let resultText = "";
        if (isWin) {
            const randomWinText = RESULT_TEXT.win[Math.floor(Math.random() * RESULT_TEXT.win.length)];
            resultText = randomWinText.replace("{amount}", payoutEth);
            showResult(resultText, "#4CAF50");
        } else {
            resultText = RESULT_TEXT.lose[Math.floor(Math.random() * RESULT_TEXT.lose.length)];
            showResult(resultText, "#e91e63");
        }

        addToHistory(`开出${diceNum}点（${diceRes === 1 ? '大' : '小'}）| ${resultText}`);

        isBetProcessing = false;
        document.getElementById("betBtn").disabled = false;
        document.getElementById("betBtn").textContent = "确认下注";

        updatePageData();
    })
    .on('error', (error) => {
        console.error("❌ 事件监听器发生错误:", error);
        showResult("❌ 监听事件时出错，请检查控制台。", "#ff4444");
        isBetProcessing = false;
        document.getElementById("betBtn").disabled = false;
        document.getElementById("betBtn").textContent = "确认下注";
    });
}

// ========== 添加到历史记录 ==========
function addToHistory(text) {
    const historyList = document.getElementById("historyList");
    const historyItem = document.createElement("div");
    historyItem.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    historyList.prepend(historyItem);
    
    if (historyList.children.length > 10) {
        historyList.removeChild(historyList.lastChild);
    }
}

// ========== 下注逻辑 ==========
async function placeBet() {
    if (!web3 || !guessDiceContract) {
        showResult("❌ 请先连接钱包并设置有效合约地址！", "#ff4444");
        return;
    }

    if (accounts.length === 0) {
        showResult("❌ 请先连接钱包！", "#ff4444");
        return;
    }

    if (isBetProcessing) {
        showResult("⚠️ 上一笔交易正在处理中，请稍候！", "#ff9800");
        return;
    }

    const betAmount = document.getElementById("betAmount").value;
    const activeGuessBtn = document.querySelector(".guess-btn.active");
    const difficulty = document.getElementById("difficulty").value;

    if (!betAmount || parseFloat(betAmount) <= 0) {
        showResult("❌ 请输入有效的下注金额（≥0.001 ETH）！", "#ff4444");
        return;
    }

    if (parseFloat(betAmount) < 0.001) {
        showResult("❌ 下注金额不能小于0.001 ETH！", "#ff4444");
        return;
    }

    if (!activeGuessBtn) {
        showResult("❌ 请选择猜大或猜小！", "#ff4444");
        return;
    }

    const guess = activeGuessBtn.dataset.guess;
    const amountWei = web3.utils.toWei(betAmount.toString(), 'ether');

    isBetProcessing = true;
    document.getElementById("betBtn").disabled = true;
    document.getElementById("betBtn").textContent = "处理中...（请勿重复点击）";

    resetDiceDisplay();

    preBetBalance = await updatePageData();

    showResult("⏳ 正在提交交易，请在钱包中确认...", "#ffd700");

    try {
        // 动态估算Gas
        const gasEstimate = await guessDiceContract.methods.guessDice(guess, difficulty)
            .estimateGas({ from: accounts[0], value: amountWei });
        
        // 发送交易时增加10%的gas作为缓冲
        const gasToUse = Math.ceil(gasEstimate * 1.1);
        
        await guessDiceContract.methods.guessDice(guess, difficulty)
            .send({
                from: accounts[0],
                value: amountWei,
                gas: gasToUse
            });

        // 根据网络调整超时时间
        const timeoutDuration = CURRENT_NETWORK.chainId === NETWORKS.ganache.chainId ? 60000 : 90000;
        setTimeout(() => {
            if (isBetProcessing) {
                showResult(RESULT_TEXT.timeout, "#ff9800");
                isBetProcessing = false;
                document.getElementById("betBtn").disabled = false;
                document.getElementById("betBtn").textContent = "确认下注";
            }
        }, timeoutDuration);

    } catch (error) {
        isBetProcessing = false;
        document.getElementById("betBtn").disabled = false;
        document.getElementById("betBtn").textContent = "确认下注";

        let errMsg = "❌ 下注失败：";
        if (error.message.includes("insufficient funds")) {
            errMsg += "账户余额不足（含Gas费）";
        } else if (error.message.includes("Contract balance is insufficient")) {
            errMsg += "合约余额不足，庄家无法支付奖金";
        } else if (error.message.includes("User denied transaction signature")) {
            errMsg += "你取消了交易签名";
        } else {
            errMsg += error.message.substring(0, 100);
        }

        showResult(errMsg, "#ff4444");
        addToHistory(errMsg);
        console.error(error);
    }
}

// ========== 连接钱包 ==========
async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        showResult("❌ 未检测到以太坊钱包，请先安装钱包插件", "#ff4444");
        if (confirm("未检测到以太坊钱包，是否前往MetaMask官网下载？")) {
            window.open("https://metamask.io/download.html", "_blank");
        }
        return;
    }

    try {
        // 请求账户访问权限
        accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        web3 = new Web3(window.ethereum);

        // 检查并切换到配置的网络
        const chainId = await web3.eth.getChainId();
        if (chainId !== CURRENT_NETWORK.chainId) {
            showResult(`⚠️ 请切换到${CURRENT_NETWORK.name}网络 (Chain ID: ${CURRENT_NETWORK.chainId})`, "#ff9800");
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: web3.utils.toHex(CURRENT_NETWORK.chainId) }]
                });
            } catch (switchError) {
                if (switchError.code === 4902) {
                    // 自动添加网络
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: web3.utils.toHex(CURRENT_NETWORK.chainId),
                            chainName: CURRENT_NETWORK.name,
                            rpcUrls: [CURRENT_NETWORK.rpcUrl],
                            nativeCurrency: {
                                name: "Ether",
                                symbol: "ETH",
                                decimals: 18
                            }
                        }]
                    });
                } else {
                    throw switchError;
                }
            }
            return;
        }

        // 初始化合约实例
        if (!CONTRACT_ADDRESS || !isValidContractAddress(CONTRACT_ADDRESS)) {
            showResult("❌ 合约地址无效！请设置正确的地址。", "#ff4444");
            return;
        }
        guessDiceContract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);

        // 启动事件监听器
        if (guessDiceContract.events.BetResult.listenerCount > 0) {
            guessDiceContract.events.BetResult.removeAllListeners();
        }
        listenBetResultEvent();
        console.log("✅ 事件监听器已成功启动！");

        // 更新UI并刷新数据
        document.getElementById("userAddress").textContent = accounts[0].substring(0, 8) + "..." + accounts[0].substring(36);
        document.getElementById("connectWalletBtn").textContent = "已连接钱包";
        document.getElementById("connectWalletBtn").disabled = true;
        document.getElementById("betBtn").disabled = false;
        document.getElementById("refreshBtn").disabled = false;
        
        showResult("✅ 钱包连接成功！", "#4CAF50");
        await updatePageData();
        
        showResult("✅ 钱包连接成功！请先设置合约地址", "#4CAF50");

        if (CONTRACT_ADDRESS && isValidContractAddress(CONTRACT_ADDRESS)) {
            await setContractAddress(CONTRACT_ADDRESS);
            await updatePageData();
            listenBetResultEvent();
        }

        // 监听账户变化
        window.ethereum.on('accountsChanged', async (newAccounts) => {
            accounts = newAccounts;
            if (accounts.length === 0) {
                document.getElementById("userAddress").textContent = "未连接钱包";
                document.getElementById("connectWalletBtn").textContent = "连接钱包";
                document.getElementById("connectWalletBtn").disabled = false;
                document.getElementById("betBtn").disabled = true;
                document.getElementById("refreshBtn").disabled = true;
                showResult("⚠️ 钱包已断开连接，请重新连接", "#ff9800");
            } else {
                document.getElementById("userAddress").textContent = accounts[0].substring(0,8) + "..." + accounts[0].substring(36);
                await updatePageData();
                showResult("✅ 钱包账户已切换", "#4CAF50");
            }
        });
        
        // 监听网络变化
        window.ethereum.on('chainChanged', async (chainId) => {
            if (parseInt(chainId) !== CURRENT_NETWORK.chainId) {
                showResult(`⚠️ 请切换到${CURRENT_NETWORK.name}网络（Chain ID: ${CURRENT_NETWORK.chainId}）`, "#ff9800");
                document.getElementById("betBtn").disabled = true;
            } else {
                showResult(`✅ 已切换到${CURRENT_NETWORK.name}网络`, "#4CAF50");
                document.getElementById("betBtn").disabled = false;
                await updatePageData();
            }
        });

    } catch (error) {
        console.error("连接钱包失败：", error);
        let errMsg = "❌ 连接失败：";
        if (error.code === 4001) {
            errMsg += "你拒绝了钱包连接请求";
        } else {
            errMsg += error.message.substring(0, 100);
        }
        showResult(errMsg, "#ff4444");
    }
}

// ========== 切换网络 ==========
function switchNetwork(networkKey) {
    if (NETWORKS[networkKey]) {
        CURRENT_NETWORK = NETWORKS[networkKey];
        showResult(`已切换到${CURRENT_NETWORK.name}网络，请重新连接钱包`, "#ffd700");
        
        // 重置连接状态
        if (accounts.length > 0) {
            accounts = [];
            document.getElementById("userAddress").textContent = "未连接钱包";
            document.getElementById("connectWalletBtn").textContent = "连接钱包";
            document.getElementById("connectWalletBtn").disabled = false;
            document.getElementById("betBtn").disabled = true;
        }
    }
}

// ========== 页面加载初始化 ==========
window.onload = () => {
    resetDiceDisplay();

    // 绑定猜大小按钮事件
    document.querySelectorAll(".guess-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".guess-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
        });
    });

    // 绑定钱包连接按钮
    document.getElementById("connectWalletBtn").addEventListener("click", connectWallet);

    // 绑定下注按钮事件
    document.getElementById("betBtn").addEventListener("click", placeBet);

    // 绑定刷新按钮事件
    document.getElementById("refreshBtn").addEventListener("click", async () => {
        showResult("🔄 正在刷新数据...", "#ffd700");
        await updatePageData();
        showResult("✅ 数据刷新完成", "#4CAF50");
    });

    // 初始化网络切换按钮（需要在HTML中添加对应元素）
    Object.keys(NETWORKS).forEach(key => {
        const networkBtn = document.getElementById(`network-${key}`);
        if (networkBtn) {
            networkBtn.addEventListener("click", () => switchNetwork(key));
        }
    });

    // 合约地址设置功能
    document.getElementById("setContractBtn").addEventListener("click", async () => {
        const address = document.getElementById("contractAddressInput").value.trim();
        await setContractAddress(address);
    });

    showResult("请先连接钱包开始游戏", "#ffd700");
};