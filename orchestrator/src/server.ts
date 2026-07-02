import express from "express";
import cors from "cors";
import { Treasury, type PaymentEvent } from "./treasury.js";
import { DEMO_SCENARIO } from "./scenario.js";
import { VENDORS } from "./roster.js";

const VENDOR_DESCRIPTIONS = new Map(VENDORS.map((v) => [v.name, v.description]));
const MERKLE_DEPTH = 3;
const MERKLE_LEAVES = 8;

const app = express();
app.use(cors());
app.use(express.json());

const treasury = new Treasury();
const bootstrapLog: string[] = [];
let bootstrapDone = false;
let bootstrapError: string | null = null;

// Agents are no longer auto-registered here with placeholder names --
// run `orchestrator/src/seed.ts` after bootstrap to populate the real
// professional agent/vendor roster (see roster.ts) via these same
// on-chain-backed endpoints.
async function bootstrapAndSeed() {
  try {
    await treasury.bootstrap((msg) => {
      bootstrapLog.push(msg);
      console.log(msg);
    });
    bootstrapLog.push("Contract deployed with the roster vendor allow-list. Run seed.ts to register agents.");
    bootstrapDone = true;
  } catch (err) {
    bootstrapError = err instanceof Error ? err.message : String(err);
    bootstrapLog.push(`FATAL: ${bootstrapError}`);
  }
}
bootstrapAndSeed();

type SseClient = express.Response;
const sseClients = new Set<SseClient>();

function broadcast(event: PaymentEvent) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) client.write(payload);
}

function requireReady(res: express.Response): boolean {
  if (bootstrapError) {
    res.status(503).json({ error: `bootstrap failed: ${bootstrapError}` });
    return false;
  }
  if (!bootstrapDone) {
    res.status(503).json({ error: "still deploying to Stellar testnet, see /api/status" });
    return false;
  }
  return true;
}

app.get("/api/status", (_req, res) => {
  res.json({
    ready: bootstrapDone,
    error: bootstrapError,
    log: bootstrapLog,
    contractId: treasury.contractId || null,
    admin: treasury.admin || null,
  });
});

app.get("/api/policy", (_req, res) => {
  if (!requireReady(res)) return;
  res.json({
    admin: treasury.admin,
    contractId: treasury.contractId,
    perTxCap: treasury.perTxCap,
    perTxCapScope: "treasury-wide",
    vendors: treasury.vendors,
    allowlistRoot: treasury.allowlistRootHex,
    agents: [...treasury.agents.values()].map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      roleBadge: a.roleBadge,
      allocatedBudget: a.allocatedBudget,
      perTxCap: a.perTxCap,
      nonce: a.nonce,
      registrationTxHash: a.registrationTxHash,
    })),
  });
});

app.get("/api/agents/:id", (req, res) => {
  if (!requireReady(res)) return;
  const agent = treasury.agents.get(Number(req.params.id));
  if (!agent) return res.status(404).json({ error: "not found" });
  res.json({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    roleBadge: agent.roleBadge,
    perTxCap: agent.perTxCap,
    nonce: agent.nonce,
    // Remaining balance is only ever exposed via this agent-scoped detail
    // route, matching the PRD's "shielded by default everywhere except
    // the owner's own detail view" rule.
    remainingBalance: agent.balance.toString(),
    currentCommitment: treasury.commitmentOf(agent).toString(16),
  });
});

app.post("/api/agents", async (req, res) => {
  if (!requireReady(res)) return;
  const { name, startingBudget, perTxCap, description, roleBadge } = req.body ?? {};
  if (typeof name !== "string" || typeof startingBudget !== "number") {
    return res.status(400).json({ error: "name (string) and startingBudget (number) are required" });
  }
  try {
    const agent = await treasury.registerAgent(
      name,
      startingBudget,
      perTxCap,
      typeof description === "string" ? description : "",
      typeof roleBadge === "string" ? roleBadge : ""
    );
    res.status(201).json({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      roleBadge: agent.roleBadge,
      allocatedBudget: agent.allocatedBudget,
      registrationTxHash: agent.registrationTxHash,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/policy", async (req, res) => {
  if (!requireReady(res)) return;
  const { perTxCap, vendors } = req.body ?? {};
  try {
    let perTxCapTxHash: string | null = null;
    let vendorsTxHash: string | null = null;
    if (typeof perTxCap === "number") perTxCapTxHash = await treasury.setPerTxCap(perTxCap);
    if (Array.isArray(vendors)) vendorsTxHash = await treasury.setVendors(vendors);
    res.json({
      perTxCap: treasury.perTxCap,
      perTxCapScope: "treasury-wide",
      vendors: treasury.vendors,
      allowlistRoot: treasury.allowlistRootHex,
      perTxCapTxHash,
      vendorsTxHash,
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// Enriched vendor catalog for the /vendors screen: merges the known
// roster descriptions (roster.ts) with live on-chain allow-list
// membership, plus the circuit's fixed Merkle capacity. A vendor added
// ad-hoc via /api/update-allowlist that isn't in the original roster
// still shows up here (with no description) once it's active.
app.get("/api/vendors", (_req, res) => {
  if (!requireReady(res)) return;
  const known = new Set(VENDOR_DESCRIPTIONS.keys());
  const active = new Set(treasury.vendors);
  const names = new Set([...known, ...active]);
  res.json({
    contractId: treasury.contractId,
    allowlistRoot: treasury.allowlistRootHex,
    merkleDepth: MERKLE_DEPTH,
    merkleLeaves: MERKLE_LEAVES,
    vendors: [...names].map((name) => ({
      name,
      description: VENDOR_DESCRIPTIONS.get(name) ?? "",
      active: active.has(name),
    })),
  });
});

// Adds or removes one vendor from the real on-chain allow-list: rebuilds
// the Merkle tree over the resulting vendor set and calls update_policy
// with the new root, via the exact same treasury.setVendors path
// POST /api/policy uses -- this endpoint just gives the /vendors screen
// single-vendor add/remove semantics instead of requiring the full list.
app.post("/api/update-allowlist", async (req, res) => {
  if (!requireReady(res)) return;
  const { action, vendor } = req.body ?? {};
  if ((action !== "add" && action !== "remove") || typeof vendor !== "string") {
    return res.status(400).json({ error: 'action ("add"|"remove") and vendor (string) are required' });
  }
  const current = treasury.vendors;
  let next: string[];
  if (action === "add") {
    if (current.includes(vendor)) return res.status(400).json({ error: `"${vendor}" is already in the allow-list` });
    next = [...current, vendor];
  } else {
    if (!current.includes(vendor)) return res.status(400).json({ error: `"${vendor}" is not in the allow-list` });
    next = current.filter((v) => v !== vendor);
  }
  try {
    const txHash = await treasury.setVendors(next);
    res.json({
      action,
      vendor,
      allowlistRoot: treasury.allowlistRootHex,
      vendorsTxHash: txHash,
      vendors: treasury.vendors,
    });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

app.get("/api/summary", (_req, res) => res.json(treasury.summary()));

app.post("/api/attestation/:agentId/start", async (req, res) => {
  if (!requireReady(res)) return;
  const agent = treasury.agents.get(Number(req.params.agentId));
  if (!agent) return res.status(404).json({ error: "agent not found" });
  await treasury.startAttestationPeriod(agent);
  res.json({ started: true, agentId: agent.id });
});

app.post("/api/attestation/:agentId/generate", async (req, res) => {
  if (!requireReady(res)) return;
  const agent = treasury.agents.get(Number(req.params.agentId));
  if (!agent) return res.status(404).json({ error: "agent not found" });
  const periodLabel = typeof req.body?.periodLabel === "string" ? req.body.periodLabel : "current-period";
  const period = ["24h", "7d", "session"].includes(req.body?.period) ? req.body.period : "session";
  try {
    const attestation = await treasury.generateAttestation(agent, periodLabel, period);
    res.json(attestation);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Deliberately does NOT touch `treasury`'s live agent state -- it only
// looks up the previously-generated, already-public attestation record by
// its token, the same way a real verifier would only need the proof +
// public inputs a QR code points to, not access to Aegis's own database.
app.get("/api/attestation/verify/:token", (req, res) => {
  const attestation = treasury.attestations.get(req.params.token);
  if (!attestation) return res.status(404).json({ error: "unknown attestation token" });
  res.json(attestation);
});

app.get("/api/feed", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

function agentByName(name: string) {
  return [...treasury.agents.values()].find((a) => a.name === name);
}

// Single real payment: a real nargo+bb proof attempt, then (if the circuit
// could solve a witness) a real submit_spend testnet transaction. Used by
// demo-run.ts to drive the Phase 2 scenario step-by-step with full detail,
// and by the dashboard for one-off manual payments.
app.post("/api/pay", async (req, res) => {
  if (!requireReady(res)) return;
  const { agentName, vendor, amount } = req.body ?? {};
  if (typeof agentName !== "string" || typeof vendor !== "string" || typeof amount !== "number") {
    return res.status(400).json({ error: "agentName (string), vendor (string), amount (number) are required" });
  }
  const agent = agentByName(agentName);
  if (!agent) return res.status(404).json({ error: `no agent named "${agentName}"` });
  try {
    const event = await treasury.attemptPayment(agent, amount, vendor);
    broadcast(event);
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

let running = false;
app.post("/api/simulate/start", async (req, res) => {
  if (!requireReady(res)) return;
  if (running) return res.status(409).json({ error: "already running" });
  if (treasury.agents.size === 0) {
    return res.status(409).json({ error: "no agents registered yet -- run seed.ts first" });
  }
  running = true;
  res.status(202).json({ started: true, steps: DEMO_SCENARIO.length });

  (async () => {
    for (const step of DEMO_SCENARIO) {
      const agent = agentByName(step.agentName);
      if (!agent) continue;
      try {
        const event = await treasury.attemptPayment(agent, step.amount, step.vendor);
        broadcast(event);
      } catch (err) {
        console.error("payment attempt failed unexpectedly:", err);
      }
    }
    running = false;
  })();
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(PORT, () => {
  console.log(`Aegis orchestrator listening on http://localhost:${PORT}`);
  console.log("Bootstrapping real Stellar testnet contract in the background -- see /api/status");
});
