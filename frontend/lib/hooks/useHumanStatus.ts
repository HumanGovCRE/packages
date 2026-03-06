"use client";

import useSWR from "swr";
import { ethers } from "ethers";
import { REGISTRY_ABI, REGISTRY_ADDRESS, DAO_ABI, DAO_ADDRESS } from "@/lib/contracts";

const SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || "https://rpc.sepolia.org";
const BASE_SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

interface HumanStatus {
  isHumanOnSepolia: boolean;
  isHumanOnBase: boolean;
  expiry: number | null;
  loading: boolean;
  error: unknown;
}

async function fetchHumanStatus(wallet: string): Promise<{
  isHumanOnSepolia: boolean;
  isHumanOnBase: boolean;
  expiry: number | null;
}> {
  const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const baseProvider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);

  const [sepoliaResult, baseResult] = await Promise.allSettled([
    (async () => {
      if (!REGISTRY_ADDRESS) return { isHuman: false, expiry: null };
      const registry = new ethers.Contract(
        REGISTRY_ADDRESS,
        REGISTRY_ABI,
        sepoliaProvider
      );
      const isHuman: boolean = await registry.isHuman(wallet);
      if (!isHuman) return { isHuman: false, expiry: null };
      const record = await registry.getVerification(wallet);
      return { isHuman: true, expiry: Number(record.expiry) };
    })(),
    (async () => {
      if (!DAO_ADDRESS) return { isHuman: false, expiry: null };
      const dao = new ethers.Contract(DAO_ADDRESS, DAO_ABI, baseProvider);
      const [verified, expiry]: [boolean, bigint] = await dao.getHumanStatus(wallet);
      return { isHuman: verified, expiry: verified ? Number(expiry) : null };
    })(),
  ]);

  const sepolia = sepoliaResult.status === "fulfilled" ? sepoliaResult.value : { isHuman: false, expiry: null };
  const base = baseResult.status === "fulfilled" ? baseResult.value : { isHuman: false, expiry: null };

  return {
    isHumanOnSepolia: sepolia.isHuman,
    isHumanOnBase: base.isHuman,
    expiry: sepolia.expiry ?? base.expiry,
  };
}

export function useHumanStatus(wallet: string): HumanStatus {
  const { data, error, isLoading } = useSWR(
    wallet ? `human-status-${wallet}` : null,
    () => fetchHumanStatus(wallet),
    { refreshInterval: 30_000 }
  );

  return {
    isHumanOnSepolia: data?.isHumanOnSepolia ?? false,
    isHumanOnBase: data?.isHumanOnBase ?? false,
    expiry: data?.expiry ?? null,
    loading: isLoading,
    error,
  };
}
