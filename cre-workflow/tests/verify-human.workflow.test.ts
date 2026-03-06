import { expect } from "bun:test";
import {
  type Runtime,
  TxStatus,
} from "@chainlink/cre-sdk";
import {
  EvmMock,
  ConfidentialHttpMock,
  addContractMock,
  newTestRuntime,
  REPORT_METADATA_HEADER_LENGTH,
  test,
  type Secrets,
} from "@chainlink/cre-sdk/test";
import {
  bytesToHex,
  decodeAbiParameters,
  parseAbi,
  parseAbiParameters,
  type Hex,
} from "viem";
import { onVerifyTrigger } from "../workflows/verify-human/main";

const SOURCE_CHAIN_SELECTOR = 16015286601757825753n; // ethereum-testnet-sepolia

const REGISTRY_ABI = parseAbi([
  "function verifiedNullifiers(bytes32) view returns (bool)",
  "function quotePropagationFeeInLink(bytes32,uint64) view returns (uint256)",
]);
const RECEIVER_ABI = parseAbi(["function onReport(bytes metadata, bytes report)"]);

const REPORT_PAYLOAD_TYPES = parseAbiParameters(
  "uint8 action, bytes32 nullifier, address wallet, uint64 destinationChainSelector, bool propagate"
);

const baseConfig = {
  worldIdAppId: "app_staging_humangov",
  verificationAction: "verify-human",
  worldIdVerifyBaseUrl: "https://developer.worldcoin.org/api/v2/verify",
  enforceSignalToMatchWallet: true,
  minimumVerificationLevel: "orb",
  destinationChainSelector: "10344971235874465080",
  evm: {
    sourceChainName: "ethereum-testnet-sepolia",
    registryAddress: "0x1111111111111111111111111111111111111111",
    receiverAddress: "0x2222222222222222222222222222222222222222",
    receiverGasLimit: "900000",
  },
} as const;

const goodPayload = {
  walletAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  signal: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  appId: "app_staging_humangov",
  action: "verify-human",
  proof: {
    merkle_root:
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    nullifier_hash:
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    proof:
      "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    verification_level: "orb",
  },
} as const;

function secretsMap(apiKey = "test-worldcoin-key"): Secrets {
  return new Map([["default", new Map([["WORLDCOIN_API_KEY", apiKey]])]]);
}

function httpPayload(input: unknown) {
  return {
    input: new TextEncoder().encode(JSON.stringify(input)),
  };
}

test("verify-human workflow succeeds and emits a register report write", () => {
  const runtime = newTestRuntime(secretsMap()) as Runtime<typeof baseConfig>;
  (runtime as any).config = baseConfig;

  const evmMock = EvmMock.testInstance(SOURCE_CHAIN_SELECTOR);
  const registryMock = addContractMock(evmMock, {
    address: baseConfig.evm.registryAddress,
    abi: REGISTRY_ABI,
  });
  const receiverMock = addContractMock(evmMock, {
    address: baseConfig.evm.receiverAddress,
    abi: RECEIVER_ABI,
  });

  registryMock.verifiedNullifiers = () => false;
  registryMock.quotePropagationFeeInLink = () => 123456789n;

  let writeReportCalled = false;
  receiverMock.writeReport = (input) => {
    writeReportCalled = true;

    const reportPayloadHex = bytesToHex(
      input.report.rawReport.slice(REPORT_METADATA_HEADER_LENGTH)
    );
    const [action, nullifier, wallet, destination, propagate] = decodeAbiParameters(
      REPORT_PAYLOAD_TYPES,
      reportPayloadHex as Hex
    );

    expect(action).toBe(1);
    expect(nullifier.toLowerCase()).toBe(goodPayload.proof.nullifier_hash.toLowerCase());
    expect(wallet.toLowerCase()).toBe(goodPayload.walletAddress.toLowerCase());
    expect(destination.toString()).toBe(baseConfig.destinationChainSelector);
    expect(propagate).toBe(true);

    return {
      txStatus: TxStatus.SUCCESS,
      txHash: Uint8Array.from(Buffer.from("aa".repeat(32), "hex")),
    } as any;
  };

  const confidentialHttpMock = ConfidentialHttpMock.testInstance();
  confidentialHttpMock.sendRequest = () => ({
    statusCode: 200,
    body: Buffer.from(
      JSON.stringify({
        nullifier_hash: goodPayload.proof.nullifier_hash,
        verification_level: "orb",
      })
    ).toString("base64"),
  });

  const result = onVerifyTrigger(runtime, httpPayload(goodPayload) as any);
  const parsed = JSON.parse(result);

  expect(parsed.success).toBe(true);
  expect(parsed.step).toBe("done");
  expect(parsed.nullifierHash.toLowerCase()).toBe(
    goodPayload.proof.nullifier_hash.toLowerCase()
  );
  expect(parsed.receiverTxHash).toBe(
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  );
  expect(writeReportCalled).toBe(true);
});

test("verify-human workflow halts on duplicate nullifier", () => {
  const runtime = newTestRuntime(secretsMap()) as Runtime<typeof baseConfig>;
  (runtime as any).config = baseConfig;

  const evmMock = EvmMock.testInstance(SOURCE_CHAIN_SELECTOR);
  const registryMock = addContractMock(evmMock, {
    address: baseConfig.evm.registryAddress,
    abi: REGISTRY_ABI,
  });
  registryMock.verifiedNullifiers = () => true;

  const confidentialHttpMock = ConfidentialHttpMock.testInstance();
  confidentialHttpMock.sendRequest = () => {
    throw new Error("should not be called when duplicate");
  };

  const result = onVerifyTrigger(runtime, httpPayload(goodPayload) as any);
  const parsed = JSON.parse(result);

  expect(parsed.success).toBe(false);
  expect(parsed.step).toBe("duplicate_check");
  expect(parsed.error).toContain("already registered");
});

test("verify-human workflow handles World ID verification failure", () => {
  const runtime = newTestRuntime(secretsMap()) as Runtime<typeof baseConfig>;
  (runtime as any).config = baseConfig;

  const evmMock = EvmMock.testInstance(SOURCE_CHAIN_SELECTOR);
  const registryMock = addContractMock(evmMock, {
    address: baseConfig.evm.registryAddress,
    abi: REGISTRY_ABI,
  });
  registryMock.verifiedNullifiers = () => false;

  const confidentialHttpMock = ConfidentialHttpMock.testInstance();
  confidentialHttpMock.sendRequest = () => ({
    statusCode: 400,
    body: Buffer.from(
      JSON.stringify({ code: "invalid_proof", detail: "proof rejected" })
    ).toString("base64"),
  });

  const result = onVerifyTrigger(runtime, httpPayload(goodPayload) as any);
  const parsed = JSON.parse(result);

  expect(parsed.success).toBe(false);
  expect(parsed.step).toBe("worldid_verify");
  expect(parsed.error).toContain("World ID verification failed");
});

test("verify-human workflow reports on-chain write failure", () => {
  const runtime = newTestRuntime(secretsMap()) as Runtime<typeof baseConfig>;
  (runtime as any).config = baseConfig;

  const evmMock = EvmMock.testInstance(SOURCE_CHAIN_SELECTOR);
  const registryMock = addContractMock(evmMock, {
    address: baseConfig.evm.registryAddress,
    abi: REGISTRY_ABI,
  });
  const receiverMock = addContractMock(evmMock, {
    address: baseConfig.evm.receiverAddress,
    abi: RECEIVER_ABI,
  });

  registryMock.verifiedNullifiers = () => false;
  registryMock.quotePropagationFeeInLink = () => 1n;
  receiverMock.writeReport = () => ({
    txStatus: TxStatus.REVERTED,
    errorMessage: "receiver reverted",
  } as any);

  const confidentialHttpMock = ConfidentialHttpMock.testInstance();
  confidentialHttpMock.sendRequest = () => ({
    statusCode: 200,
    body: Buffer.from(
      JSON.stringify({
        nullifier_hash: goodPayload.proof.nullifier_hash,
        verification_level: "orb",
      })
    ).toString("base64"),
  });

  const result = onVerifyTrigger(runtime, httpPayload(goodPayload) as any);
  const parsed = JSON.parse(result);

  expect(parsed.success).toBe(false);
  expect(parsed.step).toBe("onchain_write");
  expect(parsed.error).toContain("writeReport failed");
});
