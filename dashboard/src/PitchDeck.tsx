import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import "./PitchDeck.css";
import { fetchPolicy, fetchStatus, fetchSummary, type Policy, type Status, type Summary } from "./api";

/**
 * In-app pitch deck ("PPT") for presenting the project to judges without
 * leaving the dashboard. Navigate with ← → / Space / click. Every number on
 * the "Live right now" slide is fetched from the real orchestrator at
 * present-time — if the orchestrator is down, that slide says so instead of
 * showing stale or invented figures.
 */

function useLiveData() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [s, p, st] = await Promise.all([fetchSummary(), fetchPolicy(), fetchStatus()]);
        if (cancelled) return;
        setSummary(s);
        setPolicy(p);
        setStatus(st);
        setError(null);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    load();
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { summary, policy, status, error };
}

function Arrow({ label, down = false }: { label?: string; down?: boolean }) {
  return (
    <div className={`diag-arrow ${down ? "down" : ""}`}>
      <span className="diag-arrow-head">{down ? "↓" : "→"}</span>
      {label && <span className="diag-arrow-label">{label}</span>}
    </div>
  );
}

export function PitchDeck() {
  const { summary, policy, status, error } = useLiveData();
  const [slide, setSlide] = useState(0);

  const slides: { key: string; body: ReactNode }[] = [
    {
      key: "title",
      body: (
        <div className="slide-center">
          <div className="deck-brand-mark">A</div>
          <h1 className="deck-title">AEGIS</h1>
          <p className="deck-subtitle">
            Confidential, provably-compliant treasury rails for AI agent payments on Stellar
          </p>
          <p className="deck-context">Stellar Hacks: Real-World ZK · built on Testnet, live now</p>
          {status?.contractId && (
            <div className="mono deck-contract">
              contract: {status.contractId}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "problem",
      body: (
        <>
          <h2>The problem — two gaps, one cause</h2>
          <p className="deck-lede">
            AI agents on Stellar already pay for APIs, data, and compute by themselves (x402 / MPP — live
            infrastructure, not a concept). But every one of those payments lands on a public ledger.
          </p>
          <div className="deck-cols">
            <div className="deck-card">
              <h3>1 · Everyone sees your spend graph</h3>
              <p>
                Who each agent paid, how much, how often — visible to any competitor watching the chain. Budgets
                and vendor relationships leak by default.
              </p>
            </div>
            <div className="deck-card">
              <h3>2 · Controls can't be proven</h3>
              <p>
                Caps and allow-lists are just contract code. Nobody can <em>prove</em> the fleet actually stayed
                compliant without handing an auditor the entire ledger.
              </p>
            </div>
          </div>
        </>
      ),
    },
    {
      key: "insight",
      body: (
        <>
          <h2>The fix: make the proof the gatekeeper</h2>
          <ul className="deck-bullets">
            <li>
              <strong>Hide the balances.</strong> Each agent spends from a shielded commitment — no plaintext
              amounts on-chain, ever.
            </li>
            <li>
              <strong>Gate every spend with a real ZK proof.</strong> Cap, vendor allow-list, and sufficient
              balance are checked by the proof — verified on-chain <em>before</em> settlement.
            </li>
            <li>
              <strong>Violations can't even be attempted.</strong> A non-compliant payment has no valid proof —
              the math refuses, not an app-level "if".
            </li>
            <li>
              <strong>Auditors get one small proof, not the ledger.</strong> "Spend stayed under $X, zero
              off-list vendors" — without revealing a single transaction.
            </li>
          </ul>
        </>
      ),
    },
    {
      key: "architecture",
      body: (
        <>
          <h2>Architecture</h2>
          <div className="arch-diagram">
            <div className="arch-row">
              <div className="diag-node">
                <div className="diag-node-title">AI agents</div>
                <div className="diag-node-sub">want to pay for APIs, data, compute</div>
              </div>
              <Arrow label="agent · vendor · amount" />
              <div className="diag-node accent">
                <div className="diag-node-title">Orchestrator</div>
                <div className="diag-node-sub mono">nargo execute + bb prove</div>
                <div className="diag-node-sub">builds the real ZK proof — or fails right here</div>
              </div>
              <Arrow label="14.5 KB UltraHonk proof" />
              <div className="diag-node accent2">
                <div className="diag-node-title">AegisTreasury</div>
                <div className="diag-node-sub">Soroban contract · Stellar Testnet</div>
                <div className="diag-node-sub mono">verifier (CAP-80) · commitments · nonces · Merkle root</div>
              </div>
              <Arrow label="authorized spend" />
              <div className="diag-node dim">
                <div className="diag-node-title">x402 / MPP</div>
                <div className="diag-node-sub">final settlement hop (logged in this build)</div>
              </div>
            </div>
            <div className="arch-below">
              <div className="diag-arrow down">
                <span className="diag-arrow-head">↕</span>
                <span className="diag-arrow-label">REST + SSE</span>
              </div>
              <div className="diag-node wide">
                <div className="diag-node-title">Dashboard</div>
                <div className="diag-node-sub">
                  console · live sealed feed · vendors · attestation — never renders a plaintext amount
                </div>
              </div>
            </div>
          </div>
          <p className="deck-note">
            Every arrow is a real network call. Nothing decides pass/fail in JavaScript — only the circuit and
            the on-chain verifier.
          </p>
        </>
      ),
    },
    {
      key: "flow",
      body: (
        <>
          <h2>How one payment settles</h2>
          <div className="flow-diagram">
            <div className="arch-row">
              <div className="diag-node">
                <div className="diag-node-step">1</div>
                <div className="diag-node-title">Agent requests</div>
                <div className="diag-node-sub">nothing on-chain yet</div>
              </div>
              <Arrow />
              <div className="diag-node accent">
                <div className="diag-node-step">2</div>
                <div className="diag-node-title">Circuit checks policy</div>
                <div className="diag-node-sub">cap · allow-list · balance</div>
              </div>
              <Arrow label="proof exists ✓" />
              <div className="diag-node accent2">
                <div className="diag-node-step">3</div>
                <div className="diag-node-title">Contract verifies</div>
                <div className="diag-node-sub">on-chain pairing check</div>
              </div>
              <Arrow />
              <div className="diag-node">
                <div className="diag-node-step">4</div>
                <div className="diag-node-title">Settled</div>
                <div className="diag-node-sub">amount stays sealed · nonce +1</div>
              </div>
            </div>
            <div className="flow-reject">
              <span className="flow-reject-elbow mono">↳ any rule broken</span>
              <div className="diag-node danger">
                <div className="diag-node-title">✗ No proof exists</div>
                <div className="diag-node-sub">
                  nargo can't find a witness → nothing to submit → the payment simply can't happen. There is no
                  app layer to hack.
                </div>
              </div>
            </div>
          </div>
        </>
      ),
    },
    {
      key: "circuit",
      body: (
        <>
          <h2>The circuit is the policy</h2>
          <p className="deck-lede">
            <span className="mono">aegis-circuit/src/main.nr</span> — five constraints, compiled to an arithmetic
            circuit. If any fails, there is no witness, no proof, no payment.
          </p>
          <ul className="deck-constraints mono">
            <li>✓ Poseidon(old_balance, blinding, agent_id) == old_balance_commitment</li>
            <li>✓ new_balance == old_balance − amount · old_balance ≥ amount</li>
            <li>✓ amount ≤ per_tx_cap</li>
            <li>✓ Poseidon(new_balance, new_blinding, agent_id) == new_balance_commitment</li>
            <li>✓ Merkle path proves vendor ∈ allowlist_root (depth 3, Poseidon)</li>
          </ul>
          <p className="deck-note">
            Replay protection: the proof is cryptographically bound to the agent's on-chain nonce — once it
            advances, a captured proof is dead.
          </p>
        </>
      ),
    },
    {
      key: "live",
      body: (
        <>
          <h2>Live right now — real Testnet numbers</h2>
          {error && (
            <div className="error-banner">
              Orchestrator unreachable ({error}) — these figures are fetched live and can't be shown without it.
            </div>
          )}
          {summary && policy && (
            <>
              <div className="deck-stats">
                <div className="deck-stat">
                  <div className="deck-stat-value ok">{summary.settled}</div>
                  <div className="deck-stat-label">payments settled with proofs</div>
                </div>
                <div className="deck-stat">
                  <div className="deck-stat-value bad">{summary.rejected}</div>
                  <div className="deck-stat-label">violations blocked by the circuit</div>
                </div>
                <div className="deck-stat">
                  <div className="deck-stat-value ok">{summary.violationsReachedSettlement}</div>
                  <div className="deck-stat-label">violations reached settlement</div>
                </div>
                <div className="deck-stat">
                  <div className="deck-stat-value">{policy.agents.length}</div>
                  <div className="deck-stat-label">agents · {policy.vendors.length} allow-listed vendors</div>
                </div>
              </div>
              <p className="deck-note">
                Per-tx cap {policy.perTxCap} (treasury-wide) · allow-list root{" "}
                <span className="mono">{policy.allowlistRoot.slice(0, 18)}…</span> · every settled payment is a
                real transaction on stellar.expert
              </p>
            </>
          )}
          {!summary && !error && <p className="deck-note">Fetching live figures from the orchestrator…</p>}
        </>
      ),
    },
    {
      key: "demo",
      body: (
        <>
          <h2>What to watch in the live demo</h2>
          <div className="deck-cols three">
            <Link className="deck-card link" to="/feed">
              <h3>Live Sealed Feed →</h3>
              <p>
                Payments stream in sealed (●●●●●●). Click any row: the <strong>Proof Inspector</strong> shows the
                real constraints, public inputs, proof size, and tx hash. Rejections show the actual{" "}
                <span className="mono">nargo</span> assertion failure.
              </p>
            </Link>
            <Link className="deck-card link" to="/attestation">
              <h3>Compliance Attestation →</h3>
              <p>
                One click, a real ~2s proof, and a QR/link an auditor can verify independently — without touching
                our servers or database.
              </p>
            </Link>
            <Link className="deck-card link" to="/vendors">
              <h3>Vendors →</h3>
              <p>
                Toggle a vendor and the Merkle allow-list root updates on-chain — the next proof must be built
                against the new root.
              </p>
            </Link>
          </div>
        </>
      ),
    },
    {
      key: "boundaries",
      body: (
        <>
          <h2>Honest boundaries</h2>
          <ul className="deck-bullets">
            <li>
              <strong>The final settlement hop is public by design.</strong> Like a privacy pool: deposits and
              internal transfers are private; a withdrawal to an external address necessarily reveals an amount. We
              hide <em>which agent's shielded budget</em> funded a payment and the link between an agent's
              successive payments — that hop is logged, not wired to a live x402/MPP facilitator in this build.
            </li>
            <li>
              <strong>Agent identity is a plain u64</strong> — CAP-79 muxed sub-accounts are the natural next step.
            </li>
            <li>
              <strong>Next:</strong> hosted orchestrator (the toolchain currently runs locally), per-agent caps as
              circuit public inputs, batched proving.
            </li>
          </ul>
        </>
      ),
    },
    {
      key: "close",
      body: (
        <div className="slide-center">
          <h2 className="deck-close-line">Real ZK, not a rebranded database check.</h2>
          <p className="deck-subtitle">
            Noir 1.0.0-beta.9 · Barretenberg v0.87.0 · UltraHonk on BN254 · Soroban, Stellar Protocol 26 (CAP-80) ·
            live on Testnet
          </p>
          <p className="deck-context">
            Every claim is checkable: <span className="mono">nargo test</span> ·{" "}
            <span className="mono">cargo test</span> (18/18, incl. a real-proof replay attack) · stellar.expert
          </p>
          <Link className="deck-cta" to="/feed">
            Go to the live demo →
          </Link>
        </div>
      ),
    },
  ];

  const last = slides.length - 1;
  const next = useCallback(() => setSlide((s) => Math.min(s + 1, last)), [last]);
  const prev = useCallback(() => setSlide((s) => Math.max(s - 1, 0)), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        prev();
      } else if (e.key === "Home") {
        setSlide(0);
      } else if (e.key === "End") {
        setSlide(last);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, last]);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  }

  return (
    <div className="deck">
      <div className="deck-topbar">
        <Link to="/" className="deck-back">
          ← Aegis
        </Link>
        <div className="deck-topbar-right">
          <span className="deck-counter mono">
            {slide + 1} / {slides.length}
          </span>
          <button className="deck-fullscreen" onClick={toggleFullscreen}>
            Fullscreen
          </button>
        </div>
      </div>

      <div className="deck-slide" key={slides[slide].key}>
        {slides[slide].body}
      </div>

      <div className="deck-nav">
        <button className="deck-arrow" onClick={prev} disabled={slide === 0} aria-label="Previous slide">
          ←
        </button>
        <div className="deck-dots">
          {slides.map((s, i) => (
            <button
              key={s.key}
              className={`deck-dot ${i === slide ? "active" : ""}`}
              onClick={() => setSlide(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
        <button className="deck-arrow" onClick={next} disabled={slide === last} aria-label="Next slide">
          →
        </button>
      </div>
      <div className="deck-hint">Use ← → or Space to navigate</div>
    </div>
  );
}
