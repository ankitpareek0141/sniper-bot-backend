// Store logs in memory
export const tradeLogs = [];


// Function to add logs
export function addTradeLog(type, token, address, amount, price, profitLoss) {
    const logEntry = {
        type, // "BUY" or "SELL"
        token,
        address,
        amount,
        price,
        profitLoss,
        time: new Date().toISOString()
    };
    
    // Add latest log to the top
    tradeLogs.unshift(logEntry);

    // Keep only last 100 logs to avoid memory overflow
    if (tradeLogs.length > 100) {
        tradeLogs.pop();
    }

    console.log(`[${type}] ${token} | Amount: ${amount} | Price: ${price} | PnL: ${profitLoss} | Time: ${logEntry.time}`);
}