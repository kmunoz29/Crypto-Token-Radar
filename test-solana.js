require("dotenv").config();

const API_KEY = process.env.HELIUS_API_KEY;
const RPC_URL =
  `https://beta.helius-rpc.com/?api-key=${API_KEY}`;
async function testConnection() {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getSlot"
    })
  });
  const data = await response.json();
  console.log("Connected to Solana!");
  console.log("Current slot:", data.result);
}
testConnection();

