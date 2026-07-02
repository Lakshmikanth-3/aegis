import { useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useEvents } from "./EventsContext";
import { roleColorClass } from "./roleColors";
import type { PolicyAgent } from "./api";

interface Props {
  agent: PolicyAgent;
  vendors: string[];
  perTxCap: number;
  onClose: () => void;
}

export function AgentDetailDrawer({ agent, vendors, perTxCap, onClose }: Props) {
  const events = useEvents();
  const [copied, setCopied] = useState(false);
  const agentEvents = events.filter((e) => e.agentId === agent.id);
  const settledCount = agentEvents.filter((e) => e.status === "verified").length;
  const blockedCount = agentEvents.filter((e) => e.status === "rejected").length;
  const recent = [...agentEvents].slice(-5).reverse();

  function copyAgentId() {
    navigator.clipboard.writeText(String(agent.id)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // Rendered via a portal directly into <body>: TreasuryConsole's ".content"
  // ancestor establishes its own stacking context (position:relative +
  // z-index), which would otherwise trap this drawer's z-index beneath the
  // app's sticky topbar regardless of how high z-index is set here.
  return createPortal(
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="drawer-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="drawer-header">
          <div className={`role-badge ${roleColorClass(agent.roleBadge || "")}`}>{agent.roleBadge || "Agent"}</div>
          <h2>{agent.name}</h2>
          <div className="mono drawer-agent-id">
            agent_id: {agent.id}
            <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={copyAgentId}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          {agent.description && <p className="hint">{agent.description}</p>}
        </div>

        <div className="drawer-stats">
          <div className="drawer-stat">
            <div className="drawer-stat-value">${agent.allocatedBudget.toLocaleString()}</div>
            <div className="drawer-stat-label">Allocated budget</div>
            <div className="stat-caption">allocation, not remaining balance</div>
          </div>
          <div className="drawer-stat">
            <div className="drawer-stat-value">{settledCount}</div>
            <div className="drawer-stat-label">Payments this session</div>
          </div>
          <div className="drawer-stat">
            <div className="drawer-stat-value">{blockedCount}</div>
            <div className="drawer-stat-label">Violations blocked</div>
          </div>
        </div>

        <div className="drawer-section">
          <h3>Treasury-wide policy</h3>
          <div className="policy-cap-row">
            <span className="hint">
              Treasury-wide per-tx cap (applies to all agents)
              <span className="info-tip">
                <button className="info-tip-trigger" aria-label="How the cap is enforced">
                  ⓘ
                </button>
                <span className="info-tip-bubble" role="tooltip">
                  This cap is enforced on-chain by the ZK circuit. Every proof must satisfy amount ≤ {perTxCap} or
                  no valid proof exists.
                </span>
              </span>
            </span>
            <span className="mono policy-cap-value">{perTxCap}</span>
          </div>
          <div className="vendor-chips">
            {vendors.map((v) => (
              <span key={v} className="badge-green mono">
                {v}
              </span>
            ))}
          </div>
        </div>

        <div className="drawer-section">
          <h3>Recent activity</h3>
          {recent.length === 0 && (
            <div className="empty-feed">No activity yet for this agent this session.</div>
          )}
          {recent.map((e) => (
            <div key={e.seq} className={`activity-row ${e.status}`}>
              <span className="sealed mono">●●●●●●</span>
              <span className="mono activity-vendor">{e.status === "rejected" ? e.vendor : ""}</span>
              <span className="mono activity-time">{new Date(e.timestamp).toLocaleTimeString()}</span>
              <span className={`status-tag ${e.status}`}>
                {e.status === "verified" ? "✓ verified" : "✗ rejected"}
              </span>
            </div>
          ))}
          <Link className="tx-link drawer-feed-link" to="/feed">
            View in live feed →
          </Link>
        </div>
      </div>
    </div>,
    document.body
  );
}
