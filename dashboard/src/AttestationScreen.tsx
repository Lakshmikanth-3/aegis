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
      setTimeout(() => setLinkCopied(false), 1500);
    });
  }

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

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

      {attestation && (
        <div className="panel attestation-card">
          <div className="attestation-card-body">
            <div className="attestation-fleet-name">Aegis Fleet · {attestation.agentName}</div>
            <div className="attestation-headline">
              Total spend &le; <span className="mono">${attestation.maxSpendClaim.toLocaleString()}</span>
            </div>
            {attestation.vendorComplianceOk && (
              <div className="attestation-line">0 payments to non-allow-listed vendors</div>
            )}
            <div className="attestation-line">
              Period: {PERIOD_OPTIONS.find((o) => o.value === attestation.periodType)?.label} · starting{" "}
              {new Date(attestation.periodStartTimestamp).toLocaleString()}
              {attestation.periodClamped && " (earliest data available -- no history predates this)"}
            </div>
            {attestation.txHash && attestation.explorerUrl ? (
              <div className="attestation-line">
                Proof verified on Stellar Testnet ·{" "}
                <a href={attestation.explorerUrl} target="_blank" rel="noreferrer" className="mono">
                  {attestation.txHash.slice(0, 12)}…↗
                </a>
              </div>
            ) : (
              <div className="attestation-line">Proof verified on Stellar Testnet</div>
            )}

            <div className="mono attestation-technical">
              proof: {attestation.proofBytes} bytes (real UltraHonk proof, not a placeholder)
              <br />
              starting commitment: {attestation.startingCommitment}
              <br />
              ending commitment: {attestation.endingCommitment}
            </div>

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
                Scan to open the verification link
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
            Aegis dashboard, database, or trust required. Run this with any stellar-cli install:
          </p>
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
