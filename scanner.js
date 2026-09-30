require("dotenv").config();
const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const fs = require("fs");
const calculateRadarScore = require("./score");

const app = express();
const server = http.createServer(app);
const dashboardWss = new WebSocket.Server({ server });

app.use(express.static("public"));

function broadcast(type, payload) {
  const message = JSON.stringify({ type, payload });
  dashboardWss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;

const WS_URL =
  process.env.CUSTOM_WS_URL || `wss://beta.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const TRANSACTION_RPC_URL =
  process.env.CUSTOM_RPC_URL || "https://api.mainnet.solana.com";
const HELIUS_RPC_URL =
  `https://beta.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const PUMP_FUN_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

fs.mkdirSync("data", { recursive: true });

const priceQueue = [];
let transactionRequestChain = Promise.resolve();
let birdeyeRequestChain = Promise.resolve();

const tokenStates = new Map();
let trackedTokensCount = 0;
const MAX_TRACKED_TOKENS = 15;

const ws = new WebSocket(WS_URL);

ws.on("open", () => {
  console.log("Connected to Solana!");
  console.log("⚡ CRYPTO TOKEN RADAR ACTIVE");
  console.log("Watching Pump.fun...\n");

  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "logsSubscribe",
      params: [{ mentions: [PUMP_FUN_PROGRAM] }, { commitment: "confirmed" }]
    })
  );
});

ws.on("error", (error) => console.log("Connection error:", error.message));

ws.on("message", async (data) => {
  const message = JSON.parse(data.toString());
  if (message.method !== "logsNotification") return;

  const value = message.params.result.value;
  const logs = value.logs || [];
  if (!logs.some((log) => log.includes("Instruction: InitializeMint2"))) return;

  const transaction = await getTransaction(value.signature);
  if (!transaction) return;

  const accounts = transaction.transaction.message.accountKeys;
  const creator = accounts[0].pubkey;
  const token = accounts[1].pubkey;

  const { name, symbol } = await getTokenInfo(token);

  const creatorStats = getCreatorStats(creator);
  const creatorTotal = creatorStats.total + 1;
  const creatorRecent = creatorStats.recent + 1;

  const record = {
    detectedAt: new Date().toISOString(),
    name,
    symbol,
    mint: token,
    creator,
    signature: value.signature,
    creatorLaunchesSeen: creatorTotal,
    creatorLaunches10m: creatorRecent
  };

  saveToken(record);

  tokenStates.set(token, {
    name,
    symbol,
    creatorTotal,
    creatorRecent,
    holderStatus: "UNKNOWN",
    returnPercent: 0,
    holderMetrics: {}
  });

  const scoring = calculateRadarScore({
    creatorTotal,
    creatorRecent,
    holderStatus: "UNKNOWN",
    returnPercent: 0
  });

  // Terminal Output
  console.log("");
  console.log("🚀 CRYPTO TOKEN RADAR ANALYSIS");
  console.log("==========================");
  console.log("Token:", name);
  console.log("Ticker:", symbol);
  console.log("Mint:", token);
  console.log("");
  console.log("Creator:", creator);
  console.log("");
  console.log(`🔥 Radar Score: ${scoring.score}/100 [${scoring.tier}]`);
  console.log("");
  console.log("📊 Signals:");
  scoring.signals.forEach((s) => console.log(s));
  console.log("==========================");
  console.log("Creator launches seen:", creatorTotal);
  console.log("Creator launches last 10 min:", creatorRecent);
  if (creatorRecent >= 3) {
    console.log("⚠️ RAPID-FIRE CREATOR");
  }
  console.log("Transaction:", value.signature);
  console.log("Time:", new Date().toLocaleTimeString());
  console.log("--------------------------------");

  // Broadcast to Web Dashboard
  broadcast("TOKEN_LAUNCH", {
    mint: token,
    name,
    symbol,
    creator,
    creatorTotal,
    creatorRecent,
    score: scoring.score,
    tier: scoring.tier,
    signals: scoring.signals
  });

  setTimeout(() => addToPriceQueue(record), 10000);
  setTimeout(() => runHolderRiskPipeline(token, name, symbol), 12000);
});

// ==========================================
// HOLDER RISK PIPELINE
// ==========================================
async function runHolderRiskPipeline(mint, name, symbol, attempt = 1) {
  try {
    const risk = await checkHolderRisk(mint);

    if (!risk || risk.status === "INDEXING" || risk.status === "WAIT") {
      if (attempt <= 3) {
        setTimeout(() => runHolderRiskPipeline(mint, name, symbol, attempt + 1), 15000);
      }
      return;
    }

    const current = tokenStates.get(mint);
    if (!current) return;

    current.holderStatus = risk.status;
    current.holderMetrics = risk;

    const scoring = calculateRadarScore({
      creatorTotal: current.creatorTotal,
      creatorRecent: current.creatorRecent,
      ...risk,
      returnPercent: current.returnPercent,
      isPriced: Boolean(current.initialPrice)
    });

    let riskIcon = "🟢";
    if (risk.status === "WAIT" || risk.status === "INDEXING") riskIcon = "⚪";
    else if (risk.status === "WATCH") riskIcon = "🟡";
    else if (risk.status === "REJECT") riskIcon = "🔴";

    console.log("");
    console.log("🛡️ HOLDER RISK AUDIT");
    console.log("------------------------------");
    console.log("Name:", name);
    console.log("Ticker:", symbol);
    console.log("Mint:", mint);
    console.log("");
    console.log("Bundlers:", risk.bundlerPercent.toFixed(2) + "%");
    console.log("Snipers:", risk.sniperPercent.toFixed(2) + "%");
    console.log("Insiders:", risk.insiderPercent.toFixed(2) + "%");
    console.log("Dev:", risk.devPercent.toFixed(2) + "%");
    console.log("Smart traders:", risk.smartTraderPercent.toFixed(2) + "%");
    console.log("Holder count:", risk.holderCount);
    console.log("Top 10 wallets:", risk.top10Percent.toFixed(2) + "%");
    console.log("");
    console.log("Risk status:", riskIcon, risk.status);
    console.log("Reason:", risk.reason);
    console.log(`⭐ Updated Radar Score: ${scoring.score}/100 [${scoring.tier}]`);
    console.log("------------------------------");

    // Broadcast Audit to Web Dashboard
    broadcast("HOLDER_AUDIT", {
      mint,
      ...risk,
      score: scoring.score,
      tier: scoring.tier,
      signals: scoring.signals
    });
  } catch (err) {}
}

function classifyHolderRisk(
  holderCount,
  top10Percent,
  bundlerPercent,
  sniperPercent,
  insiderPercent,
  devPercent
) {
  let riskStatus = "PASS";
  let riskReason = "Holder structure looks acceptable.";

  if (holderCount === 0) {
    riskStatus = "INDEXING";
    riskReason = "Holder data is not indexed yet.";
  } else if (holderCount < 10) {
    riskStatus = "WAIT";
    riskReason = "Not enough holders yet.";
  } else if (bundlerPercent >= 10 || insiderPercent >= 5) {
    riskStatus = "REJECT";
    riskReason = "High bundler or insider concentration.";
  } else if (devPercent >= 10 || top10Percent >= 70) {
    riskStatus = "REJECT";
    riskReason = "Ownership concentration is too high.";
  } else if (
    bundlerPercent >= 5 ||
    insiderPercent >= 2 ||
    devPercent >= 5 ||
    sniperPercent >= 10 ||
    top10Percent >= 50
  ) {
    riskStatus = "WATCH";
    riskReason = "Some holder-risk signals need monitoring.";
  }

  return { status: riskStatus, reason: riskReason };
}

async function checkHolderRisk(mint) {
  const profileUrl = `https://public-api.birdeye.so/token/v1/holder-profile?token_address=${mint}&interval=1h&include_zero_balance=false`;
  const profileResponse = await limitedBirdeyeFetch(profileUrl, {
    headers: { "X-API-KEY": BIRDEYE_API_KEY, "x-chain": "solana" }
  });
  const profileData = await profileResponse.json();
  if (!profileData.success || !profileData.data) return null;

  const tags = profileData.data.tags || [];
  function getTagPercent(tagName) {
    const tag = tags.find((item) => item.tag === tagName);
    return tag ? Number(tag.percent_of_supply) : 0;
  }

  const bundlerPercent = getTagPercent("bundler");
  const sniperPercent = getTagPercent("sniper");
  const insiderPercent = getTagPercent("insider");
  const devPercent = getTagPercent("dev");
  const smartTraderPercent = getTagPercent("smart_trader");

  const holdersUrl = `https://public-api.birdeye.so/defi/v3/token/holder?address=${mint}&offset=0&limit=10&mode=wallet`;
  const holdersResponse = await limitedBirdeyeFetch(holdersUrl, {
    headers: { "X-API-KEY": BIRDEYE_API_KEY, "x-chain": "solana" }
  });
  const holdersData = await holdersResponse.json();
  if (!holdersData.success || !holdersData.data) return null;

  const holderCount = Number(holdersData.data.holder ?? 0);
  const top10Percent = Number(holdersData.data.top10_hold_percent ?? 0);

  const classification = classifyHolderRisk(
    holderCount,
    top10Percent,
    bundlerPercent,
    sniperPercent,
    insiderPercent,
    devPercent
  );

  return {
    holderCount,
    top10Percent,
    bundlerPercent,
    sniperPercent,
    insiderPercent,
    devPercent,
    smartTraderPercent,
    status: classification.status,
    reason: classification.reason
  };
}

// ==========================================
// PRICE ENGINE & QUEUE
// ==========================================
async function getBirdeyePrice(mint) {
  const url = `https://public-api.birdeye.so/defi/price?address=${mint}`;
  const response = await limitedBirdeyeFetch(url, {
    headers: { "X-API-KEY": BIRDEYE_API_KEY, "x-chain": "solana" }
  });
  const data = await response.json();
  if (!data.success || !data.data || typeof data.data.value !== "number") return null;
  return data.data.value;
}

function addToPriceQueue(record) {
  priceQueue.push(record);
}

async function processPriceQueue() {
  if (priceQueue.length === 0) return;
  const record = priceQueue.shift();
  const price = await getBirdeyePrice(record.mint);

  const checkedAt = new Date();
  const secondsAfterLaunch = Math.round(
    (checkedAt.getTime() - new Date(record.detectedAt).getTime()) / 1000
  );

  if (record.trackingOnly) {
    let returnPercent = null;
    if (price !== null && typeof record.initialPrice === "number" && record.initialPrice > 0) {
      returnPercent = ((price - record.initialPrice) / record.initialPrice) * 100;
    }

    saveMarketCheck({
      checkedAt: checkedAt.toISOString(),
      mint: record.mint,
      name: record.name,
      symbol: record.symbol,
      checkpoint: record.checkpoint,
      secondsAfterLaunch,
      initialPrice: record.initialPrice,
      price,
      returnPercent,
      status: price === null ? "not_ready" : "priced"
    });

    console.log("");
    console.log("📈 PERFORMANCE CHECK");
    console.log("Name:", record.name);
    console.log("Ticker:", record.symbol);
    console.log("Checkpoint:", record.checkpoint);
    console.log("Seconds after launch:", secondsAfterLaunch);
    console.log("Initial price:", record.initialPrice);
    console.log("Current price:", price);
    if (returnPercent !== null) {
      const sign = returnPercent >= 0 ? "+" : "";
      console.log("Return:", `${sign}${returnPercent.toFixed(2)}%`);

      const current = tokenStates.get(record.mint);
      if (current) {
        current.returnPercent = returnPercent;
        const scoring = calculateRadarScore({
          creatorTotal: current.creatorTotal,
          creatorRecent: current.creatorRecent,
          ...current.holderMetrics,
          returnPercent,
          isPriced: true
        });
        console.log(`⭐ Updated Radar Score: ${scoring.score}/100 [${scoring.tier}]`);

        // Broadcast Price Update to Web Dashboard
        broadcast("PRICE_CHECK", {
          mint: record.mint,
          checkpoint: record.checkpoint,
          returnPercent,
          score: scoring.score,
          tier: scoring.tier,
          signals: scoring.signals
        });
      }
    }
    console.log("------------------------------");
    return;
  }

  const attempt = (record.priceAttempts || 0) + 1;
  if (price === null) {
    record.priceAttempts = attempt;
    saveMarketCheck({
      checkedAt: checkedAt.toISOString(),
      mint: record.mint,
      name: record.name,
      symbol: record.symbol,
      secondsAfterLaunch,
      attempt,
      price: null,
      status: "not_ready"
    });

    console.log("");
    console.log("⏳ PRICE NOT READY");
    console.log("Name:", record.name);
    console.log("Attempt:", record.priceAttempts);

    if (attempt <= 2) {
      console.log(`Retrying in ${attempt === 1 ? 20 : 30} seconds...`);
      setTimeout(() => addToPriceQueue(record), attempt === 1 ? 20000 : 30000);
    }
    return;
  }

  saveMarketCheck({
    checkedAt: checkedAt.toISOString(),
    mint: record.mint,
    name: record.name,
    symbol: record.symbol,
    secondsAfterLaunch,
    attempt,
    price,
    status: "priced"
  });

  record.initialPrice = price;
  const current = tokenStates.get(record.mint);
  if (current) current.initialPrice = price;

  console.log("");
  console.log("💰 MARKET CHECK");
  console.log("Name:", record.name);
  console.log("Ticker:", record.symbol);
  console.log("Price:", price);
  console.log("Seconds after launch:", secondsAfterLaunch);
  console.log("------------------------------");

  schedulePerformanceTracking(record);
}

function schedulePerformanceTracking(record) {
  if (trackedTokensCount >= MAX_TRACKED_TOKENS) return;
  trackedTokensCount++;

  const checkpoints = [
    { label: "30s", seconds: 30 },
    { label: "60s", seconds: 60 },
    { label: "5m", seconds: 300 }
  ];

  for (const checkpoint of checkpoints) {
    const launchTime = new Date(record.detectedAt).getTime();
    const delay = checkpoint.seconds * 1000 - (Date.now() - launchTime);
    if (delay > 0) {
      setTimeout(() => {
        addToPriceQueue({ ...record, trackingOnly: true, checkpoint: checkpoint.label });
      }, delay);
    }
  }
}

// Helpers
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function limitedTransactionFetch(options) {
  const request = transactionRequestChain.then(async () => {
    const response = await fetch(TRANSACTION_RPC_URL, options);
    await wait(1000);
    return response;
  });
  transactionRequestChain = request.catch(() => {});
  return request;
}

function limitedBirdeyeFetch(url, options) {
  const request = birdeyeRequestChain.then(async () => {
    const response = await fetch(url, options);
    await wait(1100);
    return response;
  });
  birdeyeRequestChain = request.catch(() => {});
  return request;
}

async function getTransaction(signature) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await limitedTransactionFetch({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: [
            signature,
            {
              encoding: "jsonParsed",
              commitment: "confirmed",
              maxSupportedTransactionVersion: 0
            }
          ]
        })
      });

      const text = await response.text();
      if (response.ok) {
        try {
          const data = JSON.parse(text);
          if (data.result) return data.result;
        } catch {}
      }
    } catch (error) {}

    if (attempt < 3) await wait(500 * attempt);
  }
  return null;
}

async function getTokenInfo(mint, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(HELIUS_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getAsset",
          params: { id: mint, options: { showFungible: true } }
        })
      });
      const data = await response.json();
      const name = data?.result?.content?.metadata?.name;
      const symbol =
        data?.result?.content?.metadata?.symbol ||
        data?.result?.token_info?.symbol;

      if (name && name !== "Unknown") {
        return { name, symbol: symbol || "N/A" };
      }
    } catch (e) {}

    if (i < retries) await wait(1800);
  }
  return { name: "Unknown", symbol: "Unknown" };
}

function saveToken(record) {
  fs.appendFileSync("data/launches.jsonl", JSON.stringify(record) + "\n");
}
function saveMarketCheck(check) {
  fs.appendFileSync("data/market-checks.jsonl", JSON.stringify(check) + "\n");
}

function getCreatorStats(creator) {
  if (!fs.existsSync("data/launches.jsonl")) return { total: 0, recent: 0 };
  const file = fs.readFileSync("data/launches.jsonl", "utf8");
  const lines = file.split("\n").filter(Boolean);
  let total = 0, recent = 0;
  const now = Date.now();
  for (const line of lines) {
    try {
      const record = JSON.parse(line);
      if (record.creator === creator) {
        total++;
        if (now - new Date(record.detectedAt).getTime() <= 600000) recent++;
      }
    } catch (e) {}
  }
  return { total, recent };
}

setInterval(processPriceQueue, 1100);

// Start the Dashboard Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 Live Dashboard running at http://localhost:${PORT}`);
});