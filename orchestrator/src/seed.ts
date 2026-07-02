/**
 * Idempotent seed script for Aegis's professional demo roster (Phase 1).
 *
 * Talks to the already-running orchestrator over its own HTTP API
 * (localhost:4000) rather than re-implementing any chain logic -- every
 * call here goes through treasury.ts's real registerAgent/setVendors,
 * which shell out to the real `stellar-cli` in WSL via chain.ts. There is
 * no separate/parallel code path: this script exercises the exact same
 * on-chain calls the dashboard would trigger.
 *
 * Safe to run multiple times: it diffs the live /api/policy state against
 * roster.ts before issuing any request, so a second run performs zero
 * on-chain transactions and just confirms the roster already matches.
 *
 * Usage: npm run seed   (orchestrator must already be running + ready)
 */
import { AGENTS, VENDOR_NAMES } from "./roster.js";

const API_BASE = process.env.AEGIS_API_BASE ?? "http://localhost:4000";

interface PolicyAgent {
  id: number;
  name: string;
  description: string;
  roleBadge: string;
  allocatedBudget: number;
  perTxCap: number;
  nonce: number;
  registrationTxHash: string | null;
}

interface Policy {
  admin: string;
  contractId: string;
  perTxCap: number;
  vendors: string[];
  allowlistRoot: string;
  agents: PolicyAgent[];
}

interface Status {
  ready: boolean;
  error: string | null;
  contractId: string | null;
}

async function waitForReady(timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${API_BASE}/api/status`);
    const status = (await res.json()) as Status;
    if (status.error) throw new Error(`orchestrator bootstrap failed: ${status.error}`);
    if (status.ready) {
      console.log(`Orchestrator ready. Contract: ${status.contractId}`);
      return;
    }
    console.log("Waiting for orchestrator bootstrap (contract build + deploy)...");
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("timed out waiting for orchestrator to become ready");
}

async function getPolicy(): Promise<Policy> {
  const res = await fetch(`${API_BASE}/api/policy`);
  if (!res.ok) throw new Error(`GET /api/policy failed: ${res.status}`);
  return res.json();
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function ensureVendors(policy: Policy): Promise<void> {
  if (arraysEqual(policy.vendors, VENDOR_NAMES)) {
    console.log(`Vendor allow-list already matches roster (root ${policy.allowlistRoot}) -- skipping update_policy.`);
    return;
  }
  console.log(`Rebuilding Merkle allow-list with ${VENDOR_NAMES.length} vendors: ${VENDOR_NAMES.join(", ")}`);
  const res = await fetch(`${API_BASE}/api/policy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vendors: VENDOR_NAMES }),
  });
  if (!res.ok) throw new Error(`POST /api/policy failed: ${(await res.json()).error ?? res.status}`);
  const result = await res.json();
  console.log(`New allow-list root: ${result.allowlistRoot}`);
  console.log(`update_policy tx: https://stellar.expert/explorer/testnet/tx/${result.vendorsTxHash}`);
}

async function ensureAgents(policy: Policy): Promise<void> {
  const existingNames = new Set(policy.agents.map((a) => a.name));
  for (const seed of AGENTS) {
    if (existingNames.has(seed.name)) {
      console.log(`Agent "${seed.name}" already registered -- skipping register_agent.`);
      continue;
    }
    console.log(`Registering "${seed.name}" (${seed.roleBadge}, $${seed.startingBudget.toLocaleString()})...`);
    const res = await fetch(`${API_BASE}/api/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: seed.name,
        startingBudget: seed.startingBudget,
        description: seed.description,
        roleBadge: seed.roleBadge,
      }),
    });
    if (!res.ok) throw new Error(`POST /api/agents failed for ${seed.name}: ${(await res.json()).error ?? res.status}`);
    const result = await res.json();
    console.log(`  -> agent id ${result.id}, register_agent tx: https://stellar.expert/explorer/testnet/tx/${result.registrationTxHash}`);
  }
}

async function main() {
  console.log(`Seeding Aegis roster against ${API_BASE}...\n`);
  await waitForReady();

  const before = await getPolicy();
  await ensureVendors(before);
  await ensureAgents(before);

  const after = await getPolicy();
  console.log("\nFinal on-chain state:");
  console.log(`  Contract: ${after.contractId}`);
  console.log(`  Vendors (${after.vendors.length}): ${after.vendors.join(", ")}`);
  console.log(`  Allow-list root: ${after.allowlistRoot}`);
  console.log(`  Per-tx cap (treasury-wide): ${after.perTxCap}`);
  for (const a of after.agents) {
    console.log(`  Agent ${a.id}: ${a.name} [${a.roleBadge}] -- $${a.allocatedBudget.toLocaleString()} allocated`);
  }
}

main().catch((err) => {
  console.error("seed.ts failed:", err);
  process.exit(1);
});
