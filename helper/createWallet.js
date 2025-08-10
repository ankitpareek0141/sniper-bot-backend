import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58'

/**
 * Create wallet from Base58-encoded or Uint8Array or stringified key array
 */
export function createWalletFromPrivateKey(secretKeyInput) {
    let keypair;

    if (typeof secretKeyInput === 'string') {
        try {
            // Try JSON parse first
            const parsed = JSON.parse(secretKeyInput);
            const secretKey = Uint8Array.from(parsed);
            keypair = Keypair.fromSecretKey(secretKey);
        } catch {
            // If not JSON, treat as Base58
            const decoded = bs58.decode(secretKeyInput);
            keypair = Keypair.fromSecretKey(decoded);
        }
    } else if (secretKeyInput instanceof Uint8Array) {
        keypair = Keypair.fromSecretKey(secretKeyInput);
    } else {
        throw new Error("Invalid secret key format");
    }

    return keypair;
}

