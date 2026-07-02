import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./LandingPage.css";
import { fetchStatus, fetchSummary, type Status, type Summary } from "./api";
import { AnimatedNumber } from "./AnimatedNumber";
import { HeroOrb } from "./HeroOrb";

const HOW_IT_WORKS = [
  {
    title: "Sealed balances",
    desc: "Each agent draws from a shielded Poseidon commitment, not a visible running balance. Only the proof knows the real amount.",
    icon: <ShieldLockIcon />,
  },
  {
    title: "ZK policy enforcement",
    desc: "A Noir/UltraHonk proof must verify on Stellar before any payment settles. Over-cap or wrong vendor means no valid proof — math stops it, not code.",
    icon: <CheckIcon />,
  },
  {
    title: "On-demand attestation",
    desc: "Generate a shareable proof of aggregate compliance at any time — without revealing individual transactions.",
    icon: <FileCertificateIcon />,
  },
];

const BUILT_ON = [
  { label: "Stellar Protocol 26 (CAP-80)", href: "https://stellar.org/blog/foundation-news/yardstick-stellar-protocol-26" },
  { label: "Noir / UltraHonk", href: "https://noir-lang.org/docs/" },
  { label: "Poseidon2", href: "https://developers.stellar.org/docs/build/apps/zk" },
  { label: "x402 / MPP", href: "https://developers.stellar.org/docs/build/agentic-payments/x402" },
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
      <div className="hero-block">
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
          <div className="hero-grid">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="live-dot" />
                {status?.ready ? "Live on Stellar Testnet" : "Connecting to orchestrator…"}
                {status?.contractId && <span className="eyebrow-dim">· {status.contractId.slice(0, 10)}…</span>}
              </div>
              <h1>Your agents pay in the open. What they spent stays between you and the proof.</h1>
              <p className="hero-sub">
                Aegis is a confidential spending layer for AI agent payments on Stellar. Every payment
                is policy-checked by a real zero-knowledge proof before it settles.
              </p>
              <div className="hero-ctas">
                <Link className="primary large" to="/console">
                  Open treasury console
                </Link>
                <Link className="ghost large" to="/feed">
                  Watch the live feed
                </Link>
              </div>

              <div className="hero-facts">
                <div className="hero-fact">
                  <span className="live-dot" />
                  Real UltraHonk proofs
                </div>
                <div className="hero-fact">No plaintext amounts, ever</div>
                <div className="hero-fact">Stellar Protocol 26 (CAP-80)</div>
              </div>

              <div className="stat-row">
                <div className="stat">
                  <div className="stat-value stat-value-ok">
                    {stats ? <AnimatedNumber value={stats.settled} /> : "—"}
                  </div>
                  <div className="stat-label">payments settled</div>
                </div>
                <div className="stat">
                  <div className="stat-value stat-value-warn">
                    {stats ? <AnimatedNumber value={stats.rejected} /> : "—"}
                  </div>
                  <div className="stat-label">violations blocked</div>
                </div>
                <div className="stat">
                  <div className="stat-value stat-value-ok">
                    {stats ? <AnimatedNumber value={stats.violationsReachedSettlement} /> : "0"}
                  </div>
                  <div className="stat-label">violations reached settlement</div>
                </div>
              </div>
            </div>

            <div className="hero-visual">
              <div className="hero-visual-glow" />
              <div className="hero-visual-orb">
                <HeroOrb />
              </div>
              <div className="hero-visual-caption mono">shielded balance commitment</div>
              <span className="hero-float hero-float-1" />
              <span className="hero-float hero-float-2" />
              <span className="hero-float hero-float-3" />
            </div>
          </div>
        </header>
      </div>

      <section className="features" id="how-it-works">
        <h2 className="section-title">How it works</h2>
        <div className="feature-grid">
          {HOW_IT_WORKS.map((f) => (
            <div key={f.title} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
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

function ShieldLockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <rect x="9.2" y="11.5" width="5.6" height="4.5" rx="1" />
      <path d="M10.3 11.5v-1.6a1.7 1.7 0 0 1 3.4 0v1.6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.3l2.6 2.6L16.2 9" />
    </svg>
  );
}

function FileCertificateIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3.5h7l4 4V16a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 16V5A1.5 1.5 0 0 1 7 3.5z" />
      <path d="M14 3.5V8h4" />
      <circle cx="10.5" cy="14.2" r="2.3" />
      <path d="M9.2 16.2l-.6 3.3 1.9-1 1.9 1-.6-3.3" />
    </svg>
  );
}
