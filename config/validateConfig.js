export function validateConfigInput({ 
  amount,
  minLiquidity,
  inputMint,
  slippageBps,
  sellTimer,
  rpcUrl,
  privateKey,
}) {
  const errors = [];

  if (typeof amount !== 'number' || amount <= 0) {
    errors.push('❌ amount must be a positive number');
  }

  if (typeof minLiquidity !== 'number' || minLiquidity < 0) {
    errors.push('❌ minLiquidity must be a non-negative number');
  }

  if (!inputMint || typeof inputMint !== 'string') {
    errors.push('❌ inputMint must be a valid string');
  }

  if (
    typeof slippageBps !== 'number' ||
    slippageBps <= 0 ||
    slippageBps > 10
  ) {
    errors.push('❌ slippageBps must be a number between 1 and 10000');
  }

  if (typeof sellTimer !== 'number' || sellTimer < 0) {
    errors.push('❌ sellTimer must be a non-negative number');
  }

  if (rpcUrl && typeof rpcUrl !== 'string') {
    errors.push('❌ RPC Url must be of type string');
  }
  if (!privateKey && typeof privateKey !== 'string') {
    errors.push('❌ privateKey must be null or a base58/base64 string');
  }

  return {
    amount,
    minLiquidity,
    inputMint,
    slippageBps,
    sellTimer,
    privateKey,
  };
}
