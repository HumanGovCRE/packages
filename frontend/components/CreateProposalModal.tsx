"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { DAO_ABI, DAO_ADDRESS } from "@/lib/contracts";

interface CreateProposalModalProps {
  walletAddress: string;
  onClose: () => void;
  onCreated: () => void;
}

const DEFAULT_DURATION = 7 * 24 * 3600; // 7 days

export default function CreateProposalModal({
  walletAddress,
  onClose,
  onCreated,
}: CreateProposalModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationDays, setDurationDays] = useState(7);
  const [loading, setLoading] = useState(false);

  const getSigner = async () => {
    const ethereum = (window as unknown as { ethereum?: unknown }).ethereum;
    if (!ethereum) throw new Error("No wallet");
    const provider = new ethers.BrowserProvider(
      ethereum as ethers.Eip1193Provider
    );
    return provider.getSigner();
  };

  const handleCreate = async () => {
    if (!title.trim()) { toast.error("Title is required."); return; }
    if (!description.trim()) { toast.error("Description is required."); return; }

    setLoading(true);
    try {
      const signer = await getSigner();
      const dao = new ethers.Contract(DAO_ADDRESS, DAO_ABI, signer);
      const duration = durationDays * 24 * 3600;
      const tx = await dao.createProposal(title.trim(), description.trim(), duration);
      await tx.wait();
      toast.success("Proposal created!");
      onCreated();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create proposal.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-human-800 border border-human-700 rounded-xl p-8 w-full max-w-lg z-50 shadow-2xl">
          <Dialog.Title className="text-lg font-bold text-white mb-6">
            Create Proposal
          </Dialog.Title>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#8b949e] mb-1.5">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                placeholder="Proposal title…"
                className="w-full bg-human-900 border border-human-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[#8b949e] focus:outline-none focus:border-[#388bfd]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#8b949e] mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Describe your proposal…"
                className="w-full bg-human-900 border border-human-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[#8b949e] focus:outline-none focus:border-[#388bfd] resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#8b949e] mb-1.5">
                Voting Duration (days)
              </label>
              <input
                type="number"
                value={durationDays}
                onChange={(e) => setDurationDays(Math.max(1, Math.min(30, Number(e.target.value))))}
                min={1}
                max={30}
                className="w-full bg-human-900 border border-human-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#388bfd]"
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-[#8b949e] bg-human-900 rounded-lg px-4 py-3 border border-human-700">
              <span>⚠️</span>
              <span>You must be a verified human on Base Sepolia to create proposals.</span>
            </div>
          </div>

          <div className="flex gap-3 mt-8">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3 border border-human-700 text-[#8b949e] rounded-lg hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={loading || !title.trim() || !description.trim()}
              className="flex-1 py-3 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create Proposal"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
