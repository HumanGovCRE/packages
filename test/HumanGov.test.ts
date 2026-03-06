import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const BASE_SEPOLIA_CHAIN_SELECTOR = 10344971235874465080n;
const WORKFLOW_NAME_BYTES10 = "0x68756d616e676f763031"; // "humangov01"

function makeNullifier(index: number): string {
  return ethers.keccak256(ethers.toUtf8Bytes(`nullifier-${index}`));
}

function buildWorkflowReport(
  action: number,
  nullifier: string,
  wallet: string,
  destinationChainSelector: bigint,
  propagate: boolean
): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint8", "bytes32", "address", "uint64", "bool"],
    [action, nullifier, wallet, destinationChainSelector, propagate]
  );
}

function buildWorkflowMetadata(workflowOwner: string): string {
  const workflowId = ethers.keccak256(ethers.toUtf8Bytes("humangov-workflow-id"));
  return ethers.solidityPacked(
    ["bytes32", "bytes10", "address"],
    [workflowId, WORKFLOW_NAME_BYTES10, workflowOwner]
  );
}

function buildCCIPMessage(
  nullifier: string,
  wallet: string,
  expiry: bigint
): {
  messageId: string;
  sourceChainSelector: bigint;
  sender: string;
  data: string;
  destTokenAmounts: { token: string; amount: bigint }[];
} {
  const data = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "address", "uint256"],
    [nullifier, wallet, expiry]
  );

  return {
    messageId: ethers.keccak256(ethers.toUtf8Bytes("test-message-id")),
    sourceChainSelector: BigInt(11155111),
    sender: ethers.AbiCoder.defaultAbiCoder().encode(["address"], [wallet]),
    data,
    destTokenAmounts: [],
  };
}

async function deployRegistryFixture() {
  const [owner, workflow, alice, bob, carol] = await ethers.getSigners();

  const MockCCIPRouter = await ethers.getContractFactory("MockCCIPRouter");
  const mockRouter = await MockCCIPRouter.deploy();

  const MockLinkToken = await ethers.getContractFactory("MockLinkToken");
  const mockLink = await MockLinkToken.deploy(ethers.parseEther("1000"));

  const HumanRegistry = await ethers.getContractFactory("HumanRegistry");
  const registry = await HumanRegistry.deploy(
    await mockRouter.getAddress(),
    await mockLink.getAddress()
  );

  await registry.setAuthorizedCREWorkflow(workflow.address);
  await registry.setTargetChainReceiver(BASE_SEPOLIA_CHAIN_SELECTOR, carol.address);

  return { registry, mockRouter, mockLink, owner, workflow, alice, bob, carol };
}

async function deployReceiverFixture() {
  const [owner, forwarder, alice, bob] = await ethers.getSigners();

  const MockCCIPRouter = await ethers.getContractFactory("MockCCIPRouter");
  const mockRouter = await MockCCIPRouter.deploy();

  const MockLinkToken = await ethers.getContractFactory("MockLinkToken");
  const mockLink = await MockLinkToken.deploy(ethers.parseEther("1000"));

  const HumanRegistry = await ethers.getContractFactory("HumanRegistry");
  const registry = await HumanRegistry.deploy(
    await mockRouter.getAddress(),
    await mockLink.getAddress()
  );

  const HumanGovCREReceiver = await ethers.getContractFactory("HumanGovCREReceiver");
  const receiver = await HumanGovCREReceiver.deploy(
    await registry.getAddress(),
    forwarder.address,
    ethers.ZeroAddress,
    ethers.ZeroHash.slice(0, 22)
  );

  await registry.setAuthorizedCREWorkflow(await receiver.getAddress());
  await registry.setTargetChainReceiver(BASE_SEPOLIA_CHAIN_SELECTOR, bob.address);

  return { registry, receiver, mockRouter, mockLink, owner, forwarder, alice, bob };
}

async function deployDAOFixture() {
  const [owner, alice, bob, carol, dave] = await ethers.getSigners();

  const MockCCIPRouter = await ethers.getContractFactory("MockCCIPRouter");
  const mockRouter = await MockCCIPRouter.deploy();
  const routerAddress = await mockRouter.getAddress();

  const HumanGovDAO = await ethers.getContractFactory("HumanGovDAO");
  const dao = await HumanGovDAO.deploy(routerAddress);

  return { dao, mockRouter, routerAddress, owner, alice, bob, carol, dave };
}

describe("HumanRegistry", function () {
  it("registers a verified human", async function () {
    const { registry, workflow, alice } = await loadFixture(deployRegistryFixture);
    const nullifier = makeNullifier(1);

    await expect(registry.connect(workflow).registerVerification(nullifier, alice.address))
      .to.emit(registry, "HumanVerified")
      .withArgs(nullifier, alice.address, (_expiry: bigint) => _expiry > 0n);

    expect(await registry.verifiedNullifiers(nullifier)).to.equal(true);
    expect(await registry.nullifierToAddress(nullifier)).to.equal(alice.address);
    expect(await registry.addressToNullifier(alice.address)).to.equal(nullifier);
  });

  it("rejects duplicate nullifier", async function () {
    const { registry, workflow, alice, bob } = await loadFixture(deployRegistryFixture);
    const nullifier = makeNullifier(2);

    await registry.connect(workflow).registerVerification(nullifier, alice.address);

    await expect(
      registry.connect(workflow).registerVerification(nullifier, bob.address)
    ).to.be.revertedWithCustomError(registry, "DoubleClaim");
  });

  it("rejects duplicate wallet registration", async function () {
    const { registry, workflow, alice } = await loadFixture(deployRegistryFixture);

    await registry.connect(workflow).registerVerification(makeNullifier(3), alice.address);

    await expect(
      registry.connect(workflow).registerVerification(makeNullifier(4), alice.address)
    ).to.be.revertedWithCustomError(registry, "AlreadyVerified");
  });

  it("enforces authorization on registration", async function () {
    const { registry, alice, bob } = await loadFixture(deployRegistryFixture);

    await expect(
      registry.connect(alice).registerVerification(makeNullifier(5), bob.address)
    ).to.be.revertedWithCustomError(registry, "NotAuthorized");
  });

  it("propagates via native fee when authorized", async function () {
    const { registry, workflow, alice } = await loadFixture(deployRegistryFixture);

    const nullifier = makeNullifier(6);
    await registry.connect(workflow).registerVerification(nullifier, alice.address);

    const fee = await registry.quotePropagationFeeNative(
      nullifier,
      BASE_SEPOLIA_CHAIN_SELECTOR
    );

    await expect(
      registry
        .connect(workflow)
        .propagateToChain(nullifier, BASE_SEPOLIA_CHAIN_SELECTOR, { value: fee })
    )
      .to.emit(registry, "CrossChainPropagated")
      .withArgs(
        nullifier,
        BASE_SEPOLIA_CHAIN_SELECTOR,
        (_messageId: string) => _messageId !== ethers.ZeroHash
      );
  });

  it("rejects native propagation with insufficient fee", async function () {
    const { registry, workflow, alice } = await loadFixture(deployRegistryFixture);

    const nullifier = makeNullifier(7);
    await registry.connect(workflow).registerVerification(nullifier, alice.address);

    await expect(
      registry
        .connect(workflow)
        .propagateToChain(nullifier, BASE_SEPOLIA_CHAIN_SELECTOR, {
          value: ethers.parseEther("0.0001"),
        })
    ).to.be.revertedWithCustomError(registry, "InsufficientNativeFee");
  });

  it("propagates via LINK-funded fee for CRE receiver flows", async function () {
    const { registry, mockLink, mockRouter, workflow, alice } = await loadFixture(
      deployRegistryFixture
    );

    const nullifier = makeNullifier(8);
    await registry.connect(workflow).registerVerification(nullifier, alice.address);

    const fee = await registry.quotePropagationFeeInLink(
      nullifier,
      BASE_SEPOLIA_CHAIN_SELECTOR
    );
    await mockLink.mint(await registry.getAddress(), fee);

    await expect(
      registry
        .connect(workflow)
        .propagateToChainWithLink(nullifier, BASE_SEPOLIA_CHAIN_SELECTOR)
    )
      .to.emit(registry, "CrossChainPropagated")
      .withArgs(
        nullifier,
        BASE_SEPOLIA_CHAIN_SELECTOR,
        (_messageId: string) => _messageId !== ethers.ZeroHash
      );

    expect(await mockLink.balanceOf(await mockRouter.getAddress())).to.equal(fee);
  });

  it("fails LINK propagation when contract LINK balance is too low", async function () {
    const { registry, workflow, alice } = await loadFixture(deployRegistryFixture);

    const nullifier = makeNullifier(9);
    await registry.connect(workflow).registerVerification(nullifier, alice.address);

    await expect(
      registry
        .connect(workflow)
        .propagateToChainWithLink(nullifier, BASE_SEPOLIA_CHAIN_SELECTOR)
    ).to.be.revertedWithCustomError(registry, "InsufficientLinkBalance");
  });
});

describe("HumanGovCREReceiver", function () {
  it("processes register action report and optionally propagates", async function () {
    const { registry, receiver, mockLink, mockRouter, forwarder, alice } =
      await loadFixture(deployReceiverFixture);

    const nullifier = makeNullifier(20);
    const report = buildWorkflowReport(
      1,
      nullifier,
      alice.address,
      BASE_SEPOLIA_CHAIN_SELECTOR,
      true
    );

    const fee = await registry.quotePropagationFeeInLink(
      nullifier,
      BASE_SEPOLIA_CHAIN_SELECTOR
    ).catch(() => ethers.parseEther("0.01"));

    // Quote may revert before verification exists, so fund with known mock fee baseline.
    await mockLink.mint(await registry.getAddress(), ethers.parseEther("0.05"));

    await expect(receiver.connect(forwarder).onReport("0x", report))
      .to.emit(receiver, "ReportProcessed")
      .withArgs(1, nullifier, alice.address, BASE_SEPOLIA_CHAIN_SELECTOR, true);

    expect(await registry.verifiedNullifiers(nullifier)).to.equal(true);
    expect(await registry.nullifierToAddress(nullifier)).to.equal(alice.address);
    expect(await mockLink.balanceOf(await mockRouter.getAddress())).to.be.gte(fee);
  });

  it("rejects onReport calls from a non-forwarder address", async function () {
    const { receiver, alice } = await loadFixture(deployReceiverFixture);
    const report = buildWorkflowReport(1, makeNullifier(21), alice.address, 0n, false);

    await expect(receiver.connect(alice).onReport("0x", report)).to.be.revertedWithCustomError(
      receiver,
      "InvalidSender"
    );
  });

  it("processes revoke action report", async function () {
    const { registry, receiver, forwarder, alice } = await loadFixture(deployReceiverFixture);

    const nullifier = makeNullifier(22);
    const registerReport = buildWorkflowReport(1, nullifier, alice.address, 0n, false);
    const revokeReport = buildWorkflowReport(2, nullifier, ethers.ZeroAddress, 0n, false);

    await receiver.connect(forwarder).onReport("0x", registerReport);
    expect(await registry.verifiedNullifiers(nullifier)).to.equal(true);

    await expect(receiver.connect(forwarder).onReport("0x", revokeReport))
      .to.emit(receiver, "ReportProcessed")
      .withArgs(2, nullifier, ethers.ZeroAddress, 0n, false);

    expect(await registry.verifiedNullifiers(nullifier)).to.equal(false);
    expect(await registry.isHuman(alice.address)).to.equal(false);
  });

  it("validates workflow owner metadata when configured", async function () {
    const { receiver, forwarder, owner, bob } = await loadFixture(deployReceiverFixture);

    await receiver.connect(owner).setExpectedWorkflowOwner(owner.address);
    await receiver.connect(owner).setExpectedWorkflowName(WORKFLOW_NAME_BYTES10);

    const report = buildWorkflowReport(2, makeNullifier(23), ethers.ZeroAddress, 0n, false);
    const badMetadata = buildWorkflowMetadata(bob.address);

    await expect(
      receiver.connect(forwarder).onReport(badMetadata, report)
    ).to.be.revertedWithCustomError(receiver, "InvalidWorkflowOwner");
  });
});

describe("HumanGovDAO", function () {
  it("receives CCIP message and records human status", async function () {
    const { dao, routerAddress, alice } = await loadFixture(deployDAOFixture);

    const nullifier = makeNullifier(30);
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 180 * 24 * 3600);
    const message = buildCCIPMessage(nullifier, alice.address, expiry);

    await ethers.provider.send("hardhat_impersonateAccount", [routerAddress]);
    await ethers.provider.send("hardhat_setBalance", [routerAddress, "0x1000000000000000000"]);

    const routerSigner = await ethers.getSigner(routerAddress);

    await expect(dao.connect(routerSigner).ccipReceive(message))
      .to.emit(dao, "HumanStatusReceived")
      .withArgs(nullifier, alice.address, expiry);

    await ethers.provider.send("hardhat_stopImpersonatingAccount", [routerAddress]);

    expect(await dao.isHuman(alice.address)).to.equal(true);
  });

  it("allows verified human to create proposals and vote once", async function () {
    const { dao, routerAddress, alice } = await loadFixture(deployDAOFixture);

    const nullifier = makeNullifier(31);
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 180 * 24 * 3600);
    const message = buildCCIPMessage(nullifier, alice.address, expiry);

    await ethers.provider.send("hardhat_impersonateAccount", [routerAddress]);
    await ethers.provider.send("hardhat_setBalance", [routerAddress, "0x1000000000000000000"]);

    const routerSigner = await ethers.getSigner(routerAddress);
    await dao.connect(routerSigner).ccipReceive(message);

    await ethers.provider.send("hardhat_stopImpersonatingAccount", [routerAddress]);

    await expect(
      dao.connect(alice).createProposal("Upgrade", "Upgrade protocol params", 3600)
    )
      .to.emit(dao, "ProposalCreated")
      .withArgs(0n, "Upgrade", alice.address);

    await expect(dao.connect(alice).vote(0, true))
      .to.emit(dao, "Voted")
      .withArgs(0n, nullifier, true);

    await expect(dao.connect(alice).vote(0, false)).to.be.revertedWithCustomError(
      dao,
      "AlreadyVoted"
    );
  });

  it("rejects proposal creation for non-verified wallets", async function () {
    const { dao, alice } = await loadFixture(deployDAOFixture);

    await expect(
      dao.connect(alice).createProposal("Unauthorized", "Must fail", 3600)
    ).to.be.revertedWithCustomError(dao, "NotHuman");
  });

  it("finalizes proposals after voting period", async function () {
    const { dao, routerAddress, alice, bob } = await loadFixture(deployDAOFixture);

    for (const [idx, signer] of [[32, alice], [33, bob]] as const) {
      const nullifier = makeNullifier(idx);
      const expiry = BigInt(Math.floor(Date.now() / 1000) + 180 * 24 * 3600);
      const message = buildCCIPMessage(nullifier, signer.address, expiry);

      await ethers.provider.send("hardhat_impersonateAccount", [routerAddress]);
      await ethers.provider.send("hardhat_setBalance", [routerAddress, "0x1000000000000000000"]);

      const routerSigner = await ethers.getSigner(routerAddress);
      await dao.connect(routerSigner).ccipReceive(message);

      await ethers.provider.send("hardhat_stopImpersonatingAccount", [routerAddress]);
    }

    await dao.connect(alice).createProposal("Finalize", "Finalize lifecycle", 3600);
    await dao.connect(alice).vote(0, true);
    await dao.connect(bob).vote(0, false);

    await ethers.provider.send("evm_increaseTime", [3601]);
    await ethers.provider.send("evm_mine", []);

    await expect(dao.finalizeProposal(0))
      .to.emit(dao, "ProposalFinalized")
      .withArgs(0n, 2, 1n, 1n); // tie => FAILED
  });
});
