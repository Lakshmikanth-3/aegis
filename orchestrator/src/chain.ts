import path from "node:path";
import { runInWsl, winToWslPath } from "./wsl.js";
import { SerialQueue } from "./queue.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const CONTRACT_DIR = path.join(REPO_ROOT, "aegis-contract");
const CONTRACT_DIR_WSL = winToWslPath(CONTRACT_DIR);

const ADMIN_IDENTITY = "aegis-admin";
const NETWORK = "testnet";

// All chain calls are serialized: stellar-cli sequences a single source
// account's transactions by its on-chain sequence number, and firing two
// invokes from the same identity concurrently races that number.
const chainQueue = new SerialQueue();

export interface InvokeResult {
  raw: string;
  txHash: string | null;
}

function extractTxHash(text: string): string | null {
  const m = text.match(/explorer\/testnet\/tx\/([0-9a-f]{64})/i);
  return m ? m[1] : null;
}

async function invoke(contractId: string, args: string): Promise<InvokeResult> {
  return chainQueue.run(async () => {
    const { stdout, stderr } = await runInWsl(
      `stellar contract invoke --id ${contractId} --source ${ADMIN_IDENTITY} --network ${NETWORK} -- ${args}`,
      90_000
    );
    const combined = stdout + "\n" + stderr;
    return { raw: combined, txHash: extractTxHash(combined) };
  });
}

export async function ensureAdminIdentity(): Promise<string> {
  try {
    const { stdout } = await runInWsl(`stellar keys address ${ADMIN_IDENTITY}`);
    return stdout.trim();
  } catch {
    await runInWsl(`stellar keys generate ${ADMIN_IDENTITY} --network ${NETWORK} --fund`, 60_000);
    const { stdout } = await runInWsl(`stellar keys address ${ADMIN_IDENTITY}`);
    return stdout.trim();
  }
}

export async function buildContract(): Promise<void> {
  await runInWsl(`cd ${CONTRACT_DIR_WSL} && stellar contract build`, 180_000);
}

export async function deployContract(): Promise<{ contractId: string; txHash: string | null }> {
  const { stdout, stderr } = await runInWsl(
    `cd ${CONTRACT_DIR_WSL} && stellar contract deploy ` +
      `--wasm target/wasm32v1-none/release/aegis_treasury.wasm ` +
      `--source ${ADMIN_IDENTITY} --network ${NETWORK} --`,
    90_000
  );
  const combined = stdout + "\n" + stderr;
  const idMatch = stdout.trim().split("\n").filter(Boolean).pop();
  if (!idMatch || !/^C[A-Z0-9]{55}$/.test(idMatch)) {
    throw new Error(`could not parse deployed contract id from:\n${combined}`);
  }
  return { contractId: idMatch, txHash: extractTxHash(combined) };
}

export async function initContract(
  contractId: string,
  vendorAllowlistRootHex: string,
  vkHex: string
): Promise<InvokeResult> {
  return invoke(
    contractId,
    `init --admin ${ADMIN_IDENTITY} --vendor_allowlist_root ${vendorAllowlistRootHex} --vk_bytes ${vkHex}`
  );
}

export async function initAttestationVk(contractId: string, vkHex: string): Promise<InvokeResult> {
  return invoke(contractId, `init_attestation_vk --admin ${ADMIN_IDENTITY} --vk_bytes ${vkHex}`);
}

export async function registerAgent(
  contractId: string,
  agentId: number,
  initialCommitmentHex: string
): Promise<InvokeResult> {
  return invoke(
    contractId,
    `register_agent --admin ${ADMIN_IDENTITY} --agent_id ${agentId} --initial_commitment ${initialCommitmentHex}`
  );
}

export async function updatePolicy(
  contractId: string,
  perTxCap: number,
  allowlistRootHex: string
): Promise<InvokeResult> {
  return invoke(
    contractId,
    `update_policy --admin ${ADMIN_IDENTITY} --per_tx_cap ${perTxCap} --new_allowlist_root ${allowlistRootHex}`
  );
}

export async function submitSpend(
  contractId: string,
  agentId: number,
  proofHex: string,
  publicInputs: {
    agentId: number;
    agentNonce: number;
    newBalanceCommitment: string;
    oldBalanceCommitment: string;
    perTxCap: number;
    vendorAllowlistRoot: string;
  }
): Promise<InvokeResult> {
  const pubJson = JSON.stringify({
    agent_id: publicInputs.agentId,
    agent_nonce: publicInputs.agentNonce,
    new_balance_commitment: publicInputs.newBalanceCommitment,
    old_balance_commitment: publicInputs.oldBalanceCommitment,
    per_tx_cap: publicInputs.perTxCap,
    vendor_allowlist_root: publicInputs.vendorAllowlistRoot,
  }).replace(/"/g, '\\"');
  return invoke(
    contractId,
    `submit_spend --agent_id ${agentId} --proof ${proofHex} --public_inputs "${pubJson}"`
  );
}

export async function startAttestationPeriod(contractId: string, agentId: number): Promise<InvokeResult> {
  return invoke(contractId, `start_attestation_period --admin ${ADMIN_IDENTITY} --agent_id ${agentId}`);
}

/** Directly sets the on-chain PeriodStartCommitment to a real historical
 * commitment value (see set_period_start_commitment in lib.rs), so an
 * attestation can be measured from an actual past point in time (e.g.
 * "last 24 hours") rather than only from whenever start_attestation_period
 * was last called. */
export async function setPeriodStartCommitment(
  contractId: string,
  agentId: number,
  commitmentHex: string
): Promise<InvokeResult> {
  return invoke(
    contractId,
    `set_period_start_commitment --admin ${ADMIN_IDENTITY} --agent_id ${agentId} --commitment ${commitmentHex}`
  );
}

export async function verifyAttestation(
  contractId: string,
  agentId: number,
  claim: { maxSpend: number; periodLabel: number },
  proofHex: string
): Promise<InvokeResult> {
  const claimJson = JSON.stringify({
    max_spend: claim.maxSpend,
    period_label: claim.periodLabel,
  }).replace(/"/g, '\\"');
  return invoke(
    contractId,
    `verify_attestation --agent_id ${agentId} --claim "${claimJson}" --proof ${proofHex}`
  );
}

export async function getCommitment(contractId: string, agentId: number): Promise<string | null> {
  const { stdout } = await runInWsl(
    `stellar contract invoke --id ${contractId} --source ${ADMIN_IDENTITY} --network ${NETWORK} --send=no -- get_commitment --agent_id ${agentId}`
  );
  const m = stdout.match(/"?([0-9a-f]{64})"?/i);
  return m ? m[1] : null;
}

export async function getNonce(contractId: string, agentId: number): Promise<number> {
  const { stdout } = await runInWsl(
    `stellar contract invoke --id ${contractId} --source ${ADMIN_IDENTITY} --network ${NETWORK} --send=no -- get_nonce --agent_id ${agentId}`
  );
  const m = stdout.trim().match(/\d+/);
  return m ? Number(m[0]) : 0;
}
