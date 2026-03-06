"use client";

import { useState } from "react";
import Link from "next/link";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { REGISTRY_ABI, REGISTRY_ADDRESS, DAO_ABI, DAO_ADDRESS, CHAIN_CONFIG } from "@/lib/contracts";

const BASE_SEPOLIA_CHAIN_SELECTOR = "10344971235874465080";

export default function AdminPage() {
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [creAddress, setCreAddress] = useState<string>("");
  const [receiverAddress, setReceiverAddress] = useState<string>("");
  const [propagateNullifier, setPropagateNullifier] = useState<string>("");
  const [loading, setLoading] = useState<string | null>(null);

  const connectWallet = async () => {
    const ethereum = (window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<string[]> } }).ethereum;
    if (!ethereum) { toast.error("No wallet detected."); return; }
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    setWalletAddress(accounts[0]);
  };

  const getSigner = async () => {
    const ethereum = (window as unknown as { ethereum?: unknown }).ethereum;
    if (!ethereum) throw new Error("No wallet");
    const provider = new ethers.BrowserProvider(ethereum as ethers.Eip1193Provider);
    return provider.getSigner();
  };

  const setWorkflow = async () => {
    if (!creAddress) { toast.error("Enter CRE workflow address."); return; }
    setLoading("workflow");
    try {
      const signer = await getSigner();
      const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signer);
      const tx = await registry.setAuthorizedCREWorkflow(creAddress);
      await tx.wait();
      toast.success("CRE workflow address set!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally {
      setLoading(null);
    }
  };

  const setReceiver = async () => {
    if (!receiverAddress) { toast.error("Enter receiver address."); return; }
    setLoading("receiver");
    try {
      const signer = await getSigner();
      const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signer);
      const tx = await registry.setTargetChainReceiver(BASE_SEPOLIA_CHAIN_SELECTOR, receiverAddress);
      await tx.wait();
      toast.success("Target chain receiver set!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally {
      setLoading(null);
    }
  };

  const propagate = async () => {
    if (!propagateNullifier) { toast.error("Enter nullifier."); return; }
    setLoading("propagate");
    try {
      const signer = await getSigner();
      const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signer);
      // Get CCIP fee estimate
      const fee = ethers.parseEther("0.01");
      const tx = await registry.propagateToChain(
        propagateNullifier,
        BASE_SEPOLIA_CHAIN_SELECTOR,
        { value: fee }
      );
      await tx.wait();
      toast.success("Propagation sent!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <main className="min-h-screen bg-human-900 flex flex-col">
      <nav className="border-b border-human-700 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-white tracking-tight">
          Human<span className="text-[#238636]">Gov</span>
        </Link>
        {walletAddress ? (
          <span className="text-xs text-[#8b949e] font-mono">
            {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
          </span>
        ) : (
          <button
            onClick={connectWallet}
            className="text-sm px-4 py-1.5 bg-human-700 text-white rounded-lg border border-human-700"
          >
            Connect Wallet
          </button>
        )}
      </nav>

      <div className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
        <h1 className="text-3xl font-bold text-white mb-2">Admin Panel</h1>
        <p className="text-[#8b949e] mb-10 text-sm">
          Owner-only contract configuration.
        </p>

        {/* Contract info */}
        <div className="bg-human-800 border border-human-700 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider mb-4">
            Contract Addresses
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#8b949e]">HumanRegistry ({CHAIN_CONFIG.source.name})</span>
              <span className="text-white font-mono text-xs">{REGISTRY_ADDRESS || "not configured"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8b949e]">HumanGovDAO ({CHAIN_CONFIG.target.name})</span>
              <span className="text-white font-mono text-xs">{DAO_ADDRESS || "not configured"}</span>
            </div>
          </div>
        </div>

        {/* Set CRE workflow */}
        <div className="bg-human-800 border border-human-700 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider mb-4">
            Set CRE Workflow Address
          </h2>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="0x..."
              value={creAddress}
              onChange={(e) => setCreAddress(e.target.value)}
              className="flex-1 bg-human-900 border border-human-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[#8b949e] focus:outline-none focus:border-[#388bfd]"
            />
            <button
              onClick={setWorkflow}
              disabled={loading === "workflow"}
              className="px-5 py-2.5 bg-[#388bfd] hover:bg-[#1f6feb] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {loading === "workflow" ? "Setting…" : "Set"}
            </button>
          </div>
        </div>

        {/* Set CCIP receiver */}
        <div className="bg-human-800 border border-human-700 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider mb-2">
            Set Base Sepolia CCIP Receiver
          </h2>
          <p className="text-xs text-[#8b949e] mb-4">
            Chain selector: {BASE_SEPOLIA_CHAIN_SELECTOR}
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="HumanGovDAO address on Base Sepolia (0x...)"
              value={receiverAddress}
              onChange={(e) => setReceiverAddress(e.target.value)}
              className="flex-1 bg-human-900 border border-human-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[#8b949e] focus:outline-none focus:border-[#388bfd]"
            />
            <button
              onClick={setReceiver}
              disabled={loading === "receiver"}
              className="px-5 py-2.5 bg-[#388bfd] hover:bg-[#1f6feb] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {loading === "receiver" ? "Setting…" : "Set"}
            </button>
          </div>
        </div>

        {/* Manual propagation */}
        <div className="bg-human-800 border border-human-700 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider mb-2">
            Manual CCIP Propagation
          </h2>
          <p className="text-xs text-[#8b949e] mb-4">
            Trigger a cross-chain propagation for a specific nullifier hash. Requires ~0.01 ETH for CCIP fees.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Nullifier hash (0x...)"
              value={propagateNullifier}
              onChange={(e) => setPropagateNullifier(e.target.value)}
              className="flex-1 bg-human-900 border border-human-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[#8b949e] focus:outline-none focus:border-[#388bfd]"
            />
            <button
              onClick={propagate}
              disabled={loading === "propagate"}
              className="px-5 py-2.5 bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {loading === "propagate" ? "Sending…" : "Propagate"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
