const networkFeeLamports = 5000n;

export function calculateNetBuyAmountInSOL(quote, buyPriceSOL, priorityFeeInLamports, outTokenDecimals) {
  const LAMPORTS_PER_SOL = 1_000_000_000n;

    // Buy amount (lamports of SOL)
    const buyAmountLamports = BigInt(quote.inAmount);

    // Jupiter fee
    const feeAmountTokens = BigInt(quote.routePlan[0].swapInfo.feeAmount);
    const feeMint = quote.routePlan[0].swapInfo.feeMint;

    let feeInLamports = 0n;

    if (feeMint === "So11111111111111111111111111111111111111112") {
        // Fee already in lamports
        feeInLamports = feeAmountTokens;
    } else {
        // Convert token fee → SOL lamports using your buyPriceSOL
        const feeInTokens = Number(feeAmountTokens) / (10 ** Number(outTokenDecimals));
        const feeInSOL = feeInTokens * buyPriceSOL; // SOL per token
        feeInLamports = BigInt(Math.floor(feeInSOL * Number(LAMPORTS_PER_SOL)));
    }

    // Example: base network fee in lamports
    
    let totalFee = feeInLamports + networkFeeLamports + priorityFeeInLamports;
    console.log("\nBuy Amount := ", buyAmountLamports , "\nTotal Fee := ", totalFee);
    
    // Net lamports after all fees
    return buyAmountLamports - totalFee;
    
}

export function calculateNetSellSolAmount(outAmountLamports, priorityFeeInLamports) {
    
    let totalFee = (priorityFeeInLamports + networkFeeLamports);

    console.log("\nSell Amount := ", outAmountLamports, "\nTotal Fee := ", totalFee);
    
    return outAmountLamports - totalFee;
}


