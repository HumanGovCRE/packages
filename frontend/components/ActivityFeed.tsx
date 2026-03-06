"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { DAO_ABI, DAO_ADDRESS } from "@/lib/contracts";

interface FeedEvent {
  id: string;
  type: "vote" | "proposal" | "human";
  text: string;
  time: Date;
}

const BASE_SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

function truncateNullifier(n: string) {
  return `${n.slice(0, 10)}…${n.slice(-6)}`;
}

export default function ActivityFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!DAO_ADDRESS) return;

    let provider: ethers.JsonRpcProvider;
    let dao: ethers.Contract;

    const setup = async () => {
      try {
        provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
        dao = new ethers.Contract(DAO_ADDRESS, DAO_ABI, provider);

        const addEvent = (ev: FeedEvent) =>
          setEvents((prev) => [ev, ...prev].slice(0, 20));

        dao.on(
          "Voted",
          (proposalId: bigint, nullifier: string, support: boolean) => {
            addEvent({
              id: `${proposalId}-${nullifier}-${Date.now()}`,
              type: "vote",
              text: `${truncateNullifier(nullifier)} voted ${support ? "YES" : "NO"} on proposal #${proposalId}`,
              time: new Date(),
            });
          }
        );

        dao.on("ProposalCreated", (proposalId: bigint, title: string) => {
          addEvent({
            id: `prop-${proposalId}-${Date.now()}`,
            type: "proposal",
            text: `New proposal #${proposalId}: "${title}"`,
            time: new Date(),
          });
        });

        dao.on("HumanStatusReceived", (nullifier: string) => {
          addEvent({
            id: `human-${nullifier}-${Date.now()}`,
            type: "human",
            text: `Human ${truncateNullifier(nullifier)} verified via CCIP`,
            time: new Date(),
          });
        });

        setConnected(true);
      } catch {
        setConnected(false);
      }
    };

    setup();

    return () => {
      try {
        dao?.removeAllListeners();
      } catch {
        // ignore
      }
    };
  }, []);

  const TYPE_COLORS: Record<string, string> = {
    vote: "text-[#238636]",
    proposal: "text-[#388bfd]",
    human: "text-[#8b949e]",
  };

  return (
    <div className="bg-human-800 border border-human-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[#8b949e] uppercase tracking-wider">
          Live Activity
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-[#8b949e]">
          <span
            className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-[#238636] animate-pulse" : "bg-red-400"}`}
          />
          {connected ? "Live" : "Disconnected"}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-8 text-[#8b949e] text-sm">
          Listening for on-chain events…
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => (
            <div key={ev.id} className="flex items-start gap-3 text-sm">
              <span className="text-[#8b949e] text-xs shrink-0 mt-0.5">
                {ev.time.toLocaleTimeString()}
              </span>
              <span className={TYPE_COLORS[ev.type]}>{ev.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
