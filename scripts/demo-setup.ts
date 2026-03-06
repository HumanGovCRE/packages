import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../.env") });

const DEPLOYMENTS_FILE = path.join(__dirname, "../deployments/addresses.json");

const REGISTRY_ABI = [
  "function registerVerification(bytes32 nullifier, address wallet) external",
  "function isHuman(address wallet) external view returns (bool)",
  "function getVerification(address wallet) external view returns (tuple(bytes32 nullifier, address wallet, uint256 expiry, bool active))",
  "function setAuthorizedCREWorkflow(address workflow) external",
];

const DAO_ABI = [
  "function createProposal(string calldata title, string calldata description, uint256 votingDuration) external",
  "function isHuman(address wallet) external view returns (bool)",
  "function proposalCount() external view returns (uint256)",
  "function getProposal(uint256 id) external view returns (tuple(uint256 id, string title, string description, address proposer, uint256 startTime, uint256 endTime, uint256 yesVotes, uint256 noVotes, bool executed, uint8 status))",
];

async function main() {
  console.log("\n========================================");
  console.log(" HumanGov Demo Setup");
  console.log("========================================\n");

  // ── Load addresses ────────────────────────────────────────────────────────

  if (!fs.existsSync(DEPLOYMENTS_FILE)) {
    console.error(
      "❌  deployments/addresses.json not found.\n   Run deploy scripts first:\n   npm run deploy:sepolia\n   npm run deploy:base"
    );
    process.exit(1);
  }

  const addresses = JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, "utf8"));
  const { REGISTRY_ADDRESS, DAO_ADDRESS } = addresses;

  if (!REGISTRY_ADDRESS) {
    console.error("❌  REGISTRY_ADDRESS not found in deployments/addresses.json");
    process.exit(1);
  }

  if (!DAO_ADDRESS) {
    console.error("❌  DAO_ADDRESS not found in deployments/addresses.json");
    process.exit(1);
  }

  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
  const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL;

  if (!PRIVATE_KEY || !SEPOLIA_RPC_URL || !BASE_SEPOLIA_RPC_URL) {
    console.error(
      "❌  PRIVATE_KEY, SEPOLIA_RPC_URL, and BASE_SEPOLIA_RPC_URL must be set in .env"
    );
    process.exit(1);
  }

  const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  const baseProvider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC_URL);

  const sepoliaWallet = new ethers.Wallet(PRIVATE_KEY, sepoliaProvider);
  const baseWallet = new ethers.Wallet(PRIVATE_KEY, baseProvider);

  console.log(`Deployer: ${sepoliaWallet.address}`);
  console.log(`Registry: ${REGISTRY_ADDRESS} (Sepolia)`);
  console.log(`DAO:      ${DAO_ADDRESS} (Base Sepolia)\n`);

  const registry = new ethers.Contract(
    REGISTRY_ADDRESS,
    REGISTRY_ABI,
    sepoliaWallet
  );

  const dao = new ethers.Contract(DAO_ADDRESS, DAO_ABI, baseWallet);

  // ── Register 2 mock human verifications ──────────────────────────────────

  console.log("Registering mock human verifications...");

  // Authorize deployer as CRE workflow
  console.log("  Setting authorized CRE workflow to deployer...");
  const setWorkflowTx = await registry.setAuthorizedCREWorkflow(
    sepoliaWallet.address
  );
  await setWorkflowTx.wait();
  console.log("  ✓ Authorized CRE workflow set");

  const mockWallets = [
    "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222",
  ];

  for (let i = 0; i < mockWallets.length; i++) {
    const wallet = mockWallets[i];
    const nullifier = ethers.keccak256(
      ethers.toUtf8Bytes(`demo-nullifier-${i + 1}`)
    );

    try {
      const alreadyVerified = await registry.isHuman(wallet);
      if (alreadyVerified) {
        console.log(`  ⚠  Mock human ${i + 1} (${wallet}) already verified`);
        continue;
      }
      const tx = await registry.registerVerification(nullifier, wallet);
      await tx.wait();
      console.log(`  ✓ Registered mock human ${i + 1}: ${wallet}`);
      console.log(`    Nullifier: ${nullifier}`);
    } catch (err: unknown) {
      console.log(`  ✗ Failed to register mock human ${i + 1}: ${String(err)}`);
    }
  }

  // ── Create 2 sample proposals on HumanGovDAO ─────────────────────────────

  console.log("\nCreating sample proposals on HumanGovDAO...");
  console.log("  Note: proposals require human verification on Base Sepolia.");
  console.log(
    "  If this fails, ensure CCIP propagation has run first.\n"
  );

  const proposals = [
    {
      title: "Allocate Community Treasury to Protocol Development",
      description:
        "Proposal to allocate 30% of the community treasury to fund protocol development, security audits, and developer grants for Q3 2025.",
      duration: 7 * 24 * 3600, // 7 days
    },
    {
      title: "Add Cross-Chain Governance Support for Arbitrum",
      description:
        "Expand HumanGov's one-human-one-vote system to Arbitrum Sepolia by deploying a new HumanGovDAO instance and configuring CCIP routing from HumanRegistry.",
      duration: 7 * 24 * 3600, // 7 days
    },
  ];

  for (const proposal of proposals) {
    try {
      const isHumanCheck = await dao.isHuman(baseWallet.address);
      if (!isHumanCheck) {
        console.log(
          `  ⚠  Deployer (${baseWallet.address}) is not a verified human on Base Sepolia.`
        );
        console.log(
          "  Run CCIP propagation first or use a verified human wallet."
        );
        break;
      }
      const tx = await dao.createProposal(
        proposal.title,
        proposal.description,
        proposal.duration
      );
      await tx.wait();
      const count = await dao.proposalCount();
      console.log(`  ✓ Created proposal ${Number(count) - 1}: "${proposal.title}"`);
    } catch (err: unknown) {
      console.log(`  ✗ Failed to create proposal "${proposal.title}": ${String(err)}`);
    }
  }

  // ── Print demo walkthrough ────────────────────────────────────────────────

  console.log("\n========================================");
  console.log(" Demo Walkthrough");
  console.log("========================================\n");

  console.log("1. VERIFY YOUR IDENTITY");
  console.log("   → Open the frontend at http://localhost:3000");
  console.log("   → Connect your wallet (MetaMask on Sepolia)");
  console.log("   → Click 'Get Verified' and scan the World ID QR code");
  console.log("   → The CRE workflow submits your proof to HumanRegistry");
  console.log("   → Chainlink CCIP propagates your status to Base Sepolia\n");

  console.log("2. VIEW THE DAO");
  console.log("   → Navigate to http://localhost:3000/dao");
  console.log("   → Browse active proposals");
  console.log("   → Switch network to Base Sepolia in MetaMask\n");

  console.log("3. VOTE ON A PROPOSAL");
  console.log("   → Click on a proposal to view details");
  console.log("   → Click YES or NO to cast your vote");
  console.log("   → One human = one vote (enforced by nullifier)\n");

  console.log("4. CREATE A PROPOSAL");
  console.log('   → Click "Create Proposal" (requires verification)');
  console.log("   → Fill in title and description\n");

  console.log("5. FINALIZE A PROPOSAL");
  console.log("   → After voting period ends, click 'Finalize'");
  console.log("   → PASSED if yes > no, otherwise FAILED\n");

  console.log("Deployed Contracts:");
  console.log(`  HumanRegistry (Sepolia):    ${REGISTRY_ADDRESS}`);
  console.log(`  HumanGovDAO (Base Sepolia): ${DAO_ADDRESS}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
