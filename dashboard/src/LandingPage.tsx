import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./LandingPage.css";
import { fetchStatus, fetchSummary, type Status, type Summary } from "./api";

const HOW_IT_WORKS = [
  {
    title: "Sealed balances",
    desc: "Each agent draws from a shielded commitment, not a visible running balance. Only the proof knows the amount.",
  },
  {
    title: "ZK policy enforcement",
    desc: "A Noir/UltraHonk proof must verify on-chain before any payment settles. Over-cap or wrong vendor = no valid proof = no payment.",
  },
  {
    title: "On-demand attestation",
    desc: "At any time, generate a shareable proof that your fleet's aggregate spend obeyed policy — without revealing individual transactions.",
  },
];

const BUILT_ON = [
  { label: "Stellar Protocol 26 (CAP-80)", href: "https://stellar.org/blog/foundation-news/yardstick-stellar-protocol-26" },
  { label: "Noir/UltraHonk", href: "https://noir-lang.org/docs/" },
  { label: "Poseidon2", href: "https://developers.stellar.org/docs/build/apps/zk" },
  { label: "x402/MPP agent payments", href: "https://developers.stellar.org/docs/build/agentic-payments/x402" },
];

export function LandingPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [stats, setStats] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStatus()
      .then((s) => !cancelled && setStatus(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Single live-updating element above the fold: the stat row, polled every
  // 5s from the orchestrator's real /api/summary -- everything else on this
  // page is static copy.
  useEffect(() => {
    let cancelled = false;
    const poll = () => fetchSummary().then((s) => !cancelled && setStats(s)).catch(() => {});
    poll();
    const timer = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const explorerUrl = status?.contractId
    ? `https://stellar.expert/explorer/testnet/contract/${status.contractId}`
    : null;

  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="brand-link">
          <div className="brand-mark">A</div>
          <span className="brand">AEGIS</span>
        </div>
        <div className="landing-nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#built-on">Built on</a>
          {explorerUrl && (
            <a href={explorerUrl} target="_blank" rel="noreferrer">
              Contract ↗
            </a>
          )}
        </div>
        <Link className="primary" to="/console">
          Open treasury console →
        </Link>
      </nav>

      <header className="hero">
        <div className="eyebrow">
          <span className="live-dot" />
          {status?.ready ? "Live on Stellar Testnet" : "Connecting to orchestrator…"}
          {status?.contractId && <span className="eyebrow-dim">· {status.contractId.slice(0, 10)}…</span>}
        </div>
        <h1>Your agents pay in the open. What they spent stays between you and the proof.</h1>
        <p className="hero-sub">
          Aegis is a confidential spending layer for AI agent payments on Stellar. Every payment is
          policy-checked by a zero-knowledge proof before it settles. Compliance can be proven on
          demand — without opening the ledger.
        </p>
        <div className="hero-ctas">
          <Link className="primary large" to="/console">
            Open treasury console
          </Link>
          <Link className="ghost large" to="/feed">
            Watch the live feed
          </Link>
        </div>

        <div className="stat-row">
          <div className="stat">
            <div className="stat-value">{stats ? stats.settled : "—"}</div>
            <div className="stat-label">payments settled</div>
          </div>
          <div className="stat">
            <div className="stat-value">{stats ? stats.rejected : "—"}</div>
            <div className="stat-label">policy violations blocked</div>
          </div>
          <div className="stat">
            <div className="stat-value">{stats ? stats.violationsReachedSettlement : "0"}</div>
            <div className="stat-label">violations reached settlement</div>
          </div>
        </div>
      </header>

      <section className="features" id="how-it-works">
        <h2 className="section-title">How it works</h2>
        <div className="feature-grid">
          {HOW_IT_WORKS.map((f) => (
            <div key={f.title} className="feature-card">
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="built-on" id="built-on">
        <div className="built-on-inner">
          {BUILT_ON.map((b, i) => (
            <span key={b.label}>
              <a className="built-on-badge mono" href={b.href} target="_blank" rel="noreferrer">
                {b.label}
              </a>
              {i < BUILT_ON.length - 1 && <span className="built-on-sep">·</span>}
            </span>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <span>Aegis — confidential spend rails for AI agent payments on Stellar.</span>
        <span className="mono">Built on Noir · UltraHonk · Soroban</span>
      </footer>
    </div>
  );
}
