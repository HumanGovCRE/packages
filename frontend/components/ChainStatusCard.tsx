"use client";

import { CHAIN_CONFIG } from "@/lib/contracts";

interface ChainStatusCardProps {
  chain: "source" | "target";
  verified: boolean;
  expiry: number | null;
  loading?: boolean;
}

export default function ChainStatusCard({
  chain,
  verified,
  expiry,
  loading,
}: ChainStatusCardProps) {
  const config = CHAIN_CONFIG[chain];
  const expiryDate = expiry ? new Date(expiry * 1000).toLocaleDateString() : null;

  return (
    <div
      className={`bg-human-800 border rounded-xl p-5 transition-all ${
        verified
          ? "border-[#238636]/40 verified-glow"
          : "border-human-700"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-white">{config.name}</span>
        <span className="text-xs text-[#8b949e]">Chain {config.id}</span>
      </div>

      {loading ? (
        <div className="text-[#8b949e] text-xs">Checking…</div>
      ) : verified ? (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#238636] animate-pulse" />
            <span className="text-[#238636] text-sm font-semibold">Verified Human</span>
          </div>
          {expiryDate && (
            <div className="text-xs text-[#8b949e]">Expires {expiryDate}</div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-red-400 text-sm font-semibold">Not Verified</span>
        </div>
      )}
    </div>
  );
}
