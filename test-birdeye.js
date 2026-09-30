require("dotenv").config();
const fs = require("fs");

const API_KEY = process.env.BIRDEYE_API_KEY;

async function testBirdeye() {
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

const address =
  latestToken.mint;

  const url =
    `https://public-api.birdeye.so/defi/price?address=${address}`;

  const response = await fetch(url, {
    headers: {
      "X-API-KEY": API_KEY,
      "x-chain": "solana"
    }
  });

  const data = await response.json();

console.log("Testing newest Radar token...");
console.log("Name:", latestToken.name);
console.log("Ticker:", latestToken.symbol);
console.log("Mint:", latestToken.mint);
console.log("");

console.log("Birdeye connected!");
console.log("Price:", data?.data?.value);
console.log("Success:", data?.success);
}

testBirdeye();
