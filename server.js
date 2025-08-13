// server.js
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import { HttpsProxyAgent } from 'https-proxy-agent';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();
import session from 'express-session';
import {
    Connection,
    LAMPORTS_PER_SOL,
    VersionedTransaction,
} from '@solana/web3.js';
import { createWalletFromPrivateKey } from './helper/createWallet.js';
import { getAllProxies } from './helper/getAllProxies.js';
import { config } from './config/botConfig.js';
import { validateConfigInput } from './config/validateConfig.js';
import { tradeStats } from './helper/tradeStats.js';
import { isLaunchpadBlacklisted } from './helper/checkBlacklistLaunchpad.js';
import { tradeLogs, addTradeLog, recordLog } from './helper/tradeLogs.js';
import {
    calculateNetBuyAmountInSOL,
    calculateNetSellSolAmount,
} from './helper/calculateFee.js';

const PORT = process.env.PORT || 3001;
const EMAIL = process.env.EMAIL;
const PASS = process.env.PASS;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_session_key_here';

const app = express();
app.use(express.json());
app.use(
    cors({
        origin:
            process.env.NODE_ENV == 'dev'
                ? `http://localhost:5173`
                : 'http://srv951924.hstgr.cloud:4173',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true,
    })
);

// Secret for JWT

// Session middleware
app.use(
    session({
        secret: JWT_SECRET || 'super_secret_session_key_here',
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true, // Prevent JS access
            secure: false, // Set true if HTTPS
            maxAge: 24 * 60 * 60 * 1000, // 1 day
        },
    })
);

let connection = new Connection(
    config.rpcUrl ||
        'https://mainnet.helius-rpc.com/?api-key=663773ea-08b5-4edf-8347-14ed04e9dce6',
    'confirmed'
);
const knownTokens = new Set();
const backlistedTokenOwners = new Set();
let proxies;
let wallet;

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

async function fetchWithRetry(
    url,
    options = {},
    apiType = '',
    retries = 2,
    delayMs = 500
) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        const response = await fetch(url, options);

        if (response.status === 429) {
            console.warn(
                `🚫 429 Too Many Requests for ${apiType} API. Retrying after ${delayMs}ms...`
            );
            await new Promise((res) => setTimeout(res, delayMs));
        } else if (!response.ok) {
            throw new Error(`${apiType} API error: ${response.statusText}`);
        } else {
            return await response.json();
        }
    }
    throw new Error('Max retries reached for: ' + url);
}

// Filter NULL Quotes fetched by the getQuote function
function getQuottedTokens(tokensList) {
    return tokensList.filter((quoteToken) => quoteToken.quote !== null);
}

// Query `/quote` Jupiter API and return quote object
async function getQuote(inputMint, amount, slippageBps, tokensList, quoteType) {
    const results = [];

    // ✅ Use only proxies from index 0–9
    const shuffledProxies = shuffleArray(proxies.slice(0, 20));

    const batchSize = 3; // reduce concurrency

    for (let i = 0; i < tokensList.length; i += batchSize) {
        const batch = tokensList.slice(i, i + batchSize);

        const quoteBatch = await Promise.all(
            batch.map(async (token, index) => {
                try {
                    if (
                        !token?.id ||
                        typeof token.id !== 'string' ||
                        token.id.length < 32
                    ) {
                        console.log('❌ Invalid Token Id:', token);
                        return {
                            token,
                            quote: null,
                            error: 'Invalid token id',
                        };
                    }

                    const currentInput =
                        quoteType === 'OUT' ? token.outputMint : inputMint;
                    const currentOutput =
                        quoteType === 'OUT' ? inputMint : token.id;

                    // console.log(`Quote Details for ${token.symbol}:    ${currentInput}    ${currentOutput}    ${amount}     ${slippageBps}`);

                    const proxy =
                        shuffledProxies[(i + index) % shuffledProxies.length];

                    const url = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${currentInput}&outputMint=${currentOutput}&amount=${amount}&slippageBps=${slippageBps}`;
                    const data = await fetchWithRetry(
                        url,
                        {
                            agent: proxy
                                ? new HttpsProxyAgent(proxy)
                                : undefined,
                        },
                        'Quote'
                    );

                    // console.log("Quote fetched ======> ", data);

                    return { token, quote: data };
                } catch (err) {
                    console.warn(
                        `Quote failed for ${token?.symbol || 'unknown'}:`,
                        err.message
                    );
                    return { token, quote: null, error: err.message };
                }
            })
        );

        results.push(...quoteBatch);

        // Slight pause between batches to avoid burst rate limits
        await new Promise((res) => setTimeout(res, 300));
    }

    return results;
}

// Helper function
async function fetchSwapTransaction(quote, walletPubkey, index) {
    // console.log("---------------->>>>>>>>>>> ", quote, "     ", walletPubkey, "     ", index);

    // ✅ Slice proxies from index 10 to 19
    const usableProxies = shuffleArray(proxies.slice(20, 40));

    // ✅ Round-robin proxy from usable proxies
    const proxy = usableProxies[index % usableProxies.length];
    const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;

    const response = await fetchWithRetry(
        'https://quote-api.jup.ag/v6/swap',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userPublicKey: walletPubkey,
                quoteResponse: quote,
                prioritizationFeeLamports: {
                    priorityLevelWithMaxLamports: {
                        maxLamports: 10000,
                        priorityLevel: 'veryHigh',
                    },
                },
            }),
            agent,
        },
        'Swap'
    );

    return response;

    // if (!response.ok) {
    //     throw new Error(`Swap API error: ${response.statusText}`);
    // }

    // return await response.json();
}

async function swapToken(quoteArray, wallet, connection) {
    console.log('Buy Swap Calling...');

    for (let index = 0; index < quoteArray.length; index++) {
        const { token, quote } = quoteArray[index];

        tradeStats.totalBuys++;
        try {
            if (!quote?.routePlan) {
                tradeStats.failedBuys++;
                // tradeStats.totalTrades++;

                console.warn(`Skipping token: Invalid quote`);
                continue;
            }

            // ********** Checking Sell Quotes *************
            // ✅ Fetch sell quote IMMEDIATELY to verify it's swappable
            const preSellQuoteResult = await getQuote(
                config.inputMint,
                quote.outAmount,
                config.slippageBps,
                [{ ...token, outputMint: quote.outputMint }],
                'OUT'
            );

            const preSellQuote = getQuottedTokens(preSellQuoteResult)[0];
            if (!preSellQuote || !preSellQuote.quote?.routePlan) {
                console.warn(
                    `🚫 Skipping ${token.symbol}: No valid sell route`
                );
                tradeStats.failedBuys++;
                // tradeStats.totalTrades++;
                continue;
            }

            // ********** Checking Sell quotes **********

            const swapResponse = await fetchSwapTransaction(
                quote,
                wallet.publicKey.toBase58(),
                index
            );

            if (!swapResponse.swapTransaction) {
                // tradeStats.totalTrades++;
                tradeStats.failedBuys++;
                console.warn(`No transaction for current token`);
                continue;
            }

            const txBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
            const tx = VersionedTransaction.deserialize(txBuf);
            tx.sign([wallet]); // manually sign using Keypair

            const txid = await connection.sendRawTransaction(tx.serialize(), {
                skipPreflight: true,
            });

            console.log(
                `✅ *** Buy *** txn for ${token.symbol}, TXID: ${txid}`
            );

            const buySolAmount = Number(quote.inAmount) / 10 ** 9; // lamports → SOL
            const buyTokenAmount =
                Number(quote.outAmount) / 10 ** Number(token.decimals); // adjust decimals
            const buyPrice = buySolAmount / buyTokenAmount;

            // Add Fee calculation logic
            const netBuyAmount = calculateNetBuyAmountInSOL(
                quote,
                buyPrice,
                BigInt(swapResponse.prioritizationFeeLamports),
                Number(token.decimals)
            );

            tradeStats.successfulBuys++;
            // tradeStats.totalTrades++;
            tradeStats.totalBuyingAmount =
                BigInt(tradeStats.totalBuyingAmount) + netBuyAmount;

            // *** Record Logs ***
            // addTradeLog(
            //     'BUY',
            //     token.symbol,
            //     token.id,
            //     quote.inAmount,
            //     buyPrice,
            //     0
            // );

            recordLog("BUY", token.symbol, token.id, netBuyAmount);

            // ****** Schedule Re-sell after delay (sellTimer) ******
            setTimeout(async () => {
                // console.log('********** Indide sell **********');
                console.log('Sell Swap Calling...');
                tradeStats.totalSells++;
                try {
                    const sellQuoteResult = await getQuote(
                        config.inputMint, // received amount from buy
                        quote.outAmount,
                        config.slippageBps,
                        [
                            {
                                ...token,
                                outputMint: quote.outputMint,
                                // outAmount: quote.outAmount,
                            },
                        ],
                        'OUT'
                    );

                    const sellQuote = getQuottedTokens(sellQuoteResult)[0];
                    if (!sellQuote) {
                        console.log(
                            `❌ Could not get sell quote for ${token.symbol}, Liq ${token.liquidity}`
                        );
                        
                        recordLog("SELL", token.symbol, token.id, netBuyAmount, 0, true);
                        
                        tradeStats.failedSells++;
                        tradeStats.failedTrades++;
                        return;
                    }
                    // console.log("==========>>>>>>>>>    ", sellQuote);

                    const sellTxData = await fetchSwapTransaction(
                        sellQuote.quote,
                        wallet.publicKey.toBase58(),
                        index
                    );
                    const sellTxBuf = Buffer.from(
                        sellTxData.swapTransaction,
                        'base64'
                    );
                    const sellTx = VersionedTransaction.deserialize(sellTxBuf);
                    sellTx.sign([wallet]);

                    const sellTxid = await connection.sendRawTransaction(
                        sellTx.serialize(),
                        {
                            skipPreflight: true,
                        }
                    );
                    if (!sellTxData || !sellTxData.swapTransaction) {
                        throw new Error(
                            'Swap transaction is null or malformed'
                        );
                    }

                    console.log(
                        `💰 *** SELL *** txn for ${token.symbol}, TXID: ${sellTxid}`
                    );

                    tradeStats.successfulSells++;
                    tradeStats.totalTrades++;

                    const sellTokenAmount =
                        Number(quote.inAmount) / 10 ** Number(token.decimals); // lamports → SOL
                    const sellSolAmount = Number(quote.outAmount) / 10 ** 9; // adjust decimals
                    const sellPrice = sellSolAmount / sellTokenAmount;

                    const netSellAmount = calculateNetSellSolAmount(
                        BigInt(sellQuote.quote.outAmount),
                        BigInt(sellTxData.prioritizationFeeLamports)
                    );

                    tradeStats.totalSellingAmount =
                        BigInt(tradeStats.totalSellingAmount) +
                        BigInt(netSellAmount);

                    const profitInLamports = netSellAmount - netBuyAmount;

                    if (profitInLamports > 0n) {
                        tradeStats.successfulTrades++;
                    }
                    console.log(
                        `Profit: ${Number(profitInLamports) / 1e9} SOL`
                    );

                    // *** Record Logs ***
                    recordLog("SELL", token.symbol, token.id, netBuyAmount, netSellAmount);

                    // addTradeLog(
                    //     'SELL',
                    //     token.symbol,
                    //     token.id,
                    //     quote.inAmount,
                    //     sellPrice,
                    //     Number(profitInLamports) / 1e9
                    // );
                } catch (err) {
                    console.error(
                        `❌ Sell failed for ${token?.symbol}:`,
                        err.message
                    );
                    console.log('Sell Error Details := ', err);
                    
                    backlistedTokenOwners.add(token.dev);
                    tradeStats.failedSells++;
                    tradeStats.failedTrades++;
                    
                    recordLog("SELL", token.symbol, token.id, netBuyAmount, 0, true);
                }
            }, config.sellTimer * 1000); // Delay in ms
            // ******** Reswap logic **********
        } catch (err) {
            console.error(`❌ Swap failed for ${token?.symbol}:`, err.message);
            console.log('Full Error Details := ', err);
            tradeStats.failedTrades++;
            tradeStats.failedBuys++;
        }
    }
}

let isFirstRun = true;
let botActive = false;
let botLoopTimeoutId = null; // 🆕 Track setTimeout

// This is the main bot function which triggered by the '/start-sniper-bot' API and then starts trading
async function startBotForever() {
    // console.log(
    //     `[${new Date().toLocaleTimeString()}] >>> StartBotForever called`
    // );

    // setInterval(async () => {
    // if (!botActive) return;

    try {
        const newTokens = [];

        const recentProxies = proxies.slice(40, 50);
        const shuffledRecentProxies = shuffleArray(recentProxies);
        const selectedProxy = shuffledRecentProxies[0];

        const tokens = await fetchWithRetry(
            'https://lite-api.jup.ag/tokens/v2/recent',
            {
                agent: selectedProxy.length
                    ? new HttpsProxyAgent(selectedProxy)
                    : undefined,
            },
            'RecentToken'
        );

        // for(const token of tokens) {
        //     console.log(token.id, "      ", token.symbol);

        // }

        for (const token of tokens) {
            if (
                !knownTokens.has(token.id) &&
                !backlistedTokenOwners.has(token.dev) &&
                token.liquidity &&
                token.liquidity >= config.minLiquidity && // Check for min liquidity
                token?.audit?.topHoldersPercentage &&
                token.audit.topHoldersPercentage <=
                    config.topHoldersPercentage && // Should less than or equals to top holder percentage
                !isLaunchpadBlacklisted(token.launchpad) // Checks whether token launchpad belongs from blacklisted launchpads
            ) {
                knownTokens.add(token.id);
                newTokens.push(token);
                // if(token.liquidity) console.log(token.liquidity, "  =====  ", token?.audit?.topHoldersPercentage, "  =====  ", token?.launchpad ? isLaunchpadBlacklisted(token.launchpad) : false);
            }
        }

        // ⏸️ First-time delay
        if (isFirstRun && newTokens.length > 0) {
            console.log('⏸️ First run: waiting 3 seconds before quoting...');
            isFirstRun = false;

            setTimeout(() => {
                console.log(
                    '<<<<<<<<<<<<<<<<<<<<<<<<<<< Delay >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>'
                );
                if (botActive) startBotForever(); // resume only if still active
            }, 7000);

            return; // ⛔ Exit now — don’t proceed to quote this batch
        }

        if (newTokens.length) {
            console.log('New Tokens Arrived ========> ', newTokens.length);

            // Genereate Quote Tokens ( SOL ----> Token )
            const buyQuoteResult = await getQuote(
                config.inputMint,
                config.amount,
                config.slippageBps,
                newTokens,
                'IN'
            );

            const buyQuoteTokens = getQuottedTokens(buyQuoteResult);
            console.log('Buy Quoted Tokens ======> ', buyQuoteTokens.length);

            await swapToken(buyQuoteTokens, wallet, connection);
        }
    } catch (error) {
        console.log('Error occured := ', error);
    }
    // }, 1000);

    // 🔁 Continue the loop every 1 second
    if (botActive) {
        botLoopTimeoutId = setTimeout(startBotForever, 1000);
    }
}

app.put('/toggleBot', async (req, res) => {
    if (!config.privateKey) {
        return res.status(400).json({
            message: 'Private key is invalid or not set!',
        });
    }

    config.isBotStarted = !config.isBotStarted;
    botActive = config.isBotStarted;
    isFirstRun = true; // reset for next start

    if (botActive) {
        console.log('🤖 Bot starting...');
        startBotForever();
    } else {
        console.log('🛑 Bot stopped.');
        if (botLoopTimeoutId) {
            clearTimeout(botLoopTimeoutId);
            botLoopTimeoutId = null;
        }
    }

    return res.status(200).json({
        message: 'Bot toggled successfully!',
        botStatus: config.isBotStarted,
    });
});

app.post('/set-bot-config', async (req, res) => {
    try {
        const errors = validateConfigInput(req.body);

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid config fields',
                errors,
            });
        }

        const {
            amount,
            minLiquidity,
            inputMint,
            slippageBps,
            sellTimer,
            rpcUrl,
            privateKey,
            topHoldersPercentage,
        } = req.body;

        config.amount = amount * LAMPORTS_PER_SOL;
        config.minLiquidity = Number(minLiquidity);
        config.inputMint = inputMint;
        config.slippageBps = slippageBps * 100;
        config.sellTimer = sellTimer;
        config.privateKey = privateKey;
        config.rpcUrl = rpcUrl || config.rpcUrl;
        config.topHoldersPercentage = Number(topHoldersPercentage);

        // console.log('Config: ', config);

        wallet = createWalletFromPrivateKey(privateKey);
        console.log('Wallet Address:', wallet.publicKey.toBase58());

        if (config.rpcUrl) {
            connection = new Connection(config.rpcUrl, 'confirmed');
        }

        // Fetching the proxies
        proxies = await getAllProxies();
        console.log('Total Proxies : ', proxies.length);

        if (!proxies || !proxies.length) {
            console.error('Error fetching the Proxies!');
        }

        console.log('Config set successfully!');

        return res.status(200).json({
            message: 'Bot settings updated successfully',
            status: 200,
        });
    } catch (err) {
        console.error('Error in /start-sniper-bot API \n', err.message);

        let errMessage = 'Internal Server errror!';
        let errCode = 500;

        if (err?.message.includes('Non-base58')) {
            errMessage = 'invalid private key: ' + err.message;
            errCode = 400;
        }
        return res.status(errCode).json({
            message: errMessage,
            status: errCode,
            error: err,
        });
    }
});

app.get('/getStats', async (req, res) => {
    try {
        return res.status(200).json({
            ...tradeStats,
            totalBuyingAmount: (
                Number(tradeStats.totalBuyingAmount) / LAMPORTS_PER_SOL
            ).toFixed(9),
            totalSellingAmount: (
                Number(tradeStats.totalSellingAmount) / LAMPORTS_PER_SOL
            ).toFixed(9),
            totalProfit: (
                Number(tradeStats.totalProfit) / LAMPORTS_PER_SOL
            ).toFixed(9),
            botStatus: config.isBotStarted,
            isConfigUpdated: config.privateKey != null,
        });
    } catch (err) {
        console.log('Error in getting stats := ', err);
        return res.status(500).json({
            message: 'Internal server error!',
            error: err.message,
        });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        let token, message, status;

        if (!EMAIL || !PASS) {
            status = 403;
            message = 'User not found or registered!';
        } else if (email === EMAIL && password === PASS) {
            // Create token valid for 1 day
            token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '1d' });
            req.session.token = token;
            status = 200;
            message = 'Login successful!';
        } else {
            status = 401;
            message = 'Invalid Email or Password';
        }

        return res.status(status).json({
            status,
            message,
            token,
        });
    } catch (err) {
        console.log(err);

        return res.status(500).json({
            message: 'Internal server error!',
            error: err.message,
        });
    }
});

app.post('/logout', async (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ message: 'Error logging out' });
        }
        res.clearCookie('connect.sid'); // Clear the session cookie
        return res.json({ status: 200, message: 'Logged out successfully' });
    });
});

// API to fetch logs
app.get('/getTradeLogs', (req, res) => {
    return res.json(tradeLogs);
});

// Testing API
app.get('/test', (req, res) => {
    res.json({ message: 'Hello from backend' });
});

app.listen(PORT, '0.0.0.0', () =>
    console.log(`Server running on PORT: ${PORT} `)
);
