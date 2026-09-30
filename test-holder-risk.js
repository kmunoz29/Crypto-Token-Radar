require("dotenv").config();
const fs = require("fs");

const API_KEY = process.env.BIRDEYE_API_KEY;

async function testHolderRisk() {
  const file = fs.readFileSync(
    "data/launches.jsonl",
    "utf8"
  );

  const lines = file
    .trim()
    .split("\n");

  const latestLine =
    lines[lines.length - 1];

  const latestToken =
    JSON.parse(latestLine);

  const mint =
    latestToken.mint;

  const url =
    `https://public-api.birdeye.so/token/v1/holder-profile?token_address=${mint}&interval=1h&include_zero_balance=false`;

  const response = await fetch(url, {
    headers: {
      "X-API-KEY": API_KEY,
      "x-chain": "solana"
    }
  });

  const data =
    await response.json();

    await new Promise((resolve) =>
  setTimeout(resolve, 1100)
);

const holdersUrl =
  `https://public-api.birdeye.so/defi/v3/token/holder?address=${mint}&offset=0&limit=10&mode=wallet`;

const holdersResponse =
  await fetch(holdersUrl, {
    headers: {
      "X-API-KEY": API_KEY,
      "x-chain": "solana"
    }
  });

const holdersData =
  await holdersResponse.json();

const holderCount =
  Number(holdersData?.data?.holder ?? 0);

const top10Percent =
  Number(
    holdersData?.data?.top10_hold_percent ?? 0
  );

  console.log("Testing holder risk...");
  console.log("Name:", latestToken.name);
  console.log("Ticker:", latestToken.symbol);
  console.log("Mint:", mint);
  console.log("");

  const profile = data.data;
const tags = profile.tags || [];

function getTagPercent(tagName) {
  const tag =
    tags.find((item) => item.tag === tagName);

  if (!tag) {
    return 0;
  }

  return Number(tag.percent_of_supply);
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

let riskStatus = "PASS";
let riskReason = "Holder structure looks acceptable.";

if (holderCount < 10) {
  riskStatus = "WAIT";
  riskReason = "Not enough holders yet.";
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

let riskIcon = "🟢";

if (riskStatus === "WAIT") {
  riskIcon = "⚪";
}

else if (riskStatus === "WATCH") {
  riskIcon = "🟡";
}

else if (riskStatus === "REJECT") {
  riskIcon = "🔴";
}

console.log("");
console.log("🛡️ HOLDER RISK TEST");
console.log("------------------------------");

console.log(
  "Bundlers:",
  bundlerPercent.toFixed(2) + "%"
);

console.log(
  "Snipers:",
  sniperPercent.toFixed(2) + "%"
);

console.log(
  "Insiders:",
  insiderPercent.toFixed(2) + "%"
);

console.log(
  "Dev:",
  devPercent.toFixed(2) + "%"
);

console.log(
  "Smart traders:",
  smartTraderPercent.toFixed(2) + "%"
);

console.log(
  "Holder count:",
  holderCount
);

console.log(
  "Top 10 wallets:",
  top10Percent.toFixed(2) + "%"
);

console.log("");

console.log(
  "Risk status:",
  riskIcon,
  riskStatus
);

console.log(
  "Reason:",
  riskReason
);

console.log("------------------------------");
}

testHolderRisk();