import { useEffect, useRef, useState } from "react";
import { fetchVendors, updateAllowlist, pay, type VendorCatalog, type VendorEntry } from "./api";

export function VendorsScreen() {
  const [catalog, setCatalog] = useState<VendorCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyVendor, setBusyVendor] = useState<string | null>(null);
  const [newVendorName, setNewVendorName] = useState("");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rootJustUpdated, setRootJustUpdated] = useState(false);
  const [updateBadgeKey, setUpdateBadgeKey] = useState(0);

  async function refresh() {
    try {
      const c = await fetchVendors();
      setCatalog(c);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // Real, in-background re-verification (not simulated): a vendor that was
  // never part of the allow-list must still be rejected by the real
  // circuit no matter what else just changed in the Merkle tree. This is
  // the exact "shadowy-data-broker" case from the Phase 2 demo scenario,
  // run again through the real nargo/bb/stellar-cli pipeline.
  async function reverifyNonMemberStillRejected() {
    try {
      const result = await pay("analytics-agent", "shadowy-data-broker", 300);
      if (result.status === "rejected") {
        setToast("Proof: non-member vendor still rejected ✓");
        setTimeout(() => setToast(null), 4000);
      }
    } catch {
      // best-effort background check; the allow-list update itself already succeeded
    }
  }

  async function afterAllowlistChange() {
    setRootJustUpdated(true);
    setUpdateBadgeKey((k) => k + 1);
    setTimeout(() => setRootJustUpdated(false), 2000);
    reverifyNonMemberStillRejected();
  }

  async function toggleVendor(v: VendorEntry) {
    setError(null);
    setBusyVendor(v.name);
    try {
      await updateAllowlist(v.active ? "remove" : "add", v.name);
      await refresh();
      afterAllowlistChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyVendor(null);
    }
  }

  async function handleAddVendor() {
    const name = newVendorName.trim();
    if (!name || !catalog) return;
    if (catalog.vendors.some((v) => v.name === name && v.active)) {
      setError(`"${name}" is already in the allow-list`);
      return;
    }
    setError(null);
    setBusyVendor(name);
    try {
      await updateAllowlist("add", name);
      setNewVendorName("");
      await refresh();
      afterAllowlistChange();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyVendor(null);
    }
  }

  function copyRoot() {
    if (!catalog) return;
    navigator.clipboard.writeText(catalog.allowlistRoot).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (!catalog) return <div className="content">Loading vendor allow-list...</div>;

  const explorerUrl = `https://stellar.expert/explorer/testnet/contract/${catalog.contractId}`;

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}
      {toast && <div className="toast">{toast}</div>}

      <div className="panel">
        <h2>Vendor allow-list</h2>
        <p className="hint">Merkle root regenerates automatically when vendors are added or removed.</p>
        <div className={`root-box ${rootJustUpdated ? "updated" : ""}`}>
          <CrossfadeRoot value={catalog.allowlistRoot} />
          <div className="root-box-actions">
            {rootJustUpdated && (
              <span key={updateBadgeKey} className="root-box-updated-badge">
                Updated
              </span>
            )}
            <button className="ghost small" onClick={copyRoot}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <a className="ghost small" href={explorerUrl} target="_blank" rel="noreferrer">
              View contract ↗
            </a>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="vendor-grid">
          {catalog.vendors.map((v) => (
            <div key={v.name} className={`vendor-card ${v.active ? "active" : ""}`}>
              <div className="vendor-card-header">
                <span className="vendor-card-name">{v.name}</span>
                {v.active ? (
                  <span key="active" className="badge-green">In allow-list</span>
                ) : (
                  <span key="removed" className="badge-red">Removed</span>
                )}
              </div>
              <p className="vendor-card-desc">{v.description || "Custom vendor"}</p>
              <div className="vendor-card-footer">
                <span className="vendor-card-footer-label">
                  {busyVendor === v.name ? "Updating on-chain…" : v.active ? "In allow-list" : "Excluded"}
                </span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={v.active}
                    disabled={busyVendor === v.name}
                    onChange={() => toggleVendor(v)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="add-vendor-row">
          <input
            value={newVendorName}
            onChange={(e) => setNewVendorName(e.target.value)}
            placeholder="e.g. new-vendor-name"
          />
          <button className="primary" onClick={handleAddVendor} disabled={!newVendorName.trim() || !!busyVendor}>
            {busyVendor === newVendorName.trim() ? "Adding…" : "Add"}
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="mono merkle-footer">
          Merkle tree depth: {catalog.merkleDepth} · {catalog.merkleLeaves} leaves · Root:{" "}
          {catalog.allowlistRoot.slice(0, 10)}…
        </div>
      </div>
    </div>
  );
}

/** Crossfades the Merkle root text on change: 200ms fade-out, swap, 200ms
 * fade-in (400ms total), rather than snapping to the new value instantly. */
function CrossfadeRoot({ value }: { value: string }) {
  const [display, setDisplay] = useState(value);
  const [fading, setFading] = useState(false);
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current === value) return;
    setFading(true);
    const t = setTimeout(() => {
      setDisplay(value);
      setFading(false);
      prevRef.current = value;
    }, 200);
    return () => clearTimeout(t);
  }, [value]);

  return <span className={`mono root-box-value ${fading ? "fading" : ""}`}>{display}</span>;
}
