"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useProposalDetail } from "@/lib/hooks/useProposals";
import { useVoting } from "@/lib/hooks/useVoting";
import toast from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";

const STATUS_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: "Active", color: "text-[#388bfd] bg-[#388bfd]/10 border-[#388bfd]/30" },
  1: { label: "Passed", color: "text-[#238636] bg-[#238636]/10 border-[#238636]/30" },
  2: { label: "Failed", color: "text-red-400 bg-red-400/10 border-red-400/30" },
  3: { label: "Executed", color: "text-[#8b949e] bg-human-700 border-human-700" },
};

export default function ProposalDetailPage() {
  const params = useParams();
  const id = Number(params?.id ?? 0);
  const [walletAddress, setWalletAddress] = useState<string>("");

  const { proposal, loading, error, refetch } = useProposalDetail(id);
  const { vote, finalizeProposal, loading: voting, txHash } = useVoting();

  const connectWallet = async () => {
    const ethereum = (window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<string[]> } }).ethereum;
    if (!ethereum) { toast.error("No wallet detected."); return; }
    const accounts = await ethereum.request({ method: "eth_requestAccounts" });
    setWalletAddress(accounts[0]);
  };

  const handleVote = async (support: boolean) => {
    if (!walletAddress) { toast.error("Connect your wallet first."); return; }
    toast.loading("Submitting vote…", { id: "vote" });
    try {
      await vote(id, support);
      toast.success(`Vote ${support ? "YES" : "NO"} submitted!`, { id: "vote" });
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Vote failed.", { id: "vote" });
    }
  };

  const handleFinalize = async () => {
    if (!walletAddress) { toast.error("Connect your wallet first."); return; }
    toast.loading("Finalizing proposal…", { id: "finalize" });
    try {
      await finalizeProposal(id);
      toast.success("Proposal finalized!", { id: "finalize" });
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Finalize failed.", { id: "finalize" });
    }
  };

  if (loading) {
    return (
      <PageShell>
        <div className="text-center py-20 text-[#8b949e]">Loading proposal…</div>
      </PageShell>
    );
  }

  if (error || !proposal) {
    return (
      <PageShell>
        <div className="text-center py-20 text-red-400">
          Proposal not found.{" "}
          <Link href="/dao" className="underline">Back to DAO</Link>
        </div>
      </PageShell>
    );
  }

  const total = proposal.yesVotes + proposal.noVotes;
  const yesPct = total > 0 ? Math.round((proposal.yesVotes / total) * 100) : 0;
  const noPct = total > 0 ? 100 - yesPct : 0;
  const isActive = proposal.status === 0;
  const endTime = new Date(Number(proposal.endTime) * 1000);
  const isEnded = Date.now() > endTime.getTime();
  const statusInfo = STATUS_LABELS[proposal.status] ?? STATUS_LABELS[0];

  // Donut chart SVG
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  const yesDash = (yesPct / 100) * circ;

  return (
    <PageShell walletAddress={walletAddress} onConnect={connectWallet}>
      <div className="max-w-3xl mx-auto w-full px-6 py-10">
        <Link href="/dao" className="text-sm text-[#8b949e] hover:text-white mb-6 inline-block">
          ← Back to DAO
        </Link>

        <div className="flex items-start justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold text-white">{proposal.title}</h1>
          <span className={`shrink-0 text-xs font-semibold px-3 py-1 rounded-full border ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>

        <p className="text-[#8b949e] mb-8 leading-relaxed">{proposal.description}</p>

        {/* Vote visualization */}
        <div className="bg-human-800 border border-human-700 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider mb-6">
            Vote Results
          </h2>
          <div className="flex items-center gap-8">
            {/* Donut */}
            <svg width="100" height="100" viewBox="0 0 100 100" className="shrink-0">
              <circle cx="50" cy="50" r={radius} fill="none" stroke="#21262d" strokeWidth="12" />
              {total > 0 && (
                <circle
                  cx="50" cy="50" r={radius}
                  fill="none"
                  stroke="#238636"
                  strokeWidth="12"
                  strokeDasharray={`${yesDash} ${circ}`}
                  strokeDashoffset={circ / 4}
                  strokeLinecap="round"
                />
              )}
              {total > 0 && noPct > 0 && (
                <circle
                  cx="50" cy="50" r={radius}
                  fill="none"
                  stroke="#f85149"
                  strokeWidth="12"
                  strokeDasharray={`${circ - yesDash} ${circ}`}
                  strokeDashoffset={circ / 4 - yesDash}
                  strokeLinecap="round"
                />
              )}
              <text x="50" y="54" textAnchor="middle" className="text-xs" fontSize="14" fill="#e6edf3" fontWeight="bold">
                {total === 0 ? "0" : `${yesPct}%`}
              </text>
            </svg>

            <div className="flex-1 space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-[#238636] font-semibold">YES</span>
                  <span className="text-[#8b949e]">{proposal.yesVotes} votes ({yesPct}%)</span>
                </div>
                <div className="h-2 bg-human-700 rounded-full overflow-hidden">
                  <div className="h-full bg-[#238636] rounded-full transition-all" style={{ width: `${yesPct}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-red-400 font-semibold">NO</span>
                  <span className="text-[#8b949e]">{proposal.noVotes} votes ({noPct}%)</span>
                </div>
                <div className="h-2 bg-human-700 rounded-full overflow-hidden">
                  <div className="h-full bg-red-400 rounded-full transition-all" style={{ width: `${noPct}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Meta */}
        <div className="bg-human-800 border border-human-700 rounded-xl p-6 mb-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[#8b949e] mb-1">Proposer</div>
            <div className="text-white font-mono text-xs">
              {proposal.proposer.slice(0, 8)}…{proposal.proposer.slice(-6)}
            </div>
          </div>
          <div>
            <div className="text-[#8b949e] mb-1">Voting {isEnded ? "ended" : "ends"}</div>
            <div className="text-white">
              {isEnded
                ? `${formatDistanceToNow(endTime)} ago`
                : `in ${formatDistanceToNow(endTime)}`}
            </div>
          </div>
        </div>

        {/* Vote section */}
        {isActive && !isEnded && (
          <div className="bg-human-800 border border-human-700 rounded-xl p-6 mb-6">
            <h2 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider mb-4">
              Cast Your Vote
            </h2>
            <p className="text-xs text-[#8b949e] mb-4">
              Your vote is tied to your World ID nullifier — one human, one vote.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => handleVote(true)}
                disabled={voting || !walletAddress}
                className="flex-1 py-3 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                ✓ YES
              </button>
              <button
                onClick={() => handleVote(false)}
                disabled={voting || !walletAddress}
                className="flex-1 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold rounded-lg border border-red-500/30 transition-colors disabled:opacity-50"
              >
                ✗ NO
              </button>
            </div>
            {!walletAddress && (
              <button
                onClick={connectWallet}
                className="w-full mt-3 py-2.5 text-sm text-[#8b949e] hover:text-white border border-human-700 rounded-lg transition-colors"
              >
                Connect Wallet to Vote
              </button>
            )}
          </div>
        )}

        {/* Finalize section */}
        {isActive && isEnded && (
          <div className="bg-human-800 border border-human-700 rounded-xl p-6 mb-6">
            <h2 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider mb-4">
              Finalize Proposal
            </h2>
            <p className="text-xs text-[#8b949e] mb-4">
              The voting period has ended. Anyone can finalize the result.
            </p>
            <button
              onClick={handleFinalize}
              disabled={voting || !walletAddress}
              className="w-full py-3 bg-[#388bfd] hover:bg-[#1f6feb] text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              Finalize Proposal
            </button>
          </div>
        )}

        {txHash && (
          <p className="text-xs text-[#8b949e] font-mono break-all mt-2">
            Tx: {txHash}
          </p>
        )}
      </div>
    </PageShell>
  );
}

function PageShell({
  children,
  walletAddress,
  onConnect,
}: {
  children: React.ReactNode;
  walletAddress?: string;
  onConnect?: () => void;
}) {
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
        ) : onConnect ? (
          <button
            onClick={onConnect}
            className="text-sm px-4 py-1.5 bg-human-700 text-white rounded-lg border border-human-700"
          >
            Connect Wallet
          </button>
        ) : null}
      </nav>
      <div className="flex-1">{children}</div>
    </main>
  );
}
