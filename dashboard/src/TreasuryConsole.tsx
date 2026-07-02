import { lazy, Suspense, useEffect, useState } from "react";
import { createAgent, fetchPolicy, updatePolicy, type Policy } from "./api";
import { AgentDetailDrawer } from "./AgentDetailDrawer";

// Lazy so chart.js only loads when the Fleet Health tab is opened.
const FleetHealth = lazy(() => import("./FleetHealth").then((m) => ({ default: m.FleetHealth })));
import { useEvents } from "./EventsContext";
import { roleColorClass } from "./roleColors";

const VENDOR_CATALOG = [
  "aws-compute",
  "stripe-payments",
  "twilio-communications",
  "sendgrid-email",
  "cloudflare-cdn",
  "anthropic-api",
  "openai-api",
  "datadog-monitoring",
];

export function TreasuryConsole() {
  const events = useEvents();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rootJustUpdated, setRootJustUpdated] = useState(false);

  const [agentName, setAgentName] = useState("");
  const [agentBudget, setAgentBudget] = useState(10000);
  const [capInput, setCapInput] = useState(500);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [consoleTab, setConsoleTab] = useState<"overview" | "health">("overview");

  async function refresh() {
    try {
      const p = await fetchPolicy();
      setPolicy(p);
      setCapInput(p.perTxCap);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleCreateAgent() {
    if (!agentName.trim() || !policy) return;
    setError(null);
    try {
      // per_tx_cap is enforced on-chain as one treasury-wide policy value,
      // not a per-agent setting -- see treasury.ts's registerAgent.
      await createAgent(agentName.trim(), agentBudget, policy.perTxCap);
      setAgentName("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleUpdateCap() {
    if (!policy) return;
    setError(null);
    try {
      await updatePolicy(capInput, policy.vendors);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleVendor(vendor: string) {
    if (!policy) return;
    const selected = policy.vendors.includes(vendor);
    const next = selected ? policy.vendors.filter((v) => v !== vendor) : [...policy.vendors, vendor];
    if (next.length === 0 || next.length > 8) {
      setError("Allow-list root is depth-3 in the circuit: pick 1-8 vendors.");
      return;
    }
    setError(null);
    try {
      await updatePolicy(policy.perTxCap, next);
      await refresh();
      setRootJustUpdated(true);
      setTimeout(() => setRootJustUpdated(false), 900);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!policy) return <div className="content">Loading treasury state...</div>;

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      <div className="console-tabs">
        <button
          className={`console-tab ${consoleTab === "overview" ? "active" : ""}`}
          onClick={() => setConsoleTab("overview")}
        >
          Overview
        </button>
        <button
          className={`console-tab ${consoleTab === "health" ? "active" : ""}`}
          onClick={() => setConsoleTab("health")}
        >
          Fleet Health
        </button>
      </div>

      {consoleTab === "health" && (
        <Suspense fallback={<div className="hint">Loading fleet health…</div>}>
          <FleetHealth />
        </Suspense>
      )}

      {consoleTab === "overview" && (
      <>
      <div className="panel">
        <h2>Create Agent</h2>
        <p className="hint">
          Name and starting shielded budget. Per-transaction cap is a single treasury-wide
          policy value (set below), enforced on-chain by the contract for every agent.
        </p>
        <div className="form-row">
          <div className="field">
            <label>Name</label>
            <input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="e.g. procurement-agent" />
          </div>
          <div className="field">
            <label>Starting budget</label>
            <input
              type="number"
              value={agentBudget}
              onChange={(e) => setAgentBudget(Number(e.target.value))}
            />
          </div>
          <button className="primary" onClick={handleCreateAgent}>
            Create Agent
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Treasury-wide Per-Transaction Cap</h2>
        <p className="hint">
          Stored on-chain as a single policy value (DataKey::PerTxCap). Changing it issues a
          real update_policy transaction; every agent's next proof must match the new value.
        </p>
        <div className="form-row">
          <div className="field">
            <label>Per-tx cap (treasury-wide)</label>
            <input type="number" value={capInput} onChange={(e) => setCapInput(Number(e.target.value))} />
          </div>
          <button className="primary" onClick={handleUpdateCap}>
            Update Cap
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Vendor Allow-list</h2>
        <p className="hint">
          Dragging a vendor in/out regenerates the Merkle root live (Poseidon, depth 3 -- matches the
          on-chain circuit's allow-list check).
        </p>
        <div className="vendor-chips">
          {VENDOR_CATALOG.map((v) => (
            <div
              key={v}
              className={`chip ${policy.vendors.includes(v) ? "selected" : ""}`}
              onClick={() => toggleVendor(v)}
            >
              {v}
            </div>
          ))}
        </div>
        <div className={`root-pulse ${rootJustUpdated ? "updated" : ""}`}>
          {rootJustUpdated ? "root updated · " : ""}
          {policy.allowlistRoot}
        </div>
      </div>

      <div className="panel">
        <h2>Agents</h2>
        <p className="hint">
          Allocated budget only -- live remaining balance is shielded by default, even here. It only
          appears inside an agent's own detail view.
        </p>
        {policy.agents.map((a) => {
          const max = Math.max(...policy.agents.map((x) => x.allocatedBudget), 1);
          // Remaining balance is deliberately never computed or shown here --
          // that's the shielded-by-default guarantee. The bar reflects this
          // agent's allocation relative to the rest of the fleet, and the
          // payment count (from the real SSE event log) is the only
          // per-agent activity signal shown on the roster view.
          const paymentCount = events.filter((e) => e.agentId === a.id && e.status === "verified").length;
          return (
            <div className="agent-row clickable" key={a.id} onClick={() => setSelectedAgentId(a.id)}>
              <div className="agent-name">{a.name}</div>
              <div className="budget-bar-track">
                <div className="budget-bar-fill" style={{ width: `${(a.allocatedBudget / max) * 100}%` }} />
              </div>
              <div className="budget-label">
                {a.allocatedBudget.toLocaleString()} allocated · {paymentCount} payment{paymentCount === 1 ? "" : "s"}
              </div>
              {a.roleBadge && (
                <span className={`role-badge-inline ${roleColorClass(a.roleBadge)}`}>{a.roleBadge}</span>
              )}
              <span className="agent-row-chevron">→</span>
            </div>
          );
        })}
      </div>
      </>
      )}

      {selectedAgentId !== null &&
        (() => {
          const agent = policy.agents.find((a) => a.id === selectedAgentId);
          if (!agent) return null;
          return (
            <AgentDetailDrawer
              agent={agent}
              vendors={policy.vendors}
              perTxCap={policy.perTxCap}
              onClose={() => setSelectedAgentId(null)}
            />
          );
        })()}
    </div>
  );
}
