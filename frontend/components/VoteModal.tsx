"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { DAO_ABI, DAO_ADDRESS } from "@/lib/contracts";

interface VoteModalProps {
  proposalId: number;
  proposalTitle: string;
  walletAddress: string;
  onClose: () => void;
  onVoted: () => void;
}

export default function VoteModal({
  proposalId,
  proposalTitle,
  walletAddress,
  onClose,
  onVoted,
}: VoteModalProps) {
  const [step, setStep] = useState<"choose" | "confirm" | "submitting" | "done">("choose");
  const [support, setSupport] = useState<boolean | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const getSigner = async () => {
    const ethereum = (window as unknown as { ethereum?: unknown }).ethereum;
    if (!ethereum) throw new Error("No wallet");
    const provider = new ethers.BrowserProvider(
      ethereum as ethers.Eip1193Provider
    );
    return provider.getSigner();
  };

  const handleSelect = (s: boolean) => {
    setSupport(s);
    setStep("confirm");
  };

  const handleConfirm = async () => {
    if (support === null) return;
    setStep("submitting");
    try {
      const signer = await getSigner();
      const dao = new ethers.Contract(DAO_ADDRESS, DAO_ABI, signer);
      const tx = await dao.vote(proposalId, support);
      await tx.wait();
      setTxHash(tx.hash);
      setStep("done");
      toast.success(`Vote ${support ? "YES" : "NO"} submitted!`);
      onVoted();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Vote failed.");
      setStep("confirm");
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-human-800 border border-human-700 rounded-xl p-8 w-full max-w-md z-50 shadow-2xl">
          <Dialog.Title className="text-lg font-bold text-white mb-2">
            Cast Your Vote
          </Dialog.Title>
          <p className="text-sm text-[#8b949e] mb-6 line-clamp-2">{proposalTitle}</p>

          {step === "choose" && (
            <div className="space-y-3">
              <p className="text-xs text-[#8b949e] mb-4">
                Choose your vote. One human, one vote — your identity remains private.
              </p>
              <button
                onClick={() => handleSelect(true)}
                className="w-full py-4 bg-[#238636]/20 hover:bg-[#238636]/40 border border-[#238636]/30 text-[#238636] font-bold text-lg rounded-xl transition-colors"
              >
                ✓ YES
              </button>
              <button
                onClick={() => handleSelect(false)}
                className="w-full py-4 bg-red-400/10 hover:bg-red-400/20 border border-red-400/30 text-red-400 font-bold text-lg rounded-xl transition-colors"
              >
                ✗ NO
              </button>
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-4">
              <div className={`w-full py-4 rounded-xl text-center font-bold text-2xl ${
                support
                  ? "bg-[#238636]/20 border border-[#238636]/30 text-[#238636]"
                  : "bg-red-400/10 border border-red-400/30 text-red-400"
              }`}>
                {support ? "✓ YES" : "✗ NO"}
              </div>
              <p className="text-sm text-[#8b949e] text-center">
                Confirm your vote. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setStep("choose")}
                  className="flex-1 py-3 border border-human-700 text-[#8b949e] rounded-lg hover:text-white transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-3 bg-[#388bfd] hover:bg-[#1f6feb] text-white font-semibold rounded-lg transition-colors"
                >
                  Confirm Vote
                </button>
              </div>
            </div>
          )}

          {step === "submitting" && (
            <div className="text-center py-6">
              <div className="text-4xl mb-4 animate-pulse">⏳</div>
              <p className="text-white font-semibold">Submitting your vote…</p>
              <p className="text-[#8b949e] text-sm mt-1">Please confirm in your wallet.</p>
            </div>
          )}

          {step === "done" && (
            <div className="text-center py-6 space-y-4">
              <div className="text-5xl">✅</div>
              <p className="text-white font-bold text-lg">Vote Submitted!</p>
              {txHash && (
                <p className="text-xs text-[#8b949e] font-mono break-all">{txHash}</p>
              )}
              <button
                onClick={onClose}
                className="w-full py-3 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
