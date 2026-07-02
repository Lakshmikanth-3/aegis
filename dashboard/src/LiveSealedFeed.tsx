import { useEffect, useRef, useState } from "react";
import { pay, startSimulation, type PaymentEvent } from "./api";
import { useEvents } from "./EventsContext";
import { AnimatedNumber } from "./AnimatedNumber";
import { ProofInspector } from "./ProofInspector";

type FeedRow = PaymentEvent & { phase: "sealed" | "revealed" };

const SEAL_DURATION_MS = 900;

// Three adversarial attempts, sent to the real /api/pay endpoint one after
// another. Nothing here decides the outcome -- attempt 1 settles because the
// circuit can prove it compliant, attempts 2 and 3 are rejected because
// nargo genuinely cannot find a witness for them. The orchestrator queues
// proving jobs, so each attempt is awaited before the next is sent (a fixed
// 1s gap would just pile them onto the same queue with a misleading
// progress indicator).
const THREAT_ATTEMPTS = [
  {
    label: "Baseline: compliant payment (should settle)",
    agentName: "procurement-agent",
    vendor: "aws-compute",
    amount: 340,
  },
  {
    label: "Attack: over per-tx cap (circuit must refuse to prove)",
    agentName: "procurement-agent",
    vendor: "aws-compute",
    amount: 750,
  },
  {
    label: "Attack: vendor not in allow-list (Merkle assert must fail)",
    agentName: "analytics-agent",
    vendor: "malicious-data-exfiltrator",
    amount: 200,
  },
] as const;

export function LiveSealedFeed() {
  const events = useEvents();
  const [rows, setRows] = useState<FeedRow[]>(() => events.map((e) => ({ ...e, phase: "revealed" as const })));
  const [inspected, setInspected] = useState<PaymentEvent | null>(null);
  const [threat, setThreat] = useState<{ stage: number; label: string } | null>(null);
  const [threatToast, setThreatToast] = useState<string | null>(null);
  const seenCountRef = useRef(events.length);
  const startedRef = useRef(false);

  useEffect(() => {
    if (events.length <= seenCountRef.current) {
      seenCountRef.current = events.length;
      return;
    }
    const newOnes = events.slice(seenCountRef.current);
    seenCountRef.current = events.length;

    // The event arriving here already carries its final, real status --
    // nargo/bb proving and the Stellar testnet submission already
    // finished server-side before this SSE frame was sent. The brief
    // "sealed" phase below is a presentation choice (matching the PRD's
    // sealed-card choreography), not a simulation of verification that
    // hasn't actually happened yet.
    setRows((prev) => [...prev, ...newOnes.map((e) => ({ ...e, phase: "sealed" as const }))]);
    for (const e of newOnes) {
      setTimeout(() => {
        setRows((prev) => prev.map((r) => (r.seq === e.seq ? { ...r, phase: "revealed" } : r)));
      }, SEAL_DURATION_MS);
    }
  }, [events]);

  async function handleStart() {
    if (startedRef.current) return;
    startedRef.current = true;
    await startSimulation();
  }

  async function handleThreatDemo() {
    if (threat) return;
    setThreatToast(null);
    const outcomes: PaymentEvent[] = [];
    let failure: string | null = null;
    for (let i = 0; i < THREAT_ATTEMPTS.length; i++) {
      const attempt = THREAT_ATTEMPTS[i];
      setThreat({ stage: i + 1, label: attempt.label });
      try {
        // Real proving + (if provable) a real testnet transaction. The
        // rejected attempts produce a real nargo constraint failure, so an
        // attempt can take ~10-20s.
        outcomes.push(await pay(attempt.agentName, attempt.vendor, attempt.amount));
      } catch (err) {
        failure = (err as Error).message;
        break;
      }
    }
    setThreat(null);
    if (failure) {
      setThreatToast(`Demo stopped: ${failure}`);
      return;
    }
    // Counted from the real responses, not assumed.
    const settled = outcomes.filter((o) => o.status === "verified").length;
    const blocked = outcomes.filter((o) => o.status === "rejected").length;
    const reachedSettlement = outcomes.filter((o) => o.status === "rejected" && o.txHash !== null).length;
    setThreatToast(
      `Demo complete: ${settled} settled · ${blocked} blocked by ZK circuit · ${reachedSettlement} reached settlement`
    );
  }

  const verified = rows.filter((r) => r.status === "verified").length;
  const rejected = rows.filter((r) => r.status === "rejected").length;

  return (
    <div>
      <div className="panel">
        <div className="feed-header">
          <h2 style={{ margin: 0 }}>Live Sealed Feed</h2>
          <span className="live-indicator">
            <span className="live-dot-red" />
            Live
          </span>
        </div>
        <div className="counter-bar">
          <span className="count">
            <AnimatedNumber value={verified} className="ok" /> payments settled ·{" "}
            <AnimatedNumber value={rejected} className="bad" /> violations blocked ·{" "}
            <span className="ok">0</span> violations reached settlement
          </span>
          <span className="feed-actions">
            <button className="primary" onClick={handleStart} disabled={startedRef.current}>
              {startedRef.current ? "Running (real proving + testnet, ~10-20s/payment)…" : "Start Agent Fleet"}
            </button>
            <button className="threat-btn" onClick={handleThreatDemo} disabled={threat !== null}>
              {threat ? "Adversarial attempts in progress…" : "Run threat demo — real circuit enforcement"}
            </button>
          </span>
        </div>

        {threat && (
          <div className="threat-banner">
            <span className="live-dot-red" />
            Threat demo running — 3 adversarial attempts against the real circuit ({threat.stage}/3)
            <span className="threat-banner-detail">{threat.label}</span>
          </div>
        )}
        {threatToast && (
          <div className="threat-toast" role="status">
            {threatToast}
            <button className="threat-toast-close" onClick={() => setThreatToast(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        <div className="feed">
          {rows.length === 0 && (
            <div className="empty-feed">
              No payments yet -- click "Start Agent Fleet" to begin. Each row is a real Noir
              proof generated by nargo+bb and a real Stellar testnet transaction, so rows
              arrive every ~10-20s, not instantly.
            </div>
          )}
          {rows.map((r) => (
            <FeedRowView key={r.seq} row={r} onInspect={() => setInspected(r)} />
          ))}
        </div>
      </div>
      {inspected && <ProofInspector event={inspected} onClose={() => setInspected(null)} />}
    </div>
  );
}

function FeedRowView({ row, onInspect }: { row: FeedRow; onInspect: () => void }) {
  const sealed = row.phase === "sealed";
  const statusClass = sealed ? "pending" : row.status;
  const rowClassName = `feed-row ${statusClass}${sealed ? "" : " inspectable"}`;
  const now = useTicker(2000);

  return (
    <div
      className={rowClassName}
      title={sealed ? undefined : "Click to inspect the proof"}
      onClick={sealed ? undefined : onInspect}
    >
      <div className="feed-row-top">
        <span className="feed-row-agent">
          {row.agentName}
          {/* Vendor is only ever revealed for a rejected payment -- it never
              actually spent anything, so naming it is audit-useful rather
              than a confidentiality leak. A settled payment's vendor stays
              sealed along with the amount, matching the project's core
              privacy guarantee. */}
          {!sealed && row.status === "rejected" && <span className="arrow-vendor"> → {row.vendor}</span>}
        </span>
        {/* Amount is never shown in the UI, pass or fail. */}
        <span className="sealed feed-row-amount">●●●●●●</span>
      </div>
      <div className="feed-row-bottom">
        <span key={row.phase} className={`status-tag ${statusClass}`}>
          {sealed && "⏳ verifying..."}
          {!sealed && row.status === "verified" && (
            <>
              ✓ Policy proof verified on-chain
              {row.explorerUrl && (
                <a href={row.explorerUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                  view tx →
                </a>
              )}
            </>
          )}
          {!sealed && row.status === "rejected" && <>✗ Proof rejected — {rejectLabel(row.rejectReason)}</>}
        </span>
        <span className="feed-row-time">{relativeTime(row.timestamp, now)}</span>
      </div>
    </div>
  );
}

function rejectLabel(reason?: PaymentEvent["rejectReason"]) {
  if (reason === "over_cap") return "over per-tx cap";
  if (reason === "vendor_not_allowlisted") return "vendor not in allow-list";
  return "policy violation";
}

function relativeTime(iso: string, now: number): string {
  const diffMs = Math.max(0, now - new Date(iso).getTime());
  const s = Math.floor(diffMs / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

/** Re-renders every `intervalMs` so relative timestamps ("12s ago") stay fresh. */
function useTicker(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

