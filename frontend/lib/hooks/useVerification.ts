"use client";

import { useState, useCallback } from "react";
import { ISuccessResult } from "@worldcoin/idkit";

const CRE_ENDPOINT =
  process.env.NEXT_PUBLIC_CRE_ENDPOINT || "http://localhost:3001/verify";

const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 120_000;

export function useVerification() {
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitProof = useCallback(
    async (proof: ISuccessResult, walletAddress: string) => {
      setVerifying(true);
      setError(null);
      setTxHash(null);

      try {
        // Submit proof to CRE workflow endpoint
        const res = await fetch(CRE_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proof: proof.proof,
            merkle_root: proof.merkle_root,
            nullifier_hash: proof.nullifier_hash,
            verification_level: proof.verification_level,
            wallet_address: walletAddress,
          }),
        });

        if (!res.ok) {
          const body = await res.text();
          throw new Error(`CRE endpoint returned ${res.status}: ${body}`);
        }

        const data = await res.json() as { jobId?: string; txHash?: string };

        // If a txHash is returned immediately, we're done
        if (data.txHash) {
          setTxHash(data.txHash);
          setVerified(true);
          return;
        }

        // Otherwise poll for completion
        const jobId: string | undefined = data.jobId;
        if (!jobId) {
          // No jobId means synchronous success
          setVerified(true);
          return;
        }

        const pollUrl = `${CRE_ENDPOINT}/status/${jobId}`;
        const deadline = Date.now() + POLL_TIMEOUT;

        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL));

          const pollRes = await fetch(pollUrl);
          if (!pollRes.ok) continue;

          const pollData = await pollRes.json() as { status?: string; txHash?: string };

          if (pollData.status === "completed") {
            if (pollData.txHash) setTxHash(pollData.txHash);
            setVerified(true);
            return;
          }

          if (pollData.status === "failed") {
            throw new Error("CRE workflow reported failure.");
          }
        }

        throw new Error("Verification timed out. Please try again.");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e;
      } finally {
        setVerifying(false);
      }
    },
    []
  );

  return { submitProof, verifying, verified, txHash, error };
}
