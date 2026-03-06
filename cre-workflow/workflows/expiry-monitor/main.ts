import {
  blockNumber,
  bytesToHex,
  cre,
  encodeCallMsg,
  getNetwork,
  hexToBase64,
  LATEST_BLOCK_NUMBER,
  protoBigIntToBigint,
  Runner,
  TxStatus,
  type CronPayload,
  type Runtime,
} from "@chainlink/cre-sdk";
import {
  decodeEventLog,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  parseAbi,
  parseAbiParameters,
  toEventSelector,
  type Address,
  type Hex,
  zeroAddress,
} from "viem";
import { z } from "zod";

const REGISTRY_EVENT_ABI = parseAbi([
  "event HumanVerified(bytes32 indexed nullifier, address indexed wallet, uint256 expiry)",
]);

const REGISTRY_READ_ABI = parseAbi([
  "function verificationExpiry(bytes32) view returns (uint256)",
]);

const REPORT_PAYLOAD_TYPES = parseAbiParameters(
  "uint8 action, bytes32 nullifier, address wallet, uint64 destinationChainSelector, bool propagate"
);

const HUMAN_VERIFIED_TOPIC = toEventSelector(
  "HumanVerified(bytes32,address,uint256)"
);

const configSchema = z.object({
  schedule: z.string(),
  warningWindowSeconds: z.number().int().positive(),
  lookbackBlocks: z.number().int().positive(),
  autoRevokeExpired: z.boolean(),
  maxRevocationsPerRun: z.number().int().positive(),
  evm: z.object({
    sourceChainName: z.string().min(1),
    registryAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    receiverAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    receiverGasLimit: z.string().regex(/^\d+$/),
  }),
});

type Config = z.infer<typeof configSchema>;

type ExpirySummary = {
  success: boolean;
  checkedAt: string;
  scannedNullifiers: number;
  expiredCount: number;
  expiringSoonCount: number;
  revokedCount: number;
  revokedNullifiers: string[];
  error?: string;
};

function getSourceEvmClient(config: Config): InstanceType<typeof cre.capabilities.EVMClient> {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.evm.sourceChainName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Unsupported EVM chain selector name: ${config.evm.sourceChainName}`);
  }

  return new cre.capabilities.EVMClient(network.chainSelector.selector);
}

function collectRecentNullifiers(
  runtime: Runtime<Config>,
  evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
  config: Config
): Hex[] {
  const headerResponse = evmClient.headerByNumber(runtime, {}).result();
  const latestBlock = headerResponse.header?.blockNumber
    ? protoBigIntToBigint(headerResponse.header.blockNumber)
    : 0n;
  const fromBlock =
    latestBlock > BigInt(config.lookbackBlocks)
      ? latestBlock - BigInt(config.lookbackBlocks)
      : 0n;

  runtime.log(
    `Scanning HumanVerified logs from block ${fromBlock.toString()} to ${latestBlock.toString()}`
  );

  const logs = evmClient
    .filterLogs(runtime, {
      filterQuery: {
        addresses: [hexToBase64(config.evm.registryAddress)],
        topics: [
          {
            topic: [hexToBase64(HUMAN_VERIFIED_TOPIC)],
          },
        ],
        fromBlock: blockNumber(fromBlock),
        toBlock: blockNumber(latestBlock),
      },
    })
    .result();

  const seen = new Set<string>();
  for (const rawLog of logs.logs) {
    try {
      const decoded = decodeEventLog({
        abi: REGISTRY_EVENT_ABI,
        data: bytesToHex(rawLog.data),
        topics: rawLog.topics.map((topic) => bytesToHex(topic)) as [
          `0x${string}`,
          ...`0x${string}`[]
        ],
      });

      if (decoded.eventName !== "HumanVerified") continue;

      const nullifier = decoded.args.nullifier as Hex;
      seen.add(nullifier.toLowerCase());
    } catch {
      // Keep scanning even if one log is malformed.
      continue;
    }
  }

  return [...seen] as Hex[];
}

function readExpiryTimestamp(
  runtime: Runtime<Config>,
  evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
  config: Config,
  nullifier: Hex
): bigint {
  const callData = encodeFunctionData({
    abi: REGISTRY_READ_ABI,
    functionName: "verificationExpiry",
    args: [nullifier],
  });

  const response = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: config.evm.registryAddress as Address,
        data: callData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  return decodeFunctionResult({
    abi: REGISTRY_READ_ABI,
    functionName: "verificationExpiry",
    data: bytesToHex(response.data),
  }) as bigint;
}

function writeRevocationReport(
  runtime: Runtime<Config>,
  evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
  config: Config,
  nullifier: Hex
): string {
  const encodedReportPayload = encodeAbiParameters(REPORT_PAYLOAD_TYPES, [
    2,
    nullifier,
    zeroAddress,
    0n,
    false,
  ]);

  const report = runtime
    .report({
      encodedPayload: hexToBase64(encodedReportPayload),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: config.evm.receiverAddress,
      report,
      gasConfig: {
        gasLimit: config.evm.receiverGasLimit,
      },
    })
    .result();

  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(
      `revoke writeReport failed with status=${writeResult.txStatus} error=${writeResult.errorMessage ?? "unknown"}`
    );
  }

  return bytesToHex(writeResult.txHash ?? new Uint8Array(32));
}

export function onCronTrigger(runtime: Runtime<Config>, _payload: CronPayload): string {
  const summary: ExpirySummary = {
    success: false,
    checkedAt: runtime.now().toISOString(),
    scannedNullifiers: 0,
    expiredCount: 0,
    expiringSoonCount: 0,
    revokedCount: 0,
    revokedNullifiers: [],
  };

  try {
    const config = configSchema.parse(runtime.config);
    const evmClient = getSourceEvmClient(config);

    const nullifiers = collectRecentNullifiers(runtime, evmClient, config);
    summary.scannedNullifiers = nullifiers.length;

    const nowSeconds = BigInt(Math.floor(runtime.now().getTime() / 1000));
    const warningCutoff = nowSeconds + BigInt(config.warningWindowSeconds);

    for (const nullifier of nullifiers) {
      const expiry = readExpiryTimestamp(runtime, evmClient, config, nullifier);

      if (expiry == 0n) continue;

      if (expiry <= nowSeconds) {
        summary.expiredCount += 1;

        if (config.autoRevokeExpired && summary.revokedCount < config.maxRevocationsPerRun) {
          writeRevocationReport(runtime, evmClient, config, nullifier);
          summary.revokedCount += 1;
          summary.revokedNullifiers.push(nullifier);
        }
      } else if (expiry <= warningCutoff) {
        summary.expiringSoonCount += 1;
      }
    }

    summary.success = true;
    return JSON.stringify(summary);
  } catch (err) {
    summary.error = err instanceof Error ? err.message : String(err);
    runtime.log(`expiry-monitor error: ${summary.error}`);
    return JSON.stringify(summary);
  }
}

function initWorkflow(config: Config) {
  const cron = new cre.capabilities.CronCapability();
  return [
    cre.handler(
      cron.trigger({
        schedule: config.schedule,
      }),
      onCronTrigger
    ),
  ];
}

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

if (import.meta.main) {
  main();
}
