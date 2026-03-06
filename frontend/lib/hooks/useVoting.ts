"use client";

import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { DAO_ABI, DAO_ADDRESS } from "@/lib/contracts";

export function useVoting() {
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getSigner = useCallback(async () => {
    const ethereum = (window as unknown as { ethereum?: unknown }).ethereum;
    if (!ethereum) throw new Error("No wallet detected.");
    const provider = new ethers.BrowserProvider(
      ethereum as ethers.Eip1193Provider
    );
    return provider.getSigner();
  }, []);

  const vote = useCallback(
    async (proposalId: number, support: boolean) => {
      setLoading(true);
      setError(null);
      setTxHash(null);
      try {
        const signer = await getSigner();
        const dao = new ethers.Contract(DAO_ADDRESS, DAO_ABI, signer);
        const tx = await dao.vote(proposalId, support);
        await tx.wait();
        setTxHash(tx.hash);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [getSigner]
  );

  const finalizeProposal = useCallback(
    async (proposalId: number) => {
      setLoading(true);
      setError(null);
      setTxHash(null);
      try {
        const signer = await getSigner();
        const dao = new ethers.Contract(DAO_ADDRESS, DAO_ABI, signer);
        const tx = await dao.finalizeProposal(proposalId);
        await tx.wait();
        setTxHash(tx.hash);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [getSigner]
  );

  return { vote, finalizeProposal, loading, txHash, error };
}
