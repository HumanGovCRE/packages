import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Base Sepolia CCIP chain selector
const BASE_SEPOLIA_CHAIN_SELECTOR = "10344971235874465080";

// Sepolia CCIP router and LINK token (official Chainlink addresses)
const SEPOLIA_CCIP_ROUTER = "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59";
const SEPOLIA_LINK_TOKEN = "0x779877A7B0D9E8603169DdbD7836e478b4624789";

// Base Sepolia CCIP router
const BASE_SEPOLIA_CCIP_ROUTER = "0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93";

const DEPLOYMENTS_FILE = path.join(__dirname, "../deployments/addresses.json");
const FRONTEND_ENV = path.join(__dirname, "../frontend/.env.local");
const CRE_ENV = path.join(__dirname, "../cre-workflow/.env");

function loadExistingAddresses(): Record<string, string> {
  if (fs.existsSync(DEPLOYMENTS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, "utf8"));
    } catch {
      return {};
    }
  }
  return {};
}

function writeEnvFile(filePath: string, vars: Record<string, string>) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let existing: Record<string, string> = {};
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        existing[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
      }
    }
  }

  const merged = { ...existing, ...vars };
  const content = Object.entries(merged)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  fs.writeFileSync(filePath, content + "\n");
  console.log(`  Wrote ${filePath}`);
}

async function main() {
  const networkName = network.name;
  console.log(`\nDeploying to ${networkName}...`);

  const [deployer] = await ethers.getSigners();
  console.log(`  Deployer: ${deployer.address}`);
  const creForwarderAddress = process.env.CRE_FORWARDER_ADDRESS ?? ethers.ZeroAddress;

  const addresses = loadExistingAddresses();

  if (networkName === "sepolia" || networkName === "hardhat") {
    console.log("\nDeploying HumanRegistry + HumanGovCREReceiver on Sepolia...");

    const HumanRegistry = await ethers.getContractFactory("HumanRegistry");
    const registry = await HumanRegistry.deploy(
      SEPOLIA_CCIP_ROUTER,
      SEPOLIA_LINK_TOKEN
    );
    await registry.waitForDeployment();

    const registryAddress = await registry.getAddress();
    console.log(`  HumanRegistry deployed at: ${registryAddress}`);

    const HumanGovCREReceiver = await ethers.getContractFactory("HumanGovCREReceiver");
    const receiver = await HumanGovCREReceiver.deploy(
      registryAddress,
      creForwarderAddress,
      ethers.ZeroAddress,
      ethers.ZeroHash.slice(0, 22) // bytes10(0)
    );
    await receiver.waitForDeployment();

    const receiverAddress = await receiver.getAddress();
    console.log(`  HumanGovCREReceiver deployed at: ${receiverAddress}`);

    // Authorize the CRE receiver as the only caller that can register/revoke.
    await registry.setAuthorizedCREWorkflow(receiverAddress);
    console.log(`  Authorized CRE workflow set to: ${receiverAddress}`);

    addresses["REGISTRY_ADDRESS"] = registryAddress;
    addresses["CRE_RECEIVER_ADDRESS"] = receiverAddress;
    addresses["CRE_FORWARDER_ADDRESS"] = creForwarderAddress;
    addresses["REGISTRY_NETWORK"] = networkName;
    addresses["REGISTRY_DEPLOYER"] = deployer.address;

    // Write env files
    writeEnvFile(FRONTEND_ENV, {
      NEXT_PUBLIC_CONTRACT_ADDRESS: registryAddress,
      NEXT_PUBLIC_CHAIN_ID: "11155111",
    });
    writeEnvFile(CRE_ENV, {
      REGISTRY_ADDRESS: registryAddress,
      RECEIVER_ADDRESS: receiverAddress,
      SOURCE_CHAIN_NAME: "ethereum-testnet-sepolia",
      DESTINATION_CHAIN_SELECTOR: BASE_SEPOLIA_CHAIN_SELECTOR,
      CRE_FORWARDER_ADDRESS: creForwarderAddress,
    });
  } else if (networkName === "baseSepolia") {
    console.log("\nDeploying HumanGovDAO on Base Sepolia...");

    const HumanGovDAO = await ethers.getContractFactory("HumanGovDAO");
    const dao = await HumanGovDAO.deploy(BASE_SEPOLIA_CCIP_ROUTER);
    await dao.waitForDeployment();

    const daoAddress = await dao.getAddress();
    console.log(`  HumanGovDAO deployed at: ${daoAddress}`);

    addresses["DAO_ADDRESS"] = daoAddress;
    addresses["DAO_NETWORK"] = networkName;
    addresses["DAO_DEPLOYER"] = deployer.address;

    // If registry address is known, configure it to propagate to DAO
    if (addresses["REGISTRY_ADDRESS"]) {
      console.log(
        `\n  Note: Configure HumanRegistry.setTargetChainReceiver(${BASE_SEPOLIA_CHAIN_SELECTOR}, ${daoAddress})`
      );
    }

    writeEnvFile(FRONTEND_ENV, {
      NEXT_PUBLIC_DAO_ADDRESS: daoAddress,
      NEXT_PUBLIC_TARGET_CHAIN_ID: "84532",
    });
    writeEnvFile(CRE_ENV, {
      DAO_ADDRESS: daoAddress,
      BASE_SEPOLIA_CHAIN_SELECTOR,
    });
  } else {
    console.error(`Unknown network: ${networkName}`);
    console.error("Use --network sepolia or --network baseSepolia");
    process.exitCode = 1;
    return;
  }

  // Save addresses
  const deploymentsDir = path.dirname(DEPLOYMENTS_FILE);
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  fs.writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(addresses, null, 2));
  console.log(`\n  Addresses saved to ${DEPLOYMENTS_FILE}`);
  console.log("\nDeployment complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
