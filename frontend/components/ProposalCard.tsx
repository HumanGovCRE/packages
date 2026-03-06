"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Proposal } from "@/lib/hooks/useProposals";
import { useVoting } from "@/lib/hooks/useVoting";
import toast from "react-hot-toast";
import VoteBar from "@/components/VoteBar";

const STATUS_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: "Active", color: "text-[#388bfd] bg-[#388bfd]/10 border-[#388bfd]/30" },
  1: { label: "Passed", color: "text-[#238636] bg-[#238636]/10 border-[#238636]/30" },
  2: { label: "Failed", color: "text-red-400 bg-red-400/10 border-red-400/30" },
  3: { label: "Executed", color: "text-[#8b949e] bg-human-700 border-human-700" },
};

interface ProposalCardProps {
  proposal: Proposal;
  walletAddress: string;
  onVoted: () => void;
}

export default function ProposalCard({
  proposal,
  walletAddress,
  onVoted,
}: ProposalCardProps) {
  const { vote, loading } = useVoting();

  const statusInfo = STATUS_LABELS[proposal.status] ?? STATUS_LABELS[0];
  const endTime = new Date(Number(proposal.endTime) * 1000);
  const isEnded = Date.now() > endTime.getTime();
  const isActive = proposal.status === 0;

  const handleVote = async (support: boolean, e: React.MouseEvent) => {
    e.preventDefault();
    if (!walletAddress) {
      toast.error("Connect your wallet first.");
      return;
    }
    toast.loading("Submitting vote…", { id: "vote" });
    try {
      await vote(proposal.id, support);
      toast.success(`Vote ${support ? "YES" : "NO"} submitted!`, { id: "vote" });
      onVoted();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Vote failed.",
        { id: "vote" }
      );
    }
  };

  return (
    <Link
      href={`/dao/${proposal.id}`}
      className="block bg-human-800 border border-human-700 rounded-xl p-6 hover:border-[#388bfd]/50 transition-colors group"
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <h3 className="text-white font-semibold group-hover:text-[#388bfd] transition-colors line-clamp-2">
          {proposal.title}
        </h3>
        <span
          className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusInfo.color}`}
        >
          {statusInfo.label}
        </span>
      </div>

      <p className="text-[#8b949e] text-sm mb-4 line-clamp-2">
        {proposal.description}
      </p>

      <VoteBar yesVotes={proposal.yesVotes} noVotes={proposal.noVotes} />

      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-[#8b949e]">
          {isEnded
            ? `Ended ${formatDistanceToNow(endTime)} ago`
            : `Ends in ${formatDistanceToNow(endTime)}`}
        </span>

        {isActive && !isEnded && (
          <div className="flex gap-2" onClick={(e) => e.preventDefault()}>
            <button
              onClick={(e) => handleVote(true, e)}
              disabled={loading || !walletAddress}
              className="px-3 py-1 text-xs bg-[#238636]/20 hover:bg-[#238636]/40 text-[#238636] font-semibold rounded-md border border-[#238636]/30 transition-colors disabled:opacity-40"
            >
              YES
            </button>
            <button
              onClick={(e) => handleVote(false, e)}
              disabled={loading || !walletAddress}
              className="px-3 py-1 text-xs bg-red-400/10 hover:bg-red-400/20 text-red-400 font-semibold rounded-md border border-red-400/30 transition-colors disabled:opacity-40"
            >
              NO
            </button>
          </div>
        )}
      </div>
    </Link>
  );
}
