import { ethers, network } from "hardhat";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function pass(name: string) {
  results.push({ name, passed: true });
  console.log(`  ✓ ${name}`);
}

function fail(name: string, error: string) {
  results.push({ name, passed: false, error });
  console.log(`  ✗ ${name}: ${error}`);
}

async function expectRevert(
  promise: Promise<unknown>,
  errorFragment?: string
): Promise<boolean> {
  try {
    await promise;
    return false;
  } catch (err: unknown) {
    if (errorFragment) {
      const msg = err instanceof Error ? err.message : String(err);
      return msg.includes(errorFragment);
    }
    return true;
  }
}

async function main() {
  console.log("\n========================================");
  console.log(" HumanGov End-to-End Test Suite");
  console.log(`  Network: ${network.name}`);
  console.log("========================================\n");

  const signers = await ethers.getSigners();
  const [owner, human1, human2, human3] = signers;

  // ── Step 1: Deploy MockCCIPRouter ────────────────────────────────────────

  console.log("Deploying contracts...");

  const MockRouter = await ethers.getContractFactory("MockCCIPRouter");
  const mockRouter = await MockRouter.deploy();
  await mockRouter.waitForDeployment();
  const mockRouterAddress = await mockRouter.getAddress();

  const MockLink = await ethers.getContractFactory("MockLinkToken");
  const mockLink = await MockLink.deploy(ethers.parseEther("1000000"));
  await mockLink.waitForDeployment();
  const mockLinkAddress = await mockLink.getAddress();

  // ── Step 2: Deploy HumanRegistry ────────────────────────────────────────

  const HumanRegistry = await ethers.getContractFactory("HumanRegistry");
  const registry = await HumanRegistry.deploy(mockRouterAddress, mockLinkAddress);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();

  // ── Step 3: Deploy HumanGovDAO ───────────────────────────────────────────

  const HumanGovDAO = await ethers.getContractFactory("HumanGovDAO");
  const dao = await HumanGovDAO.deploy(mockRouterAddress);
  await dao.waitForDeployment();
  const daoAddress = await dao.getAddress();

  console.log(`  HumanRegistry: ${registryAddress}`);
  console.log(`  HumanGovDAO:   ${daoAddress}`);
  console.log(`  MockRouter:    ${mockRouterAddress}\n`);

  // Authorize the owner as the CRE workflow
  await registry.setAuthorizedCREWorkflow(owner.address);

  // ── Step 4: Simulate CRE workflow registerVerification ───────────────────

  console.log("Running tests...\n");

  const mockNullifier = ethers.keccak256(ethers.toUtf8Bytes("nullifier-human1"));

  try {
    await registry.registerVerification(mockNullifier, human1.address);
    pass("CRE workflow: registerVerification(mockNullifier, human1)");
  } catch (err: unknown) {
    fail("CRE workflow: registerVerification(mockNullifier, human1)", String(err));
  }

  // Verify isHuman on registry
  try {
    const isHuman = await registry.isHuman(human1.address);
    if (isHuman) {
      pass("Registry: isHuman(human1) returns true");
    } else {
      fail("Registry: isHuman(human1) returns true", "returned false");
    }
  } catch (err: unknown) {
    fail("Registry: isHuman(human1) returns true", String(err));
  }

  // ── Step 5: Simulate CCIP: call dao.ccipReceive ───────────────────────────

  const verificationRecord = await registry.getVerification(human1.address);
  const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "address", "uint256"],
    [verificationRecord.nullifier, verificationRecord.wallet, verificationRecord.expiry]
  );

  // Build a Client.Any2EVMMessage struct
  const ccipMessage = {
    messageId: ethers.keccak256(ethers.toUtf8Bytes("msg-id-1")),
    sourceChainSelector: BigInt("16015286601757825753"), // Sepolia selector
    sender: ethers.AbiCoder.defaultAbiCoder().encode(["address"], [registryAddress]),
    data: encodedData,
    destTokenAmounts: [],
  };

  try {
    // Call ccipReceive via the mock router to bypass the router check,
    // we impersonate the router to call dao.ccipReceive directly
    const daoAsRouter = dao.connect(
      await ethers.getImpersonatedSigner(mockRouterAddress)
    );
    await ethers.provider.send("hardhat_setBalance", [
      mockRouterAddress,
      "0x1000000000000000000",
    ]);
    await daoAsRouter.ccipReceive(ccipMessage);
    pass("CCIP: dao.ccipReceive(encoded human1 verification)");
  } catch (err: unknown) {
    fail("CCIP: dao.ccipReceive(encoded human1 verification)", String(err));
  }

  // Verify isHuman on DAO
  try {
    const isHuman = await dao.isHuman(human1.address);
    if (isHuman) {
      pass("DAO: isHuman(human1) returns true after CCIP");
    } else {
      fail("DAO: isHuman(human1) returns true after CCIP", "returned false");
    }
  } catch (err: unknown) {
    fail("DAO: isHuman(human1) returns true after CCIP", String(err));
  }

  // ── Step 6: human1 creates a proposal ────────────────────────────────────

  const VOTING_DURATION = 3600; // 1 hour

  try {
    await dao
      .connect(human1)
      .createProposal(
        "Test Proposal",
        "This is a test governance proposal",
        VOTING_DURATION
      );
    pass("Governance: human1 creates proposal");
  } catch (err: unknown) {
    fail("Governance: human1 creates proposal", String(err));
  }

  // ── Step 7: human2 (not verified) tries to create a proposal ─────────────

  const reverted = await expectRevert(
    dao
      .connect(human2)
      .createProposal("Unauthorized Proposal", "Should revert", VOTING_DURATION),
    "NotHuman"
  );

  if (reverted) {
    pass("Governance: human2 (unverified) createProposal reverts with NotHuman");
  } else {
    fail(
      "Governance: human2 (unverified) createProposal reverts with NotHuman",
      "did not revert"
    );
  }

  // ── Step 8: human1 votes YES ──────────────────────────────────────────────

  try {
    await dao.connect(human1).vote(0, true);
    pass("Voting: human1 votes YES on proposal 0");
  } catch (err: unknown) {
    fail("Voting: human1 votes YES on proposal 0", String(err));
  }

  // ── Step 9: human1 tries to vote again ───────────────────────────────────

  const doubleVoteReverted = await expectRevert(
    dao.connect(human1).vote(0, false),
    "AlreadyVoted"
  );

  if (doubleVoteReverted) {
    pass("Voting: human1 second vote reverts with AlreadyVoted");
  } else {
    fail("Voting: human1 second vote reverts with AlreadyVoted", "did not revert");
  }

  // ── Step 10: Fast-forward time past voting period ─────────────────────────

  try {
    await ethers.provider.send("evm_increaseTime", [VOTING_DURATION + 1]);
    await ethers.provider.send("evm_mine", []);
    pass("Time: fast-forwarded past voting period");
  } catch (err: unknown) {
    fail("Time: fast-forwarded past voting period", String(err));
  }

  // ── Step 11: Finalize proposal ────────────────────────────────────────────

  try {
    await dao.finalizeProposal(0);
    const proposal = await dao.getProposal(0);
    // ProposalStatus.PASSED == 1
    if (proposal.status === 1n) {
      pass("Finalize: proposal 0 status is PASSED");
    } else {
      fail("Finalize: proposal 0 status is PASSED", `status = ${proposal.status}`);
    }
  } catch (err: unknown) {
    fail("Finalize: proposal 0 status is PASSED", String(err));
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log("\n========================================");
  console.log(` Results: ${passed}/${total} passed`);
  if (failed > 0) {
    console.log(` Failed:  ${failed}`);
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`   ✗ ${r.name}: ${r.error}`);
    }
  }
  console.log("========================================\n");

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
