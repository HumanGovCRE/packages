import {
  bytesToHex,
  cre,
  encodeCallMsg,
  getNetwork,
  hexToBase64,
  json,
  LATEST_BLOCK_NUMBER,
  ok,
  Runner,
  TxStatus,
  type HTTPPayload,
  type Runtime,
} from "@chainlink/cre-sdk";
import {
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  parseAbi,
  parseAbiParameters,
  type Address,
  type Hex,
  zeroAddress,
} from "viem";
import { z } from "zod";

const REGISTRY_READ_ABI = parseAbi([
  "function verifiedNullifiers(bytes32) view returns (bool)",
  "function quotePropagationFeeInLink(bytes32,uint64) view returns (uint256)",
]);

const REPORT_PAYLOAD_TYPES = parseAbiParameters(
  "uint8 action, bytes32 nullifier, address wallet, uint64 destinationChainSelector, bool propagate"
);

const WORLD_ID_VERIFY_LEVEL_ORDER: Record<"device" | "orb", number> = {
  device: 1,
  orb: 2,
};

const configSchema = z.object({
  worldIdAppId: z.string().min(1),
  verificationAction: z.string().min(1),
  worldIdVerifyBaseUrl: z.string().url(),
  enforceSignalToMatchWallet: z.boolean(),
  minimumVerificationLevel: z.enum(["device", "orb"]),
  destinationChainSelector: z.string().regex(/^\d+$/),
  evm: z.object({
    sourceChainName: z.string().min(1),
    registryAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    receiverAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    receiverGasLimit: z.string().regex(/^\d+$/),
  }),
});

type Config = z.infer<typeof configSchema>;

const verificationPayloadSchema = z.object({
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  signal: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
  appId: z.string().optional(),
  action: z.string().optional(),
  proof: z.object({
    merkle_root: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    nullifier_hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
    proof: z.string().regex(/^0x[0-9a-fA-F]+$/),
    verification_level: z.enum(["orb", "device"]),
  }),
});

type VerificationPayload = z.infer<typeof verificationPayloadSchema>;

type VerificationSummary = {
  success: boolean;
  step: string;
  walletAddress?: string;
  nullifierHash?: string;
  verificationLevel?: string;
  estimatedLinkFee?: string;
  receiverTxHash?: string;
  error?: string;
};

function decodeVerificationPayload(payload: HTTPPayload): VerificationPayload {
  const body = Buffer.from(payload.input).toString("utf8");
  const parsed = JSON.parse(body);
  return verificationPayloadSchema.parse(parsed);
}

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

function ensurePayloadMatchesWorkflowConfig(config: Config, input: VerificationPayload): void {
  if (input.appId && input.appId !== config.worldIdAppId) {
    throw new Error(`appId mismatch: payload=${input.appId}, configured=${config.worldIdAppId}`);
  }

  if (input.action && input.action !== config.verificationAction) {
    throw new Error(
      `action mismatch: payload=${input.action}, configured=${config.verificationAction}`
    );
  }

  if (
    config.enforceSignalToMatchWallet &&
    input.signal &&
    input.signal.toLowerCase() !== input.walletAddress.toLowerCase()
  ) {
    throw new Error("signal must match walletAddress when enforceSignalToMatchWallet=true");
  }

  const minLevel = WORLD_ID_VERIFY_LEVEL_ORDER[config.minimumVerificationLevel];
  const actualLevel = WORLD_ID_VERIFY_LEVEL_ORDER[input.proof.verification_level];
  if (actualLevel < minLevel) {
    throw new Error(
      `verification level too low: got=${input.proof.verification_level}, required=${config.minimumVerificationLevel}`
    );
  }
}

function isNullifierAlreadyUsed(
  runtime: Runtime<Config>,
  evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
  config: Config,
  nullifierHash: Hex
): boolean {
  const callData = encodeFunctionData({
    abi: REGISTRY_READ_ABI,
    functionName: "verifiedNullifiers",
    args: [nullifierHash],
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
    functionName: "verifiedNullifiers",
    data: bytesToHex(response.data),
  }) as boolean;
}

function quoteLinkPropagationFee(
  runtime: Runtime<Config>,
  evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
  config: Config,
  nullifierHash: Hex
): bigint {
  const callData = encodeFunctionData({
    abi: REGISTRY_READ_ABI,
    functionName: "quotePropagationFeeInLink",
    args: [nullifierHash, BigInt(config.destinationChainSelector)],
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
    functionName: "quotePropagationFeeInLink",
    data: bytesToHex(response.data),
  }) as bigint;
}

function verifyWithWorldIdConfidentialHttp(
  runtime: Runtime<Config>,
  config: Config,
  input: VerificationPayload
): { nullifierHash: Hex; verificationLevel: "orb" | "device" } {
  const worldcoinApiKey = runtime.getSecret({ id: "WORLDCOIN_API_KEY" }).result().value;

  const body = {
    merkle_root: input.proof.merkle_root,
    nullifier_hash: input.proof.nullifier_hash,
    proof: input.proof.proof,
    verification_level: input.proof.verification_level,
    action: config.verificationAction,
    signal: input.signal ?? input.walletAddress,
  };

  const confidentialClient = new cre.capabilities.ConfidentialHTTPClient();
  const response = confidentialClient
    .sendRequest(runtime, {
      vaultDonSecrets: [],
      request: {
        url: `${config.worldIdVerifyBaseUrl}/${config.worldIdAppId}`,
        method: "POST",
        bodyString: JSON.stringify(body),
        multiHeaders: {
          "Content-Type": { values: ["application/json"] },
          Authorization: { values: [`Bearer ${worldcoinApiKey}`] },
        },
      },
    })
    .result();

  if (!ok(response)) {
    const details = json(response) as Record<string, unknown>;
    const detailString =
      typeof details.detail === "string"
        ? details.detail
        : typeof details.code === "string"
          ? details.code
          : JSON.stringify(details);

    throw new Error(`World ID verification failed (${response.statusCode}): ${detailString}`);
  }

  const parsed = json(response) as Record<string, unknown>;
  const nullifierHash =
    typeof parsed.nullifier_hash === "string"
      ? (parsed.nullifier_hash as Hex)
      : (input.proof.nullifier_hash as Hex);

  if (!/^0x[0-9a-fA-F]{64}$/.test(nullifierHash)) {
    throw new Error("World ID response did not include a valid nullifier_hash");
  }

  const verificationLevel =
    parsed.verification_level === "orb" || parsed.verification_level === "device"
      ? (parsed.verification_level as "orb" | "device")
      : input.proof.verification_level;

  return { nullifierHash, verificationLevel };
}

function writeRegistrationReport(
  runtime: Runtime<Config>,
  evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
  config: Config,
  nullifierHash: Hex,
  walletAddress: Address
): string {
  const encodedReportPayload = encodeAbiParameters(REPORT_PAYLOAD_TYPES, [
    1,
    nullifierHash,
    walletAddress,
    BigInt(config.destinationChainSelector),
    true,
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
      `writeReport failed with status=${writeResult.txStatus} error=${writeResult.errorMessage ?? "unknown"}`
    );
  }

  return bytesToHex(writeResult.txHash ?? new Uint8Array(32));
}

export function onVerifyTrigger(runtime: Runtime<Config>, payload: HTTPPayload): string {
  const summary: VerificationSummary = {
    success: false,
    step: "init",
  };

  try {
    const config = configSchema.parse(runtime.config);
    const input = decodeVerificationPayload(payload);

    summary.step = "validate_request";
    ensurePayloadMatchesWorkflowConfig(config, input);

    const evmClient = getSourceEvmClient(config);

    summary.step = "duplicate_check";
    const duplicate = isNullifierAlreadyUsed(
      runtime,
      evmClient,
      config,
      input.proof.nullifier_hash as Hex
    );
    if (duplicate) {
      summary.error = "Nullifier already registered";
      return JSON.stringify(summary);
    }

    summary.step = "worldid_verify";
    const verification = verifyWithWorldIdConfidentialHttp(runtime, config, input);

    const minLevel = WORLD_ID_VERIFY_LEVEL_ORDER[config.minimumVerificationLevel];
    const actualLevel = WORLD_ID_VERIFY_LEVEL_ORDER[verification.verificationLevel];
    if (actualLevel < minLevel) {
      throw new Error(
        `World ID returned insufficient verification level: ${verification.verificationLevel}`
      );
    }

    summary.step = "fee_quote";
    try {
      const quote = quoteLinkPropagationFee(
        runtime,
        evmClient,
        config,
        verification.nullifierHash
      );
      summary.estimatedLinkFee = quote.toString();
      runtime.log(`Estimated LINK propagation fee: ${quote.toString()}`);
    } catch (quoteErr) {
      runtime.log(`Fee quote skipped: ${quoteErr instanceof Error ? quoteErr.message : String(quoteErr)}`);
    }

    summary.step = "onchain_write";
    const receiverTxHash = writeRegistrationReport(
      runtime,
      evmClient,
      config,
      verification.nullifierHash,
      input.walletAddress as Address
    );

    summary.success = true;
    summary.step = "done";
    summary.walletAddress = input.walletAddress;
    summary.nullifierHash = verification.nullifierHash;
    summary.verificationLevel = verification.verificationLevel;
    summary.receiverTxHash = receiverTxHash;
    return JSON.stringify(summary);
  } catch (err) {
    summary.error = err instanceof Error ? err.message : String(err);
    runtime.log(`verify-human workflow error at ${summary.step}: ${summary.error}`);
    return JSON.stringify(summary);
  }
}

function initWorkflow(_config: Config) {
  const httpTrigger = new cre.capabilities.HTTPCapability();
  return [cre.handler(httpTrigger.trigger({}), onVerifyTrigger)];
}

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

if (import.meta.main) {
  main();
}
