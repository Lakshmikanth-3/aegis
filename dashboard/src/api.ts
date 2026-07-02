const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "http://localhost:4000";

export interface PolicyAgent {
  id: number;
  name: string;
  description: string;
  roleBadge: string;
  allocatedBudget: number;
  perTxCap: number;
  nonce: number;
  registrationTxHash: string | null;
}

export interface Policy {
  admin: string;
  contractId: string;
  perTxCap: number;
  perTxCapScope: "treasury-wide";
  vendors: string[];
  allowlistRoot: string;
  agents: PolicyAgent[];
}

export interface PaymentEvent {
  seq: number;
  agentId: number;
  agentName: string;
  amount: number;
  vendor: string;
  vendorId: string;
  timestamp: string;
  status: "verified" | "rejected";
  rejectReason?: "over_cap" | "vendor_not_allowlisted";
  rejectDetail?: string;
  oldCommitment: string;
  newCommitment: string;
  nonceUsed: number;
  proofBytes: number;
  txHash: string | null;
  explorerUrl: string | null;
}

export interface Summary {
  settled: number;
  violationsReachedSettlement: number;
  rejected: number;
  total: number;
}

export interface Status {
  ready: boolean;
  error: string | null;
  log: string[];
  contractId: string | null;
  admin: string | null;
}

export interface VendorEntry {
  name: string;
  description: string;
  active: boolean;
}

export interface VendorCatalog {
  contractId: string;
  allowlistRoot: string;
  merkleDepth: number;
  merkleLeaves: number;
  vendors: VendorEntry[];
}

export type AttestationPeriod = "24h" | "7d" | "session";

export interface Attestation {
  agentId: number;
  agentName: string;
  periodLabel: string;
  periodType: AttestationPeriod;
  periodStartTimestamp: string;
  periodClamped: boolean;
  maxSpendClaim: number;
  vendorComplianceOk: boolean;
  startingCommitment: string;
  endingCommitment: string;
  proofBytes: number;
  txHash: string | null;
  explorerUrl: string | null;
  verifyToken: string;
  generatedAt: string;
  contractId: string;
}

export async function fetchStatus(): Promise<Status> {
  const res = await fetch(`${API_BASE}/api/status`);
  if (!res.ok) throw new Error(`GET /api/status failed: ${res.status}`);
  return res.json();
}

export async function fetchPolicy(): Promise<Policy> {
  const res = await fetch(`${API_BASE}/api/policy`);
  if (!res.ok) throw new Error(`GET /api/policy failed: ${res.status}`);
  return res.json();
}

export async function fetchSummary(): Promise<Summary> {
  const res = await fetch(`${API_BASE}/api/summary`);
  if (!res.ok) throw new Error(`GET /api/summary failed: ${res.status}`);
  return res.json();
}

export async function createAgent(name: string, startingBudget: number, perTxCap: number) {
  const res = await fetch(`${API_BASE}/api/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, startingBudget, perTxCap }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `POST /api/agents failed: ${res.status}`);
  return res.json();
}

export async function updatePolicy(perTxCap: number, vendors: string[]) {
  const res = await fetch(`${API_BASE}/api/policy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ perTxCap, vendors }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `POST /api/policy failed: ${res.status}`);
  return res.json();
}

export async function fetchVendors(): Promise<VendorCatalog> {
  const res = await fetch(`${API_BASE}/api/vendors`);
  if (!res.ok) throw new Error(`GET /api/vendors failed: ${res.status}`);
  return res.json();
}

export async function updateAllowlist(action: "add" | "remove", vendor: string) {
  const res = await fetch(`${API_BASE}/api/update-allowlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, vendor }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `POST /api/update-allowlist failed: ${res.status}`);
  return res.json();
}

export async function pay(agentName: string, vendor: string, amount: number): Promise<PaymentEvent> {
  const res = await fetch(`${API_BASE}/api/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentName, vendor, amount }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `POST /api/pay failed: ${res.status}`);
  return res.json();
}

export async function startSimulation() {
  const res = await fetch(`${API_BASE}/api/simulate/start`, { method: "POST" });
  return res.ok;
}

export function subscribeFeed(onEvent: (e: PaymentEvent) => void): () => void {
  const source = new EventSource(`${API_BASE}/api/feed`);
  source.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data));
    } catch {
      // ignore malformed frames
    }
  };
  return () => source.close();
}

export async function startAttestationPeriod(agentId: number) {
  const res = await fetch(`${API_BASE}/api/attestation/${agentId}/start`, { method: "POST" });
  if (!res.ok) throw new Error((await res.json()).error ?? `start attestation period failed: ${res.status}`);
  return res.json();
}

export async function generateAttestation(
  agentId: number,
  periodLabel: string,
  period: AttestationPeriod = "session"
): Promise<Attestation> {
  const res = await fetch(`${API_BASE}/api/attestation/${agentId}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ periodLabel, period }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? `generate attestation failed: ${res.status}`);
  return res.json();
}

export async function verifyAttestation(token: string): Promise<Attestation> {
  const res = await fetch(`${API_BASE}/api/attestation/verify/${token}`);
  if (!res.ok) throw new Error((await res.json()).error ?? `verify attestation failed: ${res.status}`);
  return res.json();
}
