"use client";

import { useState, useCallback } from "react";
import { IDKitWidget, ISuccessResult, VerificationLevel } from "@worldcoin/idkit";
import toast from "react-hot-toast";
import Link from "next/link";
import { useVerification } from "@/lib/hooks/useVerification";
import { useHumanStatus } from "@/lib/hooks/useHumanStatus";

const STEPS = [
  "Connect Wallet",
  "Scan World ID",
  "On-chain Registration",
  "Cross-chain Propagation",
];

export default function VerifyPage() {
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [currentStep, setCurrentStep] = useState(0);

  const { submitProof, verifying, verified, txHash, error } =
    useVerification();

  const { isHumanOnSepolia, isHumanOnBase, expiry, loading } =
    useHumanStatus(walletAddress);

  const connectWallet = useCallback(async () => {
    if (typeof window === "undefined") return;
    const ethereum = (window as unknown as { ethereum?: { request: (args: { method: string }) => Promise<string[]> } }).ethereum;
    if (!ethereum) {
      toast.error("No wallet detected. Please install MetaMask.");
      return;
    }
    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      setWalletAddress(accounts[0]);
      setCurrentStep(1);
      toast.success("Wallet connected!");
    } catch {
      toast.error("Failed to connect wallet.");
    }
  }, []);

  const handleWorldIDSuccess = useCallback(
    async (result: ISuccessResult) => {
      if (!walletAddress) return;
      setCurrentStep(2);
      toast.loading("Submitting proof to CRE workflow...", { id: "proof" });
      try {
        await submitProof(result, walletAddress);
        toast.success("Verification registered on-chain!", { id: "proof" });
        setCurrentStep(3);
        setTimeout(() => setCurrentStep(4), 2000);
      } catch {
        toast.error("Proof submission failed.", { id: "proof" });
        setCurrentStep(1);
      }
    },
    [walletAddress, submitProof]
  );

  const appId = (process.env.NEXT_PUBLIC_WLD_APP_ID || "app_staging_000000000000000000000000") as `app_${string}`;
  const action = process.env.NEXT_PUBLIC_WLD_ACTION || "humangov-vote";

  return (
    <main className="min-h-screen bg-human-900 flex flex-col">
      {/* Nav */}
      <nav className="border-b border-human-700 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-white tracking-tight">
          Human<span className="text-[#238636]">Gov</span>
        </Link>
        <span className="text-sm text-[#8b949e]">Verification</span>
      </nav>

      <div className="flex-1 px-6 py-12 max-w-2xl mx-auto w-full">
        <h1 className="text-3xl font-bold text-white mb-2">Verify Your Humanity</h1>
        <p className="text-[#8b949e] mb-10">
          Prove you are a unique human using World ID to participate in HumanGov.
        </p>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-10 overflow-x-auto pb-2">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-2 shrink-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  i < currentStep
                    ? "bg-[#238636] text-white"
                    : i === currentStep
                    ? "bg-[#388bfd] text-white"
                    : "bg-human-700 text-[#8b949e]"
                }`}
              >
                {i < currentStep ? "✓" : i + 1}
              </div>
              <span
                className={`text-xs font-medium ${
                  i === currentStep ? "text-white" : "text-[#8b949e]"
                }`}
              >
                {step}
              </span>
              {i < STEPS.length - 1 && (
                <div className="w-6 h-px bg-human-700 mx-1" />
              )}
            </div>
          ))}
        </div>

        {/* Current status */}
        {walletAddress && (
          <div className="bg-human-800 border border-human-700 rounded-xl p-6 mb-8">
            <h2 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider mb-4">
              Verification Status
            </h2>
            {loading ? (
              <div className="text-[#8b949e] text-sm">Checking status…</div>
            ) : (
              <div className="space-y-3">
                <StatusRow
                  chain="Sepolia"
                  verified={isHumanOnSepolia}
                  expiry={expiry}
                />
                <StatusRow
                  chain="Base Sepolia"
                  verified={isHumanOnBase}
                  expiry={expiry}
                />
              </div>
            )}
          </div>
        )}

        {/* Action card */}
        <div className="bg-human-800 border border-human-700 rounded-xl p-8 text-center">
          {verified || (isHumanOnSepolia && isHumanOnBase) ? (
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#238636]/20 flex items-center justify-center mx-auto">
                <span className="text-3xl">✅</span>
              </div>
              <h2 className="text-xl font-bold text-white">You&apos;re Verified!</h2>
              <p className="text-[#8b949e] text-sm">
                Your human status is active on both chains.
              </p>
              {txHash && (
                <p className="text-xs text-[#8b949e] font-mono break-all">
                  Tx: {txHash}
                </p>
              )}
              <Link
                href="/dao"
                className="inline-block mt-4 px-6 py-2.5 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold rounded-lg transition-colors"
              >
                Go to DAO →
              </Link>
            </div>
          ) : !walletAddress ? (
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#388bfd]/20 flex items-center justify-center mx-auto">
                <span className="text-3xl">🔗</span>
              </div>
              <h2 className="text-xl font-bold text-white">Connect Your Wallet</h2>
              <p className="text-[#8b949e] text-sm">
                Connect your Ethereum wallet to begin the verification process.
              </p>
              <button
                onClick={connectWallet}
                className="mt-4 px-8 py-3 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold rounded-lg transition-colors"
              >
                Connect Wallet
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#388bfd]/20 flex items-center justify-center mx-auto orb-glow">
                <span className="text-3xl">🌐</span>
              </div>
              <h2 className="text-xl font-bold text-white">Scan World ID</h2>
              <p className="text-[#8b949e] text-sm">
                Use the World App to verify you are a unique human. Your identity
                remains private.
              </p>
              <div className="flex justify-center mt-4">
                <IDKitWidget
                  app_id={appId}
                  action={action}
                  signal={walletAddress}
                  onSuccess={handleWorldIDSuccess}
                  verification_level={VerificationLevel.Orb}
                >
                  {({ open }: { open: () => void }) => (
                    <button
                      onClick={open}
                      disabled={verifying}
                      className="px-8 py-3 bg-[#388bfd] hover:bg-[#1f6feb] text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
                    >
                      {verifying ? "Verifying…" : "Verify with World ID"}
                    </button>
                  )}
                </IDKitWidget>
              </div>
              {error && (
                <p className="text-red-400 text-sm mt-2">{error}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function StatusRow({
  chain,
  verified,
  expiry,
}: {
  chain: string;
  verified: boolean;
  expiry: number | null;
}) {
  const expiryDate = expiry ? new Date(expiry * 1000).toLocaleDateString() : null;
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[#e6edf3]">{chain}</span>
      <div className="flex items-center gap-2">
        {verified ? (
          <>
            <span className="text-[#238636] text-sm font-semibold">✓ Verified</span>
            {expiryDate && (
              <span className="text-xs text-[#8b949e]">expires {expiryDate}</span>
            )}
          </>
        ) : (
          <span className="text-red-400 text-sm font-semibold">✗ Not Verified</span>
        )}
      </div>
    </div>
  );
}
