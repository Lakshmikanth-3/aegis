/**
 * Phase 2 demo run: plays the 12-payment DEMO_SCENARIO (scenario.ts)
 * through the real proof pipeline, one payment at a time, via the
 * orchestrator's own POST /api/pay endpoint. Every step is a real
 * nargo execute + bb prove attempt and (if a witness could be solved) a
 * real submit_spend Stellar testnet transaction -- there is no simulated
 * or mocked pass/fail anywhere in this script; the orchestrator's
 * treasury.ts always routes both over-cap and unknown-vendor rejections
 * through the real circuit (see poseidon.ts's proofForUnknown).
 *
 * Amounts are logged here (server-side console only) for demo narration --
 * never surfaced by the dashboard UI, which only ever shows pass/fail.
 *
 * Usage: npm run demo   (orchestrator must be running + seeded)
 */
import { DEMO_SCENARIO } from "./scenario.js";

const API_BASE = process.env.AEGIS_API_BASE ?? "http://localhost:4000";

interface PaymentEvent {
  agentName: string;
  vendor: string;
  amount: number;
  status: "verified" | "rejected";
  rejectReason?: string;
  rejectDetail?: string;
  txHash: string | null;
  explorerUrl: string | null;
}

interface Status {
  ready: boolean;
  error: string | null;
}

async function waitForReady(timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${API_BASE}/api/status`);
    const status = (await res.json()) as Status;
    if (status.error) throw new Error(`orchestrator bootstrap failed: ${status.error}`);
    if (status.ready) return;
    console.log("Waiting for orchestrator to be ready...");
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("timed out waiting for orchestrator to become ready");
}

async function pay(agentName: string, vendor: string, amount: number): Promise<PaymentEvent> {
  const res = await fetch(`${API_BASE}/api/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentName, vendor, amount }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `POST /api/pay failed: ${res.status}`);
  return body;
}

async function main() {
  console.log(`Running Aegis Phase 2 demo scenario against ${API_BASE}...\n`);
  await waitForReady();

  let settled = 0;
  let rejected = 0;

  for (let i = 0; i < DEMO_SCENARIO.length; i++) {
    const step = DEMO_SCENARIO[i];
    const label = `[${i + 1}/${DEMO_SCENARIO.length}] ${step.agentName} -> ${step.vendor}`;
    console.log(`${label} (amount $${step.amount}, expected ${step.expected})...`);

    const event = await pay(step.agentName, step.vendor, step.amount);
    const outcome = event.status === "verified" ? "pass" : "fail";
    const matched = outcome === step.expected ? "OK" : "MISMATCH";

    if (event.status === "verified") {
      settled++;
      console.log(`  -> VERIFIED [${matched}] tx: ${event.explorerUrl}`);
    } else {
      rejected++;
      console.log(`  -> REJECTED [${matched}] reason: ${event.rejectReason} -- ${event.rejectDetail}`);
    }
  }

  console.log(`\nDone. ${settled} settled, ${rejected} circuit-level rejections (of ${DEMO_SCENARIO.length} attempted).`);
  const expectedSettled = DEMO_SCENARIO.filter((s) => s.expected === "pass").length;
  const expectedRejected = DEMO_SCENARIO.filter((s) => s.expected === "fail").length;
  if (settled !== expectedSettled || rejected !== expectedRejected) {
    console.error(
      `WARNING: expected ${expectedSettled} settled / ${expectedRejected} rejected -- actual results diverged from the scripted scenario.`
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("demo-run.ts failed:", err);
  process.exit(1);
});
