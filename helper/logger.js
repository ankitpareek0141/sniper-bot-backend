export function logSwapStep(tokenSymbol, message, type = 'info') {
    const prefix = {
        info: 'ℹ️',
        success: '✅',
        error: '❌',
        swap: '🔄',
        sell: '💰',
    }[type];
    console.log(`${prefix} [${tokenSymbol}] ${message}`);
}
