require("dotenv").config();
const WebSocket = require("ws");
const fs = require("fs");
const calculateRadarScore = require("./score");

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY;

const WS_URL =
  `wss://beta.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const TRANSACTION_RPC_URL =
  "https://api.mainnet.solana.com";

const HELIUS_RPC_URL =
  `https://beta.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const PUMP_FUN_PROGRAM =
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
fs.mkdirSync("data", { recursive: true });

const priceQueue = [];

let transactionRequestChain =
  Promise.resolve();

let birdeyeRequestChain =
  Promise.resolve();

let holderRiskTestDone = false;

let trackedTokens = 0;

const MAX_TRACKED_TOKENS = 10;

const ws = new WebSocket(WS_URL);

ws.on("open", () => {
  console.log("Connected to Solana!");
  console.log("Watching Pump.fun...");

  const request = {
    jsonrpc: "2.0",
    id: 1,
    method: "logsSubscribe",
    params: [
      {
        mentions: [PUMP_FUN_PROGRAM]
      },
      {
        commitment: "confirmed"
      }
    ]
  };

  ws.send(JSON.stringify(request));
});

ws.on("error", (error) => {
  console.log("Connection error:", error.message);
});

ws.on("message", async (data) => {
  const message = JSON.parse(data.toString());

  if (message.method !== "logsNotification") {
    return;
  }

  const value = message.params.result.value;
  const logs = value.logs || [];

  const isNewToken = logs.some((log) =>
    log.includes("Instruction: InitializeMint2")
  );

  if (!isNewToken) {
    return;
  }

const transaction = await getTransaction(value.signature);

if (!transaction) {
  console.log("Could not fetch transaction.");
  return;
}

const accounts =
  transaction.transaction.message.accountKeys;

const creator = accounts[0].pubkey;
const token = accounts[1].pubkey;

const tokenInfo = await getTokenInfo(token);

const name =
  tokenInfo?.content?.metadata?.name || "Unknown";

const symbol =
  tokenInfo?.content?.metadata?.symbol ||
  tokenInfo?.token_info?.symbol ||
  "Unknown";

const creatorStats =
  getCreatorStats(creator);

const creatorTotal =
  creatorStats.total + 1;

const creatorRecent =
  creatorStats.recent + 1;

const record = {
  detectedAt: new Date().toISOString(),
  name: name,
  symbol: symbol,
  mint: token,
  creator: creator,
  signature: value.signature,
  creatorLaunchesSeen: creatorTotal,
  creatorLaunches10m: creatorRecent
};

saveToken(record);
setTimeout(() => {
  addToPriceQueue(record);
}, 10000);

if (!holderRiskTestDone && token) {
  holderRiskTestDone = true;

  console.log("");
  console.log("🧪 Testing holder risk...");
  console.log("Mint:", token);

  setTimeout(() => {
  checkHolderRisk(token)
    .then((risk) => {
      console.log("");
      console.log("🛡️ HOLDER RISK RESULT");
      console.log("------------------------------");

      if (risk === null) {
        console.log(
          "Holder risk data unavailable."
        );
      } else {
        console.log(
          "Holder count:",
          risk.holderCount
        );

        console.log(
          "Top 10 wallets:",
          risk.top10Percent.toFixed(2) + "%"
        );

        console.log(
          "Bundlers:",
          risk.bundlerPercent.toFixed(2) + "%"
        );

        console.log(
          "Snipers:",
          risk.sniperPercent.toFixed(2) + "%"
        );

        console.log(
          "Insiders:",
          risk.insiderPercent.toFixed(2) + "%"
        );

        console.log(
          "Dev:",
          risk.devPercent.toFixed(2) + "%"
        );

        console.log(
          "Status:",
          risk.status
        );

        console.log(
          "Reason:",
          risk.reason
        );

        if (
  risk.status === "WAIT" ||
  risk.status === "INDEXING"
) {
  console.log(
    "⏳ Holder data not ready — rechecking in 30 seconds..."
  );

  setTimeout(() => {
    checkHolderRisk(token)
      .then((recheckRisk) => {
        console.log("");
        console.log("🔄 HOLDER RISK RECHECK");
        console.log("------------------------------");

        if (recheckRisk === null) {
          console.log(
            "Holder risk data unavailable."
          );
        } else {
          console.log(
            "Holder count:",
            recheckRisk.holderCount
          );

          console.log(
            "Top 10 wallets:",
            recheckRisk.top10Percent.toFixed(2) + "%"
          );

          console.log(
            "Bundlers:",
            recheckRisk.bundlerPercent.toFixed(2) + "%"
          );

          console.log(
            "Snipers:",
            recheckRisk.sniperPercent.toFixed(2) + "%"
          );

          console.log(
            "Insiders:",
            recheckRisk.insiderPercent.toFixed(2) + "%"
          );

          console.log(
            "Dev:",
            recheckRisk.devPercent.toFixed(2) + "%"
          );

          console.log(
            "Status:",
            recheckRisk.status
          );

          console.log(
            "Reason:",
            recheckRisk.reason
          );

          if (
  recheckRisk.status === "WAIT" ||
  recheckRisk.status === "INDEXING"
) {
  console.log(
    "⏳ Still not ready — final recheck in 45 seconds..."
  );

  setTimeout(() => {
    checkHolderRisk(token)
      .then((finalRisk) => {
        printHolderRiskResult(
  "🏁 FINAL HOLDER RISK CHECK",
  finalRisk
);
})
      .catch((error) => {
        console.log(
          "Final holder risk check error:",
          error.message
        );
      });
  }, 45000);
}
        }

        console.log("------------------------------");
      })
      .catch((error) => {
        console.log(
          "Holder risk recheck error:",
          error.message
        );
      });
  }, 30000);
}
      }

      console.log("------------------------------");
    })
        .catch((error) => {
      console.log(
        "Holder risk test error:",
        error.message
      );
    });
}, 15000);
}

console.log("");
console.log("🚀 RADAR ANALYSIS");
console.log("==========================");

console.log("Token:", name);
console.log("Ticker:", symbol);
console.log("Mint:", token);

console.log("");
console.log("Creator:", creator);

const radarScore = calculateRadarScore({
    creatorLaunches: creatorTotal,
    holderStatus: "UNKNOWN",
    returnPercent: 0
});

console.log("");
console.log("🔥 Radar Score:", radarScore + "/100");

console.log("");
console.log("📊 Signals:");

console.log(
    creatorTotal >= 3
        ? "🟢 Experienced creator"
        : "🟡 New creator"
);

console.log("🟡 Holder analysis pending");
console.log("⚪ Performance analysis pending");

console.log("==========================");

console.log("Creator launches seen:", creatorTotal);
console.log("Creator launches last 10 min:", creatorRecent);
if (creatorRecent >= 3) {
  console.log("⚠️ RAPID-FIRE CREATOR");
}
console.log("Transaction:", value.signature);
console.log("Time:", new Date().toLocaleTimeString());
console.log("--------------------------------");
});

function wait(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

function limitedTransactionFetch(options) {
  const request =
    transactionRequestChain.then(async () => {
      const response =
        await fetch(
          TRANSACTION_RPC_URL,
          options
        );

      await wait(1000);

      return response;
    });

  transactionRequestChain =
    request.catch(() => {});

  return request;
}

function limitedBirdeyeFetch(url, options) {
  const request =
    birdeyeRequestChain.then(async () => {
      const response =
        await fetch(url, options);

      await wait(1100);

      return response;
    });

  birdeyeRequestChain =
    request.catch(() => {});

  return request;
}

async function getTransaction(signature) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response =
        await limitedTransactionFetch({
          method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

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

      if (!response.ok) {
        console.log(
          `Transaction RPC attempt ${attempt} failed: HTTP ${response.status}`
        );
      } else {
        try {
          const data = JSON.parse(text);

          if (data.result) {
            return data.result;
          }
        } catch {
          console.log(
            `Helius attempt ${attempt} returned invalid JSON`
          );
        }
      }

    } catch (error) {
      console.log(
        `Transaction RPC attempt ${attempt} error:`,
        error.message
      );
    }

    if (attempt < 3) {
      await new Promise((resolve) =>
        setTimeout(resolve, 500 * attempt)
      );
    }
  }

  return null;
}

async function getTokenInfo(mint) {
  const response = await fetch(HELIUS_RPC_URL, {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAsset",

      params: {
        id: mint,
        options: {
          showFungible: true
        }
      }
    })
  });

  const data = await response.json();

  return data.result;
}

function saveToken(record) {
  fs.appendFileSync(
    "data/launches.jsonl",
    JSON.stringify(record) + "\n"
  );
}

function saveMarketCheck(check) {
  fs.appendFileSync(
    "data/market-checks.jsonl",
    JSON.stringify(check) + "\n"
  );
}

function getCreatorStats(creator) {
  if (!fs.existsSync("data/launches.jsonl")) {
    return {
      total: 0,
      recent: 0
    };
  }

  const file = fs.readFileSync(
    "data/launches.jsonl",
    "utf8"
  );

  const lines = file
    .split("\n")
    .filter(Boolean);

  let total = 0;
  let recent = 0;

  const now = Date.now();

  for (const line of lines) {
    const record = JSON.parse(line);

    if (record.creator === creator) {
      total++;

      const launchTime =
        new Date(record.detectedAt).getTime();

      const tenMinutes =
        10 * 60 * 1000;

      if (now - launchTime <= tenMinutes) {
        recent++;
      }
    }
  }

  return {
    total: total,
    recent: recent
  };
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
  let riskReason =
    "Holder structure looks acceptable.";

  if (holderCount === 0) {
  riskStatus = "INDEXING";
  riskReason =
    "Holder data is not indexed yet.";
}

else if (holderCount < 10) {
  riskStatus = "WAIT";
  riskReason =
    "Not enough holders yet.";
}

  else if (
    bundlerPercent >= 10 ||
    insiderPercent >= 5
  ) {
    riskStatus = "REJECT";
    riskReason =
      "High bundler or insider concentration.";
  }

  else if (
    devPercent >= 10 ||
    top10Percent >= 70
  ) {
    riskStatus = "REJECT";
    riskReason =
      "Ownership concentration is too high.";
  }

  else if (
    bundlerPercent >= 5 ||
    insiderPercent >= 2 ||
    devPercent >= 5 ||
    sniperPercent >= 10 ||
    top10Percent >= 50
  ) {
    riskStatus = "WATCH";
    riskReason =
      "Some holder-risk signals need monitoring.";
  }

  return {
    status: riskStatus,
    reason: riskReason
  };
}

async function checkHolderRisk(mint) {
  const profileUrl =
    `https://public-api.birdeye.so/token/v1/holder-profile?token_address=${mint}&interval=1h&include_zero_balance=false`;

  const profileResponse =
    await limitedBirdeyeFetch(profileUrl, {
      headers: {
        "X-API-KEY": BIRDEYE_API_KEY,
        "x-chain": "solana"
      }
    });

  const profileData =
    await profileResponse.json();

  if (!profileData.success || !profileData.data) {
    return null;
  }

  const tags =
    profileData.data.tags || [];

  function getTagPercent(tagName) {
    const tag =
      tags.find(
        (item) => item.tag === tagName
      );

    if (!tag) {
      return 0;
    }

    return Number(
      tag.percent_of_supply
    );
  }

  const bundlerPercent =
    getTagPercent("bundler");

  const sniperPercent =
    getTagPercent("sniper");

  const insiderPercent =
    getTagPercent("insider");

  const devPercent =
    getTagPercent("dev");

  const smartTraderPercent =
    getTagPercent("smart_trader");


  const holdersUrl =
    `https://public-api.birdeye.so/defi/v3/token/holder?address=${mint}&offset=0&limit=10&mode=wallet`;

  const holdersResponse =
    await limitedBirdeyeFetch(holdersUrl, {
      headers: {
        "X-API-KEY": BIRDEYE_API_KEY,
        "x-chain": "solana"
      }
    });

  const holdersData =
    await holdersResponse.json();

  if (!holdersData.success || !holdersData.data) {
    return null;
  }

  const holderCount =
    Number(
      holdersData.data.holder ?? 0
    );

  const top10Percent =
    Number(
      holdersData.data.top10_hold_percent ?? 0
    );

  const classification =
    classifyHolderRisk(
      holderCount,
      top10Percent,
      bundlerPercent,
      sniperPercent,
      insiderPercent,
      devPercent
    );

    return {
    holderCount: holderCount,
    top10Percent: top10Percent,
    bundlerPercent: bundlerPercent,
    sniperPercent: sniperPercent,
    insiderPercent: insiderPercent,
    devPercent: devPercent,
    smartTraderPercent: smartTraderPercent,
    status: classification.status,
    reason: classification.reason
  };
}

function printHolderRiskResult(title, risk) {
  console.log("");
  console.log(title);
  console.log("------------------------------");

  if (risk === null) {
    console.log(
      "Holder risk data unavailable."
    );

    console.log("------------------------------");
    return;
  }

  console.log(
    "Holder count:",
    risk.holderCount
  );

  console.log(
    "Top 10 wallets:",
    risk.top10Percent.toFixed(2) + "%"
  );

  console.log(
    "Bundlers:",
    risk.bundlerPercent.toFixed(2) + "%"
  );

  console.log(
    "Snipers:",
    risk.sniperPercent.toFixed(2) + "%"
  );

  console.log(
    "Insiders:",
    risk.insiderPercent.toFixed(2) + "%"
  );

  console.log(
    "Dev:",
    risk.devPercent.toFixed(2) + "%"
  );

  console.log(
    "Status:",
    risk.status
  );

  console.log(
    "Reason:",
    risk.reason
  );

  console.log("------------------------------");
}

async function getBirdeyePrice(mint) {
  const url =
    `https://public-api.birdeye.so/defi/price?address=${mint}`;

  const response = 
    await limitedBirdeyeFetch(url, {
    headers: {
      "X-API-KEY": BIRDEYE_API_KEY,
      "x-chain": "solana"
    }
  });

  const data = await response.json();

  if (
  !data.success ||
  !data.data ||
  typeof data.data.value !== "number"
) {
  return null;
}

return data.data.value;
}

function addToPriceQueue(record) {
  priceQueue.push(record);
}

async function processPriceQueue() {
  if (priceQueue.length === 0) {
    return;
  }

  const record = priceQueue.shift();

  const price =
    await getBirdeyePrice(record.mint);

    if (record.trackingOnly) {
  const checkedAt = new Date();

  const secondsAfterLaunch =
    Math.round(
      (
        checkedAt.getTime() -
        new Date(record.detectedAt).getTime()
      ) / 1000
    );

    let returnPercent = null;

if (
  price !== null &&
  typeof record.initialPrice === "number" &&
  record.initialPrice > 0
) {
  returnPercent =
    ((price - record.initialPrice) /
      record.initialPrice) * 100;
}

  const check = {
    checkedAt: checkedAt.toISOString(),
    mint: record.mint,
    name: record.name,
    symbol: record.symbol,
    checkpoint: record.checkpoint,
    secondsAfterLaunch: secondsAfterLaunch,
    initialPrice: record.initialPrice,
    price: price,
    returnPercent: returnPercent,
    status: price === null
      ? "not_ready"
      : "priced"
  };

  saveMarketCheck(check);

  console.log("");
  console.log("📈 PERFORMANCE CHECK");
  console.log("Name:", record.name);
  console.log("Checkpoint:", record.checkpoint);
  console.log("Seconds after launch:", secondsAfterLaunch);
  console.log("Initial price:", record.initialPrice);
  console.log("Current price:", price);

if (returnPercent !== null) {
  console.log(
    "Return:",
    returnPercent.toFixed(2) + "%"
  );
}
  console.log("------------------------------");

  return;
}

  const checkedAt = new Date();

  const secondsAfterLaunch =
    Math.round(
      (
        checkedAt.getTime() -
        new Date(record.detectedAt).getTime()
      ) / 1000
    );

  const attempt =
    (record.priceAttempts || 0) + 1;

  if (price === null) {
    record.priceAttempts = attempt;

    const check = {
      checkedAt: checkedAt.toISOString(),
      mint: record.mint,
      name: record.name,
      symbol: record.symbol,
      secondsAfterLaunch: secondsAfterLaunch,
      attempt: attempt,
      price: null,
      status: "not_ready"
    };

    saveMarketCheck(check);

    console.log("");
    console.log("⏳ PRICE NOT READY");
    console.log("Name:", record.name);
    console.log("Attempt:", record.priceAttempts);

    if (record.priceAttempts === 1) {
      console.log("Retrying in 20 seconds...");

      setTimeout(() => {
        addToPriceQueue(record);
      }, 20000);
    }

    else if (record.priceAttempts === 2) {
      console.log("Retrying in 30 seconds...");

      setTimeout(() => {
        addToPriceQueue(record);
      }, 30000);
    }

    else {
      console.log("❌ No price after 3 attempts.");
    }

    return;
  }

  const check = {
    checkedAt: checkedAt.toISOString(),
    mint: record.mint,
    name: record.name,
    symbol: record.symbol,
    secondsAfterLaunch: secondsAfterLaunch,
    attempt: attempt,
    price: price,
    status: "priced"
  };

  saveMarketCheck(check);

  record.initialPrice = price;
  record.initialPriceSeconds = secondsAfterLaunch;

  schedulePerformanceTracking(record);

  console.log("");
  console.log("💰 MARKET CHECK");
  console.log("Name:", record.name);
  console.log("Ticker:", record.symbol);
  console.log("Price:", price);
  console.log("Seconds after launch:", secondsAfterLaunch);
  console.log("------------------------------");
}

function schedulePerformanceTracking(record) {
  if (trackedTokens >= MAX_TRACKED_TOKENS) {
    return;
  }

  trackedTokens++;

  const checkpoints = [
    { label: "30s", seconds: 30 },
    { label: "60s", seconds: 60 },
    { label: "5m", seconds: 300 }
  ];

  for (const checkpoint of checkpoints) {
    const launchTime =
      new Date(record.detectedAt).getTime();

    const elapsed =
      Date.now() - launchTime;

    const delay =
      checkpoint.seconds * 1000 - elapsed;

    if (delay <= 0) {
      continue;
    }

    setTimeout(() => {
      addToPriceQueue({
        ...record,
        trackingOnly: true,
        checkpoint: checkpoint.label,
        priceAttempts: 0
      });
    }, delay);
  }
}

setInterval(processPriceQueue, 1100);
