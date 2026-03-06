"use client";

interface VoteBarProps {
  yesVotes: number;
  noVotes: number;
}

export default function VoteBar({ yesVotes, noVotes }: VoteBarProps) {
  const total = yesVotes + noVotes;
  const yesPct = total > 0 ? Math.round((yesVotes / total) * 100) : 0;
  const noPct = total > 0 ? 100 - yesPct : 0;

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5 text-[#8b949e]">
        <span>
          <span className="text-[#238636] font-semibold">YES</span> {yesVotes} ({yesPct}%)
        </span>
        <span>
          <span className="text-red-400 font-semibold">NO</span> {noVotes} ({noPct}%)
        </span>
      </div>
      <div className="h-1.5 bg-human-700 rounded-full overflow-hidden flex">
        {total > 0 ? (
          <>
            <div
              className="h-full bg-[#238636] transition-all duration-500"
              style={{ width: `${yesPct}%` }}
            />
            <div
              className="h-full bg-red-400 transition-all duration-500"
              style={{ width: `${noPct}%` }}
            />
          </>
        ) : (
          <div className="h-full w-full bg-human-700" />
        )}
      </div>
    </div>
  );
}
