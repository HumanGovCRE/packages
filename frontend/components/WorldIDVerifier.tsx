"use client";

import { IDKitWidget, ISuccessResult, VerificationLevel } from "@worldcoin/idkit";

interface WorldIDVerifierProps {
  appId: `app_${string}`;
  action: string;
  signal: string;
  onSuccess: (result: ISuccessResult) => void;
  disabled?: boolean;
  verifying?: boolean;
  step?: number;
}

const STEPS = [
  "Connect Wallet",
  "Scan World ID",
  "On-chain Registration",
  "Cross-chain Propagation",
];

export default function WorldIDVerifier({
  appId,
  action,
  signal,
  onSuccess,
  disabled,
  verifying,
  step = 0,
}: WorldIDVerifierProps) {
  return (
    <div className="space-y-6">
      {/* Step progress */}
      <div className="space-y-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-3">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                i < step
                  ? "bg-[#238636] text-white"
                  : i === step
                  ? "bg-[#388bfd] text-white"
                  : "bg-human-700 text-[#8b949e]"
              }`}
            >
              {i < step ? "✓" : i + 1}
            </div>
            <span
              className={`text-sm ${
                i === step ? "text-white font-medium" : "text-[#8b949e]"
              }`}
            >
              {s}
            </span>
          </div>
        ))}
      </div>

      {/* IDKit widget */}
      <IDKitWidget
        app_id={appId}
        action={action}
        signal={signal}
        onSuccess={onSuccess}
        verification_level={VerificationLevel.Orb}
      >
        {({ open }: { open: () => void }) => (
          <button
            onClick={open}
            disabled={disabled || verifying}
            className="w-full py-3 bg-[#388bfd] hover:bg-[#1f6feb] text-white font-semibold rounded-lg transition-colors disabled:opacity-50 orb-glow"
          >
            {verifying ? "Verifying…" : "Verify with World ID"}
          </button>
        )}
      </IDKitWidget>
    </div>
  );
}
