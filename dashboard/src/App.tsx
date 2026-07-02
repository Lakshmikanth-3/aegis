import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import "./App.css";
import { TreasuryConsole } from "./TreasuryConsole";
import { LiveSealedFeed } from "./LiveSealedFeed";
import { AttestationScreen } from "./AttestationScreen";
import { LandingPage } from "./LandingPage";
import { VendorsScreen } from "./VendorsScreen";
import { fetchStatus, type Status } from "./api";
import { EventsProvider } from "./EventsContext";

function useStatusPoll(): Status | null {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const s = await fetchStatus();
        if (cancelled) return;
        setStatus(s);
        if (!s.ready && !s.error) timer = setTimeout(poll, 2000);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 2000);
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return status;
}

function AppShell() {
  const status = useStatusPoll();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="app">
      <div className="glow-mesh" />
      <div className="topbar">
        <button className="brand-link" onClick={() => navigate("/")}>
          <div className="brand-mark">A</div>
          <div>
            <div className="brand">AEGIS</div>
            <div className="brand-tag">confidential spend rails for AI agent payments</div>
          </div>
        </button>
        <div className="tabs">
          <Link className={`tab ${location.pathname === "/console" ? "active" : ""}`} to="/console">
            Treasury Console
          </Link>
          <Link className={`tab ${location.pathname === "/feed" ? "active" : ""}`} to="/feed">
            Live Sealed Feed
          </Link>
          <Link className={`tab ${location.pathname === "/vendors" ? "active" : ""}`} to="/vendors">
            Vendors
          </Link>
          <Link className={`tab ${location.pathname === "/attestation" ? "active" : ""}`} to="/attestation">
            Compliance Attestation
          </Link>
        </div>
        {status?.contractId && (
          <a
            className="contract-pill"
            href={`https://stellar.expert/explorer/testnet/contract/${status.contractId}`}
            target="_blank"
            rel="noreferrer"
          >
            <span className="live-dot" />
            {status.contractId.slice(0, 6)}…{status.contractId.slice(-4)}
          </a>
        )}
      </div>
      <div className="content" key={location.pathname}>
        {status && !status.ready ? <BootstrapGate status={status} /> : <Outlet />}
      </div>
    </div>
  );
}

function BootstrapGate({ status }: { status: Status }) {
  return (
    <div className="panel">
      <h2>{status.error ? "Bootstrap failed" : "Deploying to Stellar testnet..."}</h2>
      <p className="hint">
        {status.error
          ? "The orchestrator could not stand up a real contract. See the log below."
          : "Building the contract, deploying it, installing the real verification keys, and registering agents -- all real testnet transactions. This takes 1-3 minutes."}
      </p>
      <div className="mono" style={{ fontSize: 12, lineHeight: 1.8, color: "var(--text-dim)" }}>
        {status.log.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
      {status.error && <div className="error-banner">{status.error}</div>}
    </div>
  );
}

function App() {
  return (
    <EventsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route element={<AppShell />}>
            <Route path="/console" element={<TreasuryConsole />} />
            <Route path="/feed" element={<LiveSealedFeed />} />
            <Route path="/attestation" element={<AttestationScreen />} />
            <Route path="/vendors" element={<VendorsScreen />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </EventsProvider>
  );
}

export default App;
