import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchPolicy, type PaymentEvent, type Policy } from "./api";

interface Props {
  event: PaymentEvent;
  onClose: () => void;
}

/**
 * Slide-out panel showing exactly what the spend_proof circuit checked for a
 * given feed event. Every value rendered here is real: commitments, nonce and
 * proof size come from the orchestrator's PaymentEvent (produced by the actual
 * nargo/bb run), cap and allow-list root are fetched live from /api/policy,
 * and the tx hash links to the real Stellar Testnet transaction. For rejected
 * events, rejectDetail is the actual assertion-failure text nargo printed.
 *
 * The one honest caveat: per_tx_cap and allowlist_root are the *current*
 * policy values — the event itself doesn't snapshot the policy it was proved
 * against, so they're labeled "current policy" rather than presented as a
 * per-event archive.
 */
export function ProofInspector({ event, onClose }: Props) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPolicy()
      .then((p) => !cancelled && setPolicy(p))
      .catch((err) => !cancelled && setPolicyError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rejected = event.status === "rejected";
  const failedConstraint =
    event.rejectReason === "over_cap" ? 3 : event.rejectReason === "vendor_not_allowlisted" ? 5 : null;

  const constraints = [
    { n: 1, text: "Poseidon(old_balance, blinding, agent_id) == old_balance_commitment" },
    { n: 2, text: "new_balance == old_balance − amount · old_balance ≥ amount" },
    {
      n: 3,
      text: `amount ≤ per_tx_cap${policy ? ` (treasury-wide: ${policy.perTxCap})` : ""}`,
    },
    { n: 4, text: "Poseidon(new_balance, new_blinding, agent_id) == new_balance_commitment" },
    { n: 5, text: "Merkle path proves vendor ∈ allowlist_root (depth 3, Poseidon)" },
  ];

  function copyTxHash() {
    if (!event.txHash) return;
    navigator.clipboard.writeText(event.txHash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return createPortal(
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer proof-inspector" onClick={(e) => e.stopPropagation()}>
        <button className="drawer-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="drawer-header">
          {rejected ? (
            <h2 className="inspector-title rejected-title">Proof rejected — constraint failed</h2>
          ) : (
            <h2 className="inspector-title">Proof inspector</h2>
          )}
          <div className="hint">
            {event.agentName}
            {rejected && <span className="mono"> → {event.vendor}</span>} ·{" "}
            {new Date(event.timestamp).toLocaleTimeString()}
          </div>
        </div>

        <div className="drawer-section">
          <h3>Circuit constraints checked</h3>
          <ul className="constraint-list">
            {constraints.map((c) => {
              const failed = failedConstraint === c.n;
              // For a rejected payment nargo stops at the first failing
              // assert -- constraints after it were never evaluated, so
              // they're shown as unevaluated rather than passed.
              const unevaluated = failedConstraint !== null && c.n > failedConstraint;
              return (
                <li
                  key={c.n}
                  className={`constraint-row mono ${failed ? "failed" : unevaluated ? "unevaluated" : "passed"}`}
                >
                  <span className="constraint-mark">{failed ? "✗" : unevaluated ? "·" : "✓"}</span>
                  <span>{c.text}</span>
                </li>
              );
            })}
          </ul>
          {rejected && (
            <div className="inspector-callout rejected-callout">
              No proof was produced. <code>nargo execute</code> could not find a satisfying witness because the
              circuit's <code>assert()</code> at constraint {failedConstraint} failed. The contract never received a
              proof to verify.
              {event.rejectDetail && (
                <div className="reject-detail mono">{event.rejectDetail}</div>
              )}
            </div>
          )}
        </div>

        <div className="drawer-section">
          <h3>Public inputs (on-chain)</h3>
          {policyError && (
            <div className="error-banner">Couldn't load current policy from the orchestrator: {policyError}</div>
          )}
          <table className="public-inputs-table mono">
            <tbody>
              <tr>
                <td>old_commitment</td>
                <td className="pi-value" title={event.oldCommitment}>
                  {event.oldCommitment}
                </td>
              </tr>
              <tr>
                <td>new_commitment</td>
                <td className="pi-value" title={event.newCommitment}>
                  {rejected ? "— (no state change)" : event.newCommitment}
                </td>
              </tr>
              <tr>
                <td>per_tx_cap</td>
                <td className="pi-value">{policy ? `${policy.perTxCap} (current policy)` : "loading…"}</td>
              </tr>
              <tr>
                <td>allowlist_root</td>
                <td className="pi-value" title={policy?.allowlistRoot}>
                  {policy ? `${policy.allowlistRoot} (current policy)` : "loading…"}
                </td>
              </tr>
              <tr>
                <td>agent_id</td>
                <td className="pi-value">{event.agentId}</td>
              </tr>
              <tr>
                <td>agent_nonce</td>
                <td className="pi-value">{event.nonceUsed}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {!rejected && (
          <div className="drawer-section">
            <h3>Proof size</h3>
            <div className="mono inspector-fact">
              {event.proofBytes.toLocaleString()} bytes · UltraHonk · BN254 curve · Barretenberg v0.87.0
            </div>
          </div>
        )}

        <div className="drawer-section">
          <h3>On-chain verification</h3>
          {event.txHash ? (
            <>
              <div className="mono inspector-txhash" title={event.txHash}>
                {event.txHash}
              </div>
              <div className="inspector-tx-actions">
                {event.explorerUrl && (
                  <a className="tx-link" href={event.explorerUrl} target="_blank" rel="noreferrer">
                    View on stellar.expert →
                  </a>
                )}
                <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={copyTxHash}>
                  {copied ? "Copied!" : "Copy tx hash"}
                </button>
              </div>
            </>
          ) : (
            <div className="hint">
              No transaction — this payment was blocked before anything could be submitted on-chain.
            </div>
          )}
        </div>

        {!rejected && (
          <div className="drawer-section">
            <h3>Why this is real ZK</h3>
            <div className="inspector-callout">
              This proof was generated by nargo 1.0.0-beta.9 and verified on-chain by the AegisTreasury Soroban
              contract using Stellar Protocol 26 (CAP-80) BN254 host functions. The contract cannot be tricked — a
              forged proof would fail the pairing check.
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
