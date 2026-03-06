"use client";

interface HumanBadgeProps {
  verified: boolean;
  expiry?: number | null;
  size?: "sm" | "md";
}

export default function HumanBadge({
  verified,
  expiry,
  size = "md",
}: HumanBadgeProps) {
  const expiryStr =
    expiry ? new Date(expiry * 1000).toLocaleDateString() : null;

  const sizeClass = size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-3 py-1";

  if (verified) {
    return (
      <span
        title={expiryStr ? `Verified until ${expiryStr}` : "Verified human"}
        className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${sizeClass} text-[#238636] bg-[#238636]/10 border-[#238636]/30`}
      >
        ✓ Verified Human
      </span>
    );
  }

  return (
    <span
      title="Not a verified human"
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${sizeClass} text-red-400 bg-red-400/10 border-red-400/30`}
    >
      ✗ Not Verified
    </span>
  );
}
