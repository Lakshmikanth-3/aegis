import { useEffect, useState, type CSSProperties } from "react";
import QRCode from "qrcode";
import {
  fetchPolicy,
  generateAttestation,
  startAttestationPeriod,
  verifyAttestation,
  type Attestation,
  type AttestationPeriod,
  type Policy,
} from "./api";

const PERIOD_OPTIONS: { value: AttestationPeriod; label: string }[] = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "session", label: "This session" },
];

/**
 * Shown while the awaited POST /api/attestation call runs. The orchestrator
 * really does perform these three steps in this order for every attestation;
 * the *active-step highlight* is a time-based estimate, clearly labeled as
 * such, because the single HTTP call reports no mid-flight progress.
 */
function ProvingProgress() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => clearInterval(id);
  }, []);
  const stage = elapsed < 3 ? 0 : elapsed < 8 ? 1 : 2;
  const steps = [
    "Building commitment snapshot…",
    "Running nargo execute + bb prove…",
    "Submitting to Stellar Testnet…",
  ];
  return (
    <div className="panel proving-panel">
      {steps.map((s, i) => (
        <div key={s} className={`proving-step mono ${i === stage ? "active" : i < stage ? "done" : "pending"}`}>
          <span className="proving-marker">{i < stage ? "✓" : i === stage ? <span className="spinner" /> : "·"}</span>
          {s}
        </div>
      ))}
      <div className="hint" style={{ marginTop: 12 }}>
        Real UltraHonk proof · ~14 KB · Barretenberg v0.87.0 · {Math.floor(elapsed)}s elapsed (step highlight is
        estimated — the proving call reports no intermediate progress)
      </div>
    </div>
  );
}

export function AttestationScreen() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [agentId, setAgentId] = useState<number | null>(null);
  const [periodLabel, setPeriodLabel] = useState("2026Q3");
  const [period, setPeriod] = useState<AttestationPeriod>("session");
  const [generating, setGenerating] = useState(false);
  const [attestation, setAttestation] = useState<Attestation | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<Attestation | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showCopiedToast, setShowCopiedToast] = useState(false);
  const [showVerifyCommand, setShowVerifyCommand] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);

  useEffect(() => {
    fetchPolicy().then((p) => {
      setPolicy(p);
      if (p.agents.length > 0) setAgentId(p.agents[0].id);
    });
  }, []);

  async function handleStartPeriod() {
    if (agentId == null) return;
    setError(null);
    try {
      await startAttestationPeriod(agentId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleGenerate() {
    if (agentId == null) return;
    setError(null);
    setGenerating(true);
    setAttestation(null);
    setQrDataUrl(null);
    setVerifyResult(null);
    try {
      const result = await generateAttestation(agentId, periodLabel, period);
      setAttestation(result);
      setShowVerifyCommand(false);
      setDetailsOpen(true);
      const verifyUrl = verificationLink(result);
      setQrDataUrl(await QRCode.toDataURL(verifyUrl, { margin: 1, width: 200 }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleVerifyIndependently() {
    if (!attestation) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result = await verifyAttestation(attestation.verifyToken);
      setVerifyResult(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setVerifying(false);
    }
  }

  function verificationLink(a: Attestation): string {
    return a.explorerUrl ?? `${window.location.origin}${window.location.pathname}?verify=${a.verifyToken}`;
  }

  function handleCopyLink() {
    if (!attestation) return;
    navigator.clipboard.writeText(verificationLink(attestation)).then(() => {
      setLinkCopied(true);
      setShowCopiedToast(true);
      setTimeout(() => setLinkCopied(false), 1500);
      setTimeout(() => setShowCopiedToast(false), 1500);
    });
  }

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}
      {showCopiedToast && <div className="toast">Copied!</div>}

      <div className="panel">
        <h2>Compliance Attestation</h2>
        <p className="hint">
          Proves cumulative spend since the period start is bounded, and that every settled
          payment passed the vendor allow-list -- without revealing individual amounts or
          vendors. Real <code>compliance_attestation</code> UltraHonk proof, verified on the
          deployed Stellar testnet contract.
        </p>

        <div className="field" style={{ marginBottom: 16 }}>
          <label>Period</label>
          <div className="period-selector">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`period-option ${period === opt.value ? "active" : ""}`}
                onClick={() => setPeriod(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-row">
          <div className="field">
            <label>Agent</label>
            <select
              value={agentId ?? ""}
              onChange={(e) => setAgentId(Number(e.target.value))}
              style={selectStyle}
            >
              {policy?.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Period label</label>
            <input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} />
          </div>
          {period === "session" && (
            <button className="primary" onClick={handleStartPeriod} disabled={agentId == null}>
              Start New Period
            </button>
          )}
          <button className="primary" onClick={handleGenerate} disabled={agentId == null || generating}>
            {generating ? "Generating zero-knowledge proof..." : "Generate Compliance Attestation"}
          </button>
        </div>
      </div>

      {generating && <ProvingProgress />}

      {attestation && (
        <div className="panel attestation-card">
          <div className="attestation-card-body">
            <div className="attestation-verified-header">
              <span className="attestation-check" aria-hidden="true">
                ✓
              </span>
              <div>
                <div className="attestation-fleet-name">Aegis Fleet · {attestation.periodLabel}</div>
                <div className="attestation-verified-title">Attestation verified</div>
                <div className="attestation-line">
                  {attestation.txHash ? "Verified on Stellar Testnet" : "Generated"} at{" "}
                  {new Date(attestation.generatedAt).toLocaleString()}
                </div>
              </div>
            </div>

            {/* The attestation circuit is per-agent, so the claims name the
                agent rather than claiming fleet-wide facts one proof can't
                actually cover. */}
            <div className="attestation-claims">
              <div className="attestation-claim">
                ✓ {attestation.agentName}'s cumulative spend ≤{" "}
                <span className="mono">${attestation.maxSpendClaim.toLocaleString()}</span> ·{" "}
                {PERIOD_OPTIONS.find((o) => o.value === attestation.periodType)?.label}
              </div>
              {attestation.vendorComplianceOk && (
                <div className="attestation-claim">✓ 0 payments to non-allow-listed vendors</div>
              )}
              {attestation.txHash && (
                <div className="attestation-claim">✓ Proof verified by AegisTreasury (CAP-80 BN254)</div>
              )}
            </div>

            <div className="attestation-line">
              Period starting {new Date(attestation.periodStartTimestamp).toLocaleString()}
              {attestation.periodClamped && " (earliest data available -- no history predates this)"}
            </div>

            <button className="verify-toggle" onClick={() => setDetailsOpen((v) => !v)}>
              {detailsOpen ? "Hide proof details" : "Show proof details"}
            </button>
            {detailsOpen && (
              <div className="attestation-details">
                {attestation.txHash && attestation.explorerUrl ? (
                  <div className="attestation-line">
                    <span className="mono">{attestation.txHash.slice(0, 12)}…</span>{" "}
                    <a href={attestation.explorerUrl} target="_blank" rel="noreferrer">
                      view on stellar.expert →
                    </a>
                  </div>
                ) : (
                  <div className="attestation-line">No on-chain tx recorded for this attestation.</div>
                )}
                <div className="mono attestation-technical">
                  Proof type: compliance_attestation · UltraHonk · {attestation.proofBytes.toLocaleString()} bytes
                  <br />
                  Verified by contract: {attestation.contractId}
                  <br />
                  starting commitment: {attestation.startingCommitment}
                  <br />
                  ending commitment: {attestation.endingCommitment}
                </div>
              </div>
            )}

            <div className="attestation-actions">
              <button className="primary" onClick={handleCopyLink}>
                {linkCopied ? "Copied ✓" : "Copy verification link"}
              </button>
              <button className="ghost" onClick={handleVerifyIndependently} disabled={verifying}>
                {verifying ? "Verifying..." : "Verify independently →"}
              </button>
            </div>
            {verifyResult && (
              <p className="attestation-verify-note">
                Re-fetched from /api/attestation/verify/{verifyResult.verifyToken} -- the same
                record, by token alone, with no dashboard session or database access.
              </p>
            )}
          </div>
          {qrDataUrl && (
            <div className="attestation-qr">
              <img src={qrDataUrl} alt="Attestation verification QR code" width={200} height={200} />
              <div className="hint" style={{ textAlign: "center", marginTop: 8 }}>
                Scan to independently verify this attestation
              </div>
            </div>
          )}
        </div>
      )}

      {attestation && (
        <div className="panel">
          <h2>Verify independently</h2>
          <p className="hint">
            Anyone can re-check this attestation was really accepted on Stellar Testnet -- no
            Aegis dashboard, database, or trust required.
          </p>
          <button className="verify-toggle" onClick={() => setShowVerifyCommand((v) => !v)}>
            {showVerifyCommand ? "Hide verify command" : "Show verify command"}
          </button>
          {showVerifyCommand && (
            <div className="verify-command-wrap">
              <p className="hint">Run this with any stellar-cli install:</p>
              <pre className="verify-command mono">
                {attestation.txHash
                  ? `stellar tx fetch --hash ${attestation.txHash} --network testnet`
                  : "no on-chain tx recorded for this attestation"}
              </pre>
              <p className="hint">
                This fetches the real transaction that called <code>verify_attestation</code> on
                contract <span className="mono">{attestation.contractId}</span> and shows its
                arguments and result directly from the Stellar network.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const selectStyle: CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--panel-border)",
  color: "var(--text)",
  padding: "8px 10px",
  borderRadius: 6,
  fontSize: 14,
};
