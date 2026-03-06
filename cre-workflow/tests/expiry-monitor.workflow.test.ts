import { expect } from "bun:test";
import { type Runtime, TxStatus, hexToBase64 } from "@chainlink/cre-sdk";
import {
  EvmMock,
  addContractMock,
  newTestRuntime,
  REPORT_METADATA_HEADER_LENGTH,
  test,
} from "@chainlink/cre-sdk/test";
import {
  bytesToHex,
  decodeAbiParameters,
  encodeAbiParameters,
  parseAbi,
  parseAbiParameters,
  toEventSelector,
  padHex,
  type Hex,
} from "viem";
import { onCronTrigger } from "../workflows/expiry-monitor/main";

const SOURCE_CHAIN_SELECTOR = 16015286601757825753n; // ethereum-testnet-sepolia

const REGISTRY_ABI = parseAbi([
  "function verificationExpiry(bytes32) view returns (uint256)",
]);
const RECEIVER_ABI = parseAbi(["function onReport(bytes metadata, bytes report)"]);

const REPORT_PAYLOAD_TYPES = parseAbiParameters(
  "uint8 action, bytes32 nullifier, address wallet, uint64 destinationChainSelector, bool propagate"
);

const HUMAN_VERIFIED_TOPIC = toEventSelector(
  "HumanVerified(bytes32,address,uint256)"
);

const baseConfig = {
  schedule: "0 0 */6 * * *",
  warningWindowSeconds: 60 * 60 * 24 * 7,
  lookbackBlocks: 50_000,
  autoRevokeExpired: true,
  maxRevocationsPerRun: 25,
  evm: {
    sourceChainName: "ethereum-testnet-sepolia",
    registryAddress: "0x1111111111111111111111111111111111111111",
    receiverAddress: "0x2222222222222222222222222222222222222222",
    receiverGasLimit: "900000",
  },
} as const;

function makeLog(nullifier: Hex, wallet: Hex, expiry: bigint) {
  const topic1 = nullifier;
  const topic2 = padHex(wallet, { size: 32 });
  const data = encodeAbiParameters(parseAbiParameters("uint256"), [expiry]);

  return {
    address: hexToBase64(baseConfig.evm.registryAddress),
    topics: [
      hexToBase64(HUMAN_VERIFIED_TOPIC),
      hexToBase64(topic1),
      hexToBase64(topic2),
    ],
    txHash: hexToBase64("0x" + "aa".repeat(32)),
    blockHash: hexToBase64("0x" + "bb".repeat(32)),
    data: hexToBase64(data),
    eventSig: hexToBase64(HUMAN_VERIFIED_TOPIC),
    txIndex: 0,
    index: 0,
    removed: false,
  };
}

test("expiry-monitor finds expiring entries and auto-revokes expired ones", () => {
  const runtime = newTestRuntime() as Runtime<typeof baseConfig>;
  (runtime as any).config = baseConfig;

  const now = Math.floor(Date.now() / 1000);
  const expiredNullifier =
    "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
  const soonNullifier =
    "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex;

  const evmMock = EvmMock.testInstance(SOURCE_CHAIN_SELECTOR);
  evmMock.headerByNumber = () => ({
    header: {
      timestamp: String(now),
    },
  } as any);
  evmMock.filterLogs = () => ({
    logs: [
      makeLog(
        expiredNullifier,
        "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
        BigInt(now - 10)
      ),
      makeLog(
        soonNullifier,
        "0x15ee0018efda0f7689abd704b20c8c1c9b8e52b7",
        BigInt(now + 60)
      ),
    ],
  });

  const registryMock = addContractMock(evmMock, {
    address: baseConfig.evm.registryAddress,
    abi: REGISTRY_ABI,
  });

  registryMock.verificationExpiry = (...args: readonly unknown[]) => {
    const [nullifier] = args as [Hex];
    if ((nullifier as Hex).toLowerCase() === expiredNullifier.toLowerCase()) {
      return BigInt(now - 10);
    }
    return BigInt(now + 60);
  };

  const receiverMock = addContractMock(evmMock, {
    address: baseConfig.evm.receiverAddress,
    abi: RECEIVER_ABI,
  });

  let revokeWrites = 0;
  receiverMock.writeReport = (input) => {
    revokeWrites += 1;

    const reportPayloadHex = bytesToHex(
      input.report.rawReport.slice(REPORT_METADATA_HEADER_LENGTH)
    );
    const [action, nullifier, wallet, destination, propagate] = decodeAbiParameters(
      REPORT_PAYLOAD_TYPES,
      reportPayloadHex as Hex
    );

    expect(action).toBe(2);
    expect(wallet).toBe("0x0000000000000000000000000000000000000000");
    expect(destination).toBe(0n);
    expect(propagate).toBe(false);
    expect(nullifier.toLowerCase()).toBe(expiredNullifier.toLowerCase());

    return {
      txStatus: TxStatus.SUCCESS,
      txHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    } as any;
  };

  const result = onCronTrigger(runtime, {} as any);
  const parsed = JSON.parse(result);

  expect(parsed.success).toBe(true);
  expect(parsed.scannedNullifiers).toBe(2);
  expect(parsed.expiredCount).toBe(1);
  expect(parsed.expiringSoonCount).toBe(1);
  expect(parsed.revokedCount).toBe(1);
  expect(revokeWrites).toBe(1);
});

test("expiry-monitor supports dry-run mode with no revocations", () => {
  const runtime = newTestRuntime() as Runtime<typeof baseConfig>;
  (runtime as any).config = {
    ...baseConfig,
    autoRevokeExpired: false,
  };

  const now = Math.floor(Date.now() / 1000);
  const expiredNullifier =
    "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as Hex;

  const evmMock = EvmMock.testInstance(SOURCE_CHAIN_SELECTOR);
  evmMock.headerByNumber = () => ({ header: { timestamp: String(now) } } as any);
  evmMock.filterLogs = () => ({
    logs: [
      makeLog(
        expiredNullifier,
        "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
        BigInt(now - 20)
      ),
    ],
  });

  const registryMock = addContractMock(evmMock, {
    address: baseConfig.evm.registryAddress,
    abi: REGISTRY_ABI,
  });
  registryMock.verificationExpiry = () => BigInt(now - 20);

  const result = onCronTrigger(runtime, {} as any);
  const parsed = JSON.parse(result);

  expect(parsed.success).toBe(true);
  expect(parsed.expiredCount).toBe(1);
  expect(parsed.revokedCount).toBe(0);
});

test("expiry-monitor handles empty log sets", () => {
  const runtime = newTestRuntime() as Runtime<typeof baseConfig>;
  (runtime as any).config = baseConfig;

  const evmMock = EvmMock.testInstance(SOURCE_CHAIN_SELECTOR);
  evmMock.headerByNumber = () => ({
    header: { timestamp: String(Math.floor(Date.now() / 1000)) },
  } as any);
  evmMock.filterLogs = () => ({ logs: [] });

  const result = onCronTrigger(runtime, {} as any);
  const parsed = JSON.parse(result);

  expect(parsed.success).toBe(true);
  expect(parsed.scannedNullifiers).toBe(0);
  expect(parsed.expiredCount).toBe(0);
  expect(parsed.expiringSoonCount).toBe(0);
  expect(parsed.revokedCount).toBe(0);
});
