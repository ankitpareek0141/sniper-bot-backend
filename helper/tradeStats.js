export const tradeStats = {
    totalTrades: 0,
    successfulTrades: 0,
    failedTrades: 0,
    totalBuys: 0,
    totalSells: 0,
    successfulBuys: 0,
    successfulSells: 0,
    failedBuys: 0,
    failedSells: 0,
    totalBuyingAmount: 0, 
    totalSellingAmount: 0,

    get winRate() { 
        return this.totalTrades > 0
            ? ((this.successfulTrades / this.totalTrades) * 100).toFixed(2) + '%'
            : '0.00%';
    },

    get totalProfit() { 
        return (BigInt(this.totalSellingAmount) - BigInt(this.totalBuyingAmount));  ``
    },

    logSummary() {
        console.log('\n===== 📊 Trade Statistics =====');
        console.log(`Total Trades:        ${this.totalTrades}`);
        console.log(`Successful Trades:   ${this.successfulTrades}`);
        console.log(`Failed Trades:       ${this.failedTrades}`);
        console.log(`Total Buys:          ${this.totalBuy}`);
        console.log(`Successful Buys:     ${this.successfulBuy}`);
        console.log(`Failed Buys:         ${this.failedBuy}`);
        console.log(`Total Sells:         ${this.totalSell}`);
        console.log(`Successful Sells:    ${this.successfulSell}`);
        console.log(`Failed Sells:        ${this.failedSell}`);
        console.log(`Win Rate:            ${this.winRate}`);
        console.log('===============================\n');
    },
};
