import * as dotenv from "dotenv";
import * as path from "path";
import { ethers } from "ethers";

dotenv.config({ path: path.join(__dirname, "../.env") });

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  critical: boolean;
}

const results: CheckResult[] = [];

function check(
  name: string,
  passed: boolean,
  message: string,
  critical = true
) {
  results.push({ name, passed, message, critical });
}

async function checkRpc(name: string, url: string): Promise<boolean> {
  try {
    const provider = new ethers.JsonRpcProvider(url);
    const blockNumber = await provider.send("eth_blockNumber", []);
    check(
      name,
      true,
      `Connected — latest block: ${parseInt(blockNumber, 16)}`,
      true
    );
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    check(name, false, `RPC call failed: ${message}`, true);
    return false;
  }
}

async function main() {
  console.log("\n========================================");
  console.log(" HumanGov Environment Check");
  console.log("========================================\n");

  // ── Required env vars ────────────────────────────────────────────────────

  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
  const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL;
  const WORLD_ID_APP_ID = process.env.WORLD_ID_APP_ID;
  const WORLDCOIN_API_KEY = process.env.WORLDCOIN_API_KEY;
  const CHAINLINK_CRE_DON_ID = process.env.CHAINLINK_CRE_DON_ID;
  const CRE_ETH_PRIVATE_KEY = process.env.CRE_ETH_PRIVATE_KEY;
  const CRE_FORWARDER_ADDRESS = process.env.CRE_FORWARDER_ADDRESS;

  // ── PRIVATE_KEY ──────────────────────────────────────────────────────────

  if (!PRIVATE_KEY) {
    check("PRIVATE_KEY", false, "Not set", true);
  } else {
    const hex = PRIVATE_KEY.replace(/^0x/, "");
    const valid = /^[0-9a-fA-F]{64}$/.test(hex);
    check(
      "PRIVATE_KEY",
      valid,
      valid ? "Set and valid (64 hex chars)" : `Invalid — expected 64 hex chars, got ${hex.length}`,
      true
    );
  }

  // ── RPC URLs ─────────────────────────────────────────────────────────────

  if (!SEPOLIA_RPC_URL) {
    check("SEPOLIA_RPC_URL", false, "Not set", true);
  } else {
    check("SEPOLIA_RPC_URL", true, `Set: ${SEPOLIA_RPC_URL}`, true);
    await checkRpc("SEPOLIA_RPC_URL connectivity", SEPOLIA_RPC_URL);
  }

  if (!BASE_SEPOLIA_RPC_URL) {
    check("BASE_SEPOLIA_RPC_URL", false, "Not set", true);
  } else {
    check("BASE_SEPOLIA_RPC_URL", true, `Set: ${BASE_SEPOLIA_RPC_URL}`, true);
    await checkRpc("BASE_SEPOLIA_RPC_URL connectivity", BASE_SEPOLIA_RPC_URL);
  }

  // ── World ID ─────────────────────────────────────────────────────────────

  if (!WORLD_ID_APP_ID) {
    check("WORLD_ID_APP_ID", false, "Not set", true);
  } else if (!WORLD_ID_APP_ID.startsWith("app_")) {
    check(
      "WORLD_ID_APP_ID",
      false,
      `Must start with "app_", got: ${WORLD_ID_APP_ID}`,
      true
    );
  } else {
    check("WORLD_ID_APP_ID", true, `Set: ${WORLD_ID_APP_ID}`, true);
  }

  if (!WORLDCOIN_API_KEY) {
    check("WORLDCOIN_API_KEY", false, "Not set", true);
  } else {
    check("WORLDCOIN_API_KEY", true, "Set (value hidden)", true);
  }

  // ── Chainlink CRE ────────────────────────────────────────────────────────

  if (!CHAINLINK_CRE_DON_ID) {
    check("CHAINLINK_CRE_DON_ID", false, "Not set", true);
  } else {
    check("CHAINLINK_CRE_DON_ID", true, `Set: ${CHAINLINK_CRE_DON_ID}`, true);
  }

  if (!CRE_ETH_PRIVATE_KEY) {
    check("CRE_ETH_PRIVATE_KEY", false, "Not set", true);
  } else {
    const hex = CRE_ETH_PRIVATE_KEY.replace(/^0x/, "");
    const valid = /^[0-9a-fA-F]{64}$/.test(hex);
    check(
      "CRE_ETH_PRIVATE_KEY",
      valid,
      valid ? "Set and valid (64 hex chars)" : `Invalid — expected 64 hex chars, got ${hex.length}`,
      true
    );
  }

  if (!CRE_FORWARDER_ADDRESS) {
    check(
      "CRE_FORWARDER_ADDRESS",
      true,
      "Not set (optional). Receiver accepts configured deployer/owner calls until set.",
      false
    );
  } else {
    const valid = /^0x[0-9a-fA-F]{40}$/.test(CRE_FORWARDER_ADDRESS);
    check(
      "CRE_FORWARDER_ADDRESS",
      valid,
      valid ? `Set: ${CRE_FORWARDER_ADDRESS}` : "Invalid — expected 0x-prefixed 40-byte address",
      false
    );
  }

  // ── Print results ─────────────────────────────────────────────────────────

  console.log("Results:\n");
  let anyFailed = false;
  for (const r of results) {
    const icon = r.passed ? "✓" : "✗";
    const label = r.passed ? "PASS" : r.critical ? "FAIL" : "WARN";
    console.log(`  ${icon} [${label}] ${r.name}`);
    console.log(`         ${r.message}\n`);
    if (!r.passed && r.critical) {
      anyFailed = true;
    }
  }

  if (anyFailed) {
    console.log("❌  One or more critical checks failed. Fix the issues above and re-run.\n");
    process.exit(1);
  } else {
    console.log("✅  All critical checks passed!\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
