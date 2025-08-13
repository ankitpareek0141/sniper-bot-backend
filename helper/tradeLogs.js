// Store logs in memory
export const tradeLogs = [];

// {
//     tradeType,
//     token Symbol,
//     token address,
//     buy amount,
//     buyPrice,
//     sell price,
//     PnL,
//     PnL percentage,
// }

// Function to add logs
export function addTradeLog(type, token, address, amount, price, profitLoss) {
    const logEntry = {
        type, // "BUY" or "SELL"
        token,
        address,
        amount,
        price,
        profitLoss,
        time: new Date().toISOString(),
    };

    // Add latest log to the top
    tradeLogs.unshift(logEntry);

    // Keep only last 100 logs to avoid memory overflow
    if (tradeLogs.length > 100) {
        tradeLogs.pop();
    }

    console.log(
        `[${type}] ${token} | Amount: ${amount} | Price: ${price} | PnL: ${profitLoss} | Time: ${logEntry.time}`
    );
}

export function recordLog(
    tradeType,
    name,
    address,
    buyAmount,
    sellAmount = null,
    sellStatus = false
) {
    if (tradeType == 'BUY') {
        const logEntry = {
            name, // Token Symbo
            address,
            buyAmount: buyAmount.toString(),
            sellAmount: null,
            profitLoss: null,
            growthPercent: null,
            time: new Date().toISOString(),
            isSellFailed: sellStatus,
        };
        // Add latest log to the top
        tradeLogs.unshift(logEntry);

        // Keep only last 100 logs to avoid memory overflow
        if (tradeLogs.length > 100) {
            tradeLogs.pop();
        }
    } else {
        const logIndex = tradeLogs.findIndex((log) => log.address == address);

        if (logIndex < 0) return;

        if (sellStatus) {
            tradeLogs[logIndex].sellAmount = 0;
            tradeLogs[logIndex].profitLoss = 0;
            tradeLogs[logIndex].growthPercent = "0.00";
            tradeLogs[logIndex].isSellFailed = true;
        } else {
            tradeLogs[logIndex].sellAmount = sellAmount.toString();
            tradeLogs[logIndex].profitLoss = (
                tradeLogs[logIndex].sellAmount - tradeLogs[logIndex].buyAmount
            ).toString();
            tradeLogs[logIndex].growthPercent = (
                (tradeLogs[logIndex].profitLoss /
                    tradeLogs[logIndex].buyAmount) *
                100
            ).toString();
            tradeLogs[logIndex].time = new Date().toISOString();
        }
    }
}
