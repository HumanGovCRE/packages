"use client";

import useSWR from "swr";
import { ethers } from "ethers";
import { DAO_ABI, DAO_ADDRESS } from "@/lib/contracts";

const BASE_SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

export interface Proposal {
  id: number;
  title: string;
  description: string;
  proposer: string;
  startTime: bigint;
  endTime: bigint;
  yesVotes: number;
  noVotes: number;
  executed: boolean;
  status: number; // 0=ACTIVE, 1=PASSED, 2=FAILED, 3=EXECUTED
}

async function fetchProposals(): Promise<Proposal[]> {
  if (!DAO_ADDRESS) return [];
  const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
  const dao = new ethers.Contract(DAO_ADDRESS, DAO_ABI, provider);

  const count: bigint = await dao.proposalCount();
  const proposals: Proposal[] = [];

  for (let i = 0; i < Number(count); i++) {
    try {
      const p = await dao.getProposal(i);
      proposals.push({
        id: Number(p.id),
        title: p.title,
        description: p.description,
        proposer: p.proposer,
        startTime: p.startTime,
        endTime: p.endTime,
        yesVotes: Number(p.yesVotes),
        noVotes: Number(p.noVotes),
        executed: p.executed,
        status: Number(p.status),
      });
    } catch {
      // skip
    }
  }

  return proposals;
}

export function useProposals() {
  const { data, error, isLoading, mutate } = useSWR(
    "proposals",
    fetchProposals,
    { refreshInterval: 15_000 }
  );

  return {
    proposals: data ?? [],
    loading: isLoading,
    error,
    refetch: () => mutate(),
  };
}

export function useProposalDetail(id: number) {
  const { proposals, loading, error, refetch } = useProposals();
  const proposal = proposals.find((p) => p.id === id) ?? null;
  return { proposal, loading, error, refetch };
}
