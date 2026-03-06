import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-human-900 flex flex-col">
      {/* Nav */}
      <nav className="border-b border-human-700 px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-bold text-white tracking-tight">
          Human<span className="text-[#238636]">Gov</span>
        </span>
        <div className="flex gap-4 text-sm text-[#8b949e]">
          <Link href="/verify" className="hover:text-white transition-colors">
            Verify
          </Link>
          <Link href="/dao" className="hover:text-white transition-colors">
            DAO
          </Link>
          <Link href="/admin" className="hover:text-white transition-colors">
            Admin
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        {/* Orb */}
        <div className="w-24 h-24 rounded-full bg-[#1f6feb] orb-glow mb-8 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-[#388bfd] flex items-center justify-center">
            <span className="text-3xl">🌐</span>
          </div>
        </div>

        <h1 className="text-6xl font-extrabold text-white mb-4 tracking-tight">
          Human<span className="text-[#238636]">Gov</span>
        </h1>

        <p className="text-xl text-[#8b949e] mb-12 max-w-md">
          One Human. One Vote. Any Chain.
        </p>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12 w-full max-w-2xl">
          <div className="bg-human-800 border border-human-700 rounded-xl p-6 text-center">
            <div className="text-3xl font-bold text-[#238636] mb-1">—</div>
            <div className="text-sm text-[#8b949e]">Verified Humans</div>
          </div>
          <div className="bg-human-800 border border-human-700 rounded-xl p-6 text-center">
            <div className="text-3xl font-bold text-[#388bfd] mb-1">—</div>
            <div className="text-sm text-[#8b949e]">Active Proposals</div>
          </div>
          <div className="bg-human-800 border border-human-700 rounded-xl p-6 text-center">
            <div className="text-3xl font-bold text-white mb-1">3</div>
            <div className="text-sm text-[#8b949e]">Chains Supported</div>
          </div>
        </div>

        {/* CTA buttons */}
        <div className="flex gap-4 mb-16">
          <Link
            href="/verify"
            className="px-8 py-3 bg-[#238636] hover:bg-[#2ea043] text-white font-semibold rounded-lg transition-colors verified-glow"
          >
            Get Verified
          </Link>
          <Link
            href="/dao"
            className="px-8 py-3 bg-human-700 hover:bg-human-800 text-white font-semibold rounded-lg border border-human-700 transition-colors"
          >
            View DAO
          </Link>
        </div>

        {/* Tech badges */}
        <div className="flex flex-wrap gap-3 justify-center">
          {[
            { label: "World ID", color: "text-[#388bfd] border-[#388bfd]/30 bg-[#388bfd]/10" },
            { label: "Chainlink CRE", color: "text-[#375bd2] border-[#375bd2]/30 bg-[#375bd2]/10" },
            { label: "CCIP", color: "text-[#375bd2] border-[#375bd2]/30 bg-[#375bd2]/10" },
          ].map(({ label, color }) => (
            <span
              key={label}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold border ${color}`}
            >
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-human-700 px-6 py-6 text-center text-sm text-[#8b949e]">
        HumanGov — Sybil-resistant governance powered by World ID &amp; Chainlink
      </footer>
    </main>
  );
}
