"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useProposals, Proposal } from "@/lib/hooks/useProposals";
import { useVoting } from "@/lib/hooks/useVoting";
import ProposalCard from "@/components/ProposalCard";
import CreateProposalModal from "@/components/CreateProposalModal";

type Tab = "active" | "passed" | "failed" | "all";

export default function DAOPage() {
  const [tab, setTab] = useState<Tab>("active");
  const [showCreate, setShowCreate] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>("");

  const { proposals, loading, error, refetch } = useProposals();

  const connectWallet = async () => {
    const ethereum = (window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<string[]> } }).ethereum;
    if (!ethereum) {
      toast.error("No wallet detected.");
      return;
    }
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    setWalletAddress(accounts[0]);
    toast.success("Wallet connected!");
  };

  const filtered = proposals.filter((p) => {
    if (tab === "all") return true;
    if (tab === "active") return p.status === 0;
    if (tab === "passed") return p.status === 1;
    if (tab === "failed") return p.status === 2;
    return true;
  });

  const TABS: { key: Tab; label: string }[] = [
    { key: "active", label: "Active" },
    { key: "passed", label: "Passed" },
    { key: "failed", label: "Failed" },
    { key: "all", label: "All" },
  ];

  return (
    <main className="min-h-screen bg-human-900 flex flex-col">
      {/* Nav */}
      <nav className="border-b border-human-700 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-white tracking-tight">
          Human<span className="text-[#238636]">Gov</span>
        </Link>
        <div className="flex items-center gap-4">
          {walletAddress ? (
            <span className="text-xs text-[#8b949e] font-mono">
              {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
            </span>
          ) : (
            <button
              onClick={connectWallet}
              className="text-sm px-4 py-1.5 bg-human-700 hover:bg-human-800 text-white rounded-lg border border-human-700 transition-colors"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </nav>

      <div className="flex-1 px-6 py-10 max-w-4xl mx-auto w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Governance</h1>
            <p className="text-[#8b949e] text-sm">
              One human, one vote — powered by World ID &amp; Chainlink CCIP
            </p>
          </div>
          <button
            onClick={() => {
              if (!walletAddress) {
                toast.error("Connect your wallet first.");
                return;
              }
              setShowCreate(true);
            }}
            className="px-5 py-2.5 bg-[#238636] hover:bg-[#2ea043] text-white text-sm font-semibold rounded-lg transition-colors"
          >
            + Create Proposal
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-human-700">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === key
                  ? "border-[#388bfd] text-white"
                  : "border-transparent text-[#8b949e] hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-20 text-[#8b949e]">
            Loading proposals…
          </div>
        ) : error ? (
          <div className="text-center py-20 text-red-400">
            Failed to load proposals.{" "}
            <button onClick={refetch} className="underline">
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-[#8b949e]">
            No {tab === "all" ? "" : tab} proposals yet.
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                walletAddress={walletAddress}
                onVoted={refetch}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateProposalModal
          walletAddress={walletAddress}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            refetch();
          }}
        />
      )}
    </main>
  );
}
