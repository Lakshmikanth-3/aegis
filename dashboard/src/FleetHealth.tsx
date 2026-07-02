import { useEffect, useRef, useState } from "react";
import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from "chart.js";
import { fetchPolicy, fetchSummary, type PaymentEvent, type Policy, type Summary } from "./api";
import { useEvents } from "./EventsContext";
import { roleColorClass } from "./roleColors";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

/**
 * Fleet Health tab. Two kinds of real data, labeled separately because they
 * have different lifetimes:
 *  - lifetime facts from the chain/orchestrator (/api/policy + /api/summary,
 *    re-fetched every 10s): budgets, per-agent settled counts (the on-chain
 *    nonce increments exactly once per settled spend), fleet totals;
 *  - session facts from the SSE event stream: rejections and the outcome
 *    chart. The orchestrator keeps no queryable payment-history endpoint, so
 *    per-agent rejection data only exists for events this browser witnessed.
 */
export function FleetHealth() {
  const events = useEvents();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [p, s] = await Promise.all([fetchPolicy(), fetchSummary()]);
        if (cancelled) return;
        setPolicy(p);
        setSummary(s);
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

  if (error) return <div className="error-banner">Orchestrator unreachable: {error}</div>;
  if (!policy || !summary) return <div className="hint">Loading fleet health…</div>;

  const totalShielded = policy.agents.reduce((sum, a) => sum + a.allocatedBudget, 0);
  const decided = summary.settled + summary.rejected;
  const complianceRate = decided > 0 ? (summary.settled / decided) * 100 : null;
  const complianceClass =
    complianceRate === null ? "" : complianceRate >= 80 ? "ok" : complianceRate >= 50 ? "warn" : "bad";
  const activeAgents = policy.agents.filter((a) => a.nonce > 0).length;

  return (
    <div>
      <div className="health-cards">
        <div className="health-card">
          <div className="health-card-value">${totalShielded.toLocaleString()}</div>
          <div className="health-card-label">Total shielded value</div>
          <div className="stat-caption">allocated across fleet (shielded)</div>
        </div>
        <div className="health-card">
          <div className={`health-card-value ${complianceClass}`}>
            {complianceRate === null ? "—" : `${complianceRate.toFixed(1)}%`}
          </div>
          <div className="health-card-label">Policy compliance rate</div>
          <div className="stat-caption">settled ÷ all proof attempts, lifetime</div>
        </div>
        <div className="health-card">
          <div className="health-card-value">
            {activeAgents}/{policy.agents.length}
          </div>
          <div className="health-card-label">Active agents</div>
          <div className="stat-caption">with ≥1 settled payment (on-chain nonce)</div>
        </div>
        <div className="health-card">
          <div className="health-card-value bad">{summary.rejected}</div>
          <div className="health-card-label">Circuit rejections</div>
          <div className="stat-caption">caught before settlement · 0 reached settlement</div>
        </div>
      </div>

      <RiskTable policy={policy} events={events} />
      <OutcomeChart events={events} />
    </div>
  );
}

function RiskTable({ policy, events }: { policy: Policy; events: PaymentEvent[] }) {
  const maxNonce = Math.max(...policy.agents.map((a) => a.nonce), 1);
  return (
    <div className="panel">
      <h2>Agent risk</h2>
      <p className="hint">
        Payments are lifetime (each settled spend increments the agent's on-chain nonce). Rejections and rates
        cover this browser session — the orchestrator exposes no payment-history endpoint, so rejected attempts
        are only known to sessions that watched them happen.
      </p>
      <div className="risk-table-wrap">
        <table className="risk-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Role</th>
              <th>Payments (lifetime)</th>
              <th>Rejections (session)</th>
              <th>Rejection rate (session)</th>
              <th>Activity share</th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {policy.agents.map((a) => {
              const sessionSettled = events.filter((e) => e.agentId === a.id && e.status === "verified").length;
              const sessionRejected = events.filter((e) => e.agentId === a.id && e.status === "rejected").length;
              const sessionTotal = sessionSettled + sessionRejected;
              const rate = sessionTotal > 0 ? sessionRejected / sessionTotal : null;
              const rateClass = rate === null ? "" : rate < 0.1 ? "ok" : rate <= 0.3 ? "warn" : "bad";
              return (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>
                    {a.roleBadge && (
                      <span className={`role-badge-inline ${roleColorClass(a.roleBadge)}`}>{a.roleBadge}</span>
                    )}
                  </td>
                  <td className="mono">{a.nonce}</td>
                  <td className="mono">{sessionRejected}</td>
                  <td>
                    {rate === null ? (
                      <span className="hint">no session activity</span>
                    ) : (
                      <span className="rate-cell">
                        <span className="rate-bar-track">
                          <span className={`rate-bar-fill ${rateClass}`} style={{ width: `${rate * 100}%` }} />
                        </span>
                        <span className={`mono rate-value ${rateClass}`}>{(rate * 100).toFixed(0)}%</span>
                      </span>
                    )}
                  </td>
                  <td>
                    {/* Share of the fleet's settled payments, not remaining
                        budget -- balances are shielded, so spend-based
                        utilization is unknowable by design. */}
                    <span className="rate-bar-track wide">
                      <span className="rate-bar-fill neutral" style={{ width: `${(a.nonce / maxNonce) * 100}%` }} />
                    </span>
                  </td>
                  <td>
                    {rate === null ? (
                      <span className="risk-pill nodata">No data</span>
                    ) : rate < 0.1 ? (
                      <span className="risk-pill ok">Low</span>
                    ) : rate <= 0.3 ? (
                      <span className="risk-pill warn">Medium</span>
                    ) : (
                      <span className="risk-pill bad">High</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OutcomeChart({ events }: { events: PaymentEvent[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const recent = events.slice(-20);

  useEffect(() => {
    if (!canvasRef.current || recent.length === 0) return;
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue("--accent").trim() || "#2fe6a0";
    const danger = styles.getPropertyValue("--danger").trim() || "#ff5d5d";
    const textDim = styles.getPropertyValue("--text-dim").trim() || "#9aa1ab";

    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: recent.map((e) => e.agentName.replace(/-agent$/, "")),
        datasets: [
          {
            // Binary pass/fail -- deliberately not amounts, which stay sealed.
            data: recent.map(() => 1),
            backgroundColor: recent.map((e) => (e.status === "verified" ? accent : danger)),
            borderRadius: 4,
            maxBarThickness: 42,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: window.matchMedia("(prefers-reduced-motion: no-preference)").matches ? undefined : false,
        scales: {
          y: { display: false, max: 1.1 },
          x: { grid: { display: false }, ticks: { color: textDim, font: { size: 10 } } },
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (items) => recent[items[0].dataIndex].agentName,
              label: (item) => {
                const e = recent[item.dataIndex];
                return e.status === "verified"
                  ? "✓ settled · amount sealed"
                  : `✗ rejected · ${e.vendor} · ${e.rejectReason ?? "policy violation"}`;
              },
            },
          },
        },
      },
    });
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [events]);

  return (
    <div className="panel">
      <h2>Recent payment outcomes</h2>
      <p className="hint">
        Last {recent.length || 20} payments this session, chronological. Green settled, red rejected — heights are
        binary pass/fail; amounts are never charted because they're sealed.
      </p>
      {recent.length === 0 ? (
        <div className="empty-feed">
          No payments witnessed this session yet — run "Start Agent Fleet" or the threat demo on the Live Sealed
          Feed to populate this chart with real events.
        </div>
      ) : (
        <div className="outcome-chart-wrap">
          <canvas ref={canvasRef} />
        </div>
      )}
    </div>
  );
}
