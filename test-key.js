require("dotenv").config();

console.log(process.env.HELIUS_API_KEY ? "API key found!" : "API key missing!");
