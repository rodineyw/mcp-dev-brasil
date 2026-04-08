/**
 * x402 Demo Client — auto-pays for 402-protected resources
 *
 * This client demonstrates how an AI agent would pay for
 * premium API data using x402. When it receives HTTP 402,
 * it automatically signs a USDC payment and retries.
 *
 * Run: npx tsx client.ts
 */

import { config } from "dotenv";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

config();

const privateKey = process.env.CLIENT_PRIVATE_KEY as `0x${string}`;
const SERVER_URL = "http://localhost:4021";

async function main() {
  const signer = privateKeyToAccount(privateKey);
  console.log(`\n  x402 Client — Payer: ${signer.address}`);
  console.log(`  Network: Base Sepolia\n`);

  // Create x402-aware fetch
  const client = new x402Client();
  client.register("eip155:*", new ExactEvmScheme(signer));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  // 1. Free endpoint (no payment needed)
  console.log("  [1] GET /api/health (free)");
  const health = await fetch(`${SERVER_URL}/api/health`);
  console.log("      →", await health.json());

  // 2. Paywalled endpoint — $0.001 USDC
  console.log("\n  [2] GET /api/market-data ($0.001 USDC)");
  console.log("      Agent detects 402 → signs USDC permit → retries...");
  const marketData = await fetchWithPayment(`${SERVER_URL}/api/market-data`);
  const marketBody = await marketData.json();
  console.log("      → Paid! Response:", JSON.stringify(marketBody, null, 2));

  // 3. Paywalled endpoint — $0.01 USDC
  console.log("\n  [3] GET /api/premium-analysis ($0.01 USDC)");
  console.log("      Agent detects 402 → signs USDC permit → retries...");
  const analysis = await fetchWithPayment(`${SERVER_URL}/api/premium-analysis`);
  const analysisBody = await analysis.json();
  console.log("      → Paid! Response:", JSON.stringify(analysisBody, null, 2));

  console.log("\n  Done. Two x402 micropayments completed on Base Sepolia.\n");
}

main().catch(console.error);
